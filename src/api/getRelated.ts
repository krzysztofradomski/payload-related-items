import type { Payload, PayloadRequest } from 'payload'

import type { GetRelatedOptions, RelatedItem } from '../types.js'

import { resolveRelated } from '../core/resolveRelated.js'
import { buildCacheKey, getRuntime } from '../runtime.js'
import { readPrecomputed } from '../sidecar/readPrecomputed.js'

/**
 * Returns a ranked list of related items for a given document.
 *
 * Resolution order:
 *   1. In-memory cache (unless `skipCache`).
 *   2. Precomputed sidecar collection (unless `skipPrecomputed` or precompute is off).
 *   3. Live computation against the source collection.
 *
 * The function always resolves with a valid array — an empty result simply means
 * no candidates cleared the configured minimum score threshold.
 */
export async function getRelated<
  TSource = Record<string, unknown>,
  TDoc = Record<string, unknown>,
>(options: GetRelatedOptions): Promise<RelatedItem<TSource, TDoc>[]> {
  const runtime = getRuntime(options.payload)
  const { config } = runtime

  const collectionConfig = config.collections[options.collection]
  if (!collectionConfig) {
    throw new Error(
      `[payload-related-items] Collection "${options.collection}" is not configured. ` +
        `Add it to the plugin's "collections" option.`,
    )
  }

  const cacheKey = buildCacheKey(options)
  const populateOpt = normalizePopulate(options.populate)

  if (!options.skipCache && runtime.cache) {
    const cached = runtime.cache.get(cacheKey)
    if (cached) {
      const populated = populateOpt
        ? await populateDocs(cached, populateOpt, options.payload, options.req)
        : cached
      return populated as RelatedItem<TSource, TDoc>[]
    }
  }

  if (!options.skipPrecomputed && config.precompute.enabled) {
    const precomputed = await readPrecomputed({
      id: options.id,
      collection: options.collection,
      config,
      limit: options.limit ?? collectionConfig.topK,
      payload: options.payload,
      req: options.req,
    })
    if (precomputed) {
      if (!options.skipCache && runtime.cache) {runtime.cache.set(cacheKey, precomputed)}
      const populated = populateOpt
        ? await populateDocs(precomputed, populateOpt, options.payload, options.req)
        : precomputed
      return populated as RelatedItem<TSource, TDoc>[]
    }
  }

  const results = await resolveRelated({
    id: options.id,
    collection: options.collection,
    config,
    crossCollection: options.crossCollection,
    excludeCollections: options.excludeCollections,
    excludeIds: options.excludeIds,
    filter: options.filter,
    limit: options.limit,
    minScore: options.minScore,
    payload: options.payload,
    req: options.req,
    scorer: options.scorer,
    source: runtime.source,
  })

  if (!results) {
    options.payload.logger.warn?.(
      `[payload-related-items] No source row found for ${options.collection}/${options.id}. ` +
        `Save the document once to trigger search-plugin sync.`,
    )
    return []
  }

  if (!options.skipCache && runtime.cache) {runtime.cache.set(cacheKey, results)}
  const finalResults = populateOpt
    ? await populateDocs(results, populateOpt, options.payload, options.req)
    : results
  return finalResults as RelatedItem<TSource, TDoc>[]
}

function normalizePopulate(
  populate: GetRelatedOptions['populate'],
): { depth: number } | null {
  if (!populate) {return null}
  if (populate === true) {return { depth: 0 }}
  return { depth: populate.depth ?? 0 }
}

/**
 * Batch-fetches originating docs for the given RelatedItem[]s and attaches
 * them as `doc`. Items are grouped by collection so we make at most one
 * `payload.find` call per collection.
 */
async function populateDocs<TSource>(
  items: RelatedItem<TSource>[],
  opts: { depth: number },
  payload: Payload,
  req?: PayloadRequest,
): Promise<RelatedItem<TSource>[]> {
  if (items.length === 0) {return items}

  const byCollection = new Map<string, Array<number | string>>()
  for (const it of items) {
    const bucket = byCollection.get(it.collection) ?? []
    bucket.push(it.id)
    byCollection.set(it.collection, bucket)
  }

  const docIndex = new Map<string, Record<string, unknown>>()
  await Promise.all(
    Array.from(byCollection.entries()).map(async ([collection, ids]) => {
      try {
        const result = await payload.find({
          collection: collection as never,
          depth: opts.depth,
          limit: ids.length,
          overrideAccess: req == null,
          pagination: false,
          req,
          where: { id: { in: ids } },
        })
        for (const d of result.docs as Array<{ id: number | string }>) {
          docIndex.set(`${collection}:${String(d.id)}`, d as Record<string, unknown>)
        }
      } catch (err) {
        payload.logger.warn?.(
          `[payload-related-items] Failed to populate docs for "${collection}": ${String(err)}`,
        )
      }
    }),
  )

  return items.map((it) => {
    const doc = docIndex.get(`${it.collection}:${String(it.id)}`)
    return doc ? { ...it, doc } : it
  })
}
