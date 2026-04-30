import type { Payload, PayloadRequest } from 'payload'

import type { RelatedItem, SanitizedConfig, SourceRow } from '../types.js'

import { resolveRelated } from '../core/resolveRelated.js'
import { getRuntime } from '../runtime.js'

/**
 * Computes and writes top-K related items for a single source doc into the
 * sidecar collection. Upserts by (sourceCollection, sourceId).
 *
 * `rows` is optional — pass pre-fetched candidates when running a full rebuild
 * to avoid re-fetching the whole corpus for every doc.
 */
export async function precomputeFor(args: {
  collection: string
  config: SanitizedConfig
  id: number | string
  payload: Payload
  req?: PayloadRequest
  rows?: ReadonlyArray<SourceRow>
}): Promise<null | RelatedItem[]> {
  const { id, collection, config, payload, req } = args
  const runtime = getRuntime(payload)
  const collectionConfig = config.collections[collection]
  if (!collectionConfig) {return null}

  const items = await resolveRelated({
    id,
    collection,
    config,
    limit: config.precompute.topK,
    payload,
    req,
    rows: args.rows,
    source: runtime.source,
  })
  if (!items) {return null}

  await upsertSidecar({
    id: String(id),
    collection,
    computedAt: new Date().toISOString(),
    config,
    items,
    payload,
    req,
  })

  return items
}

/**
 * Removes any sidecar rows pointing at a deleted source document.
 */
export async function deletePrecomputedFor(args: {
  collection: string
  config: SanitizedConfig
  id: number | string
  payload: Payload
  req?: PayloadRequest
}): Promise<void> {
  const { id, collection, config, payload, req } = args
  await payload.delete({
    collection: config.precompute.collectionSlug,
    overrideAccess: true,
    req,
    where: {
      and: [
        { sourceCollection: { equals: collection } },
        { sourceId: { equals: String(id) } },
      ],
    },
  })
}

async function upsertSidecar(args: {
  collection: string
  computedAt: string
  config: SanitizedConfig
  id: string
  items: RelatedItem[]
  payload: Payload
  req?: PayloadRequest
}): Promise<void> {
  const { id, collection, computedAt, config, items, payload, req } = args
  const existing = await payload.find({
    collection: config.precompute.collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      and: [
        { sourceCollection: { equals: collection } },
        { sourceId: { equals: id } },
      ],
    },
  })

  const data = {
    computedAt,
    items,
    sourceCollection: collection,
    sourceId: id,
  }

  if (existing.docs[0]) {
    await payload.update({
      id: existing.docs[0].id,
      collection: config.precompute.collectionSlug,
      data,
      overrideAccess: true,
      req,
    })
  } else {
    await payload.create({
      collection: config.precompute.collectionSlug,
      data,
      overrideAccess: true,
      req,
    })
  }
}

/**
 * Full rebuild: iterate every source row, compute top-K, and upsert into the
 * sidecar. Callers: scheduled cron, one-off admin button, or manual script.
 *
 * Batches upserts by fetching the corpus once and reusing it for every doc.
 */
export async function rebuildRelatedIndex(args: {
  onProgress?: (progress: { processed: number; total: number }) => void
  payload: Payload
  req?: PayloadRequest
}): Promise<{ processed: number }> {
  const { payload, req } = args
  const runtime = getRuntime(payload)
  const { config } = runtime

  if (!config.precompute.enabled) {
    throw new Error(
      '[payload-related-items] rebuildRelatedIndex() called but precompute is disabled.',
    )
  }

  const rows = await runtime.source({ payload, req })

  // Group rows by original collection so we only rebuild docs whose collection is configured.
  const targets = rows.filter((row) => row.collection in config.collections)

  let processed = 0
  for (const row of targets) {
    try {
      await precomputeFor({
        id: row.docId,
        collection: row.collection,
        config,
        payload,
        req,
        rows,
      })
    } catch (err) {
      payload.logger.error?.(
        `[payload-related-items] Rebuild failed for ${row.collection}/${row.docId}: ${String(err)}`,
      )
    }
    processed++
    args.onProgress?.({ processed, total: targets.length })
  }

  return { processed }
}
