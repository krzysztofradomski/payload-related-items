import type { Payload, PayloadRequest } from 'payload'

import type { SanitizedConfig, SourceAdapter, SourceRow } from '../types.js'

import { parseKeywords } from './parseEmbedding.js'
import { readSourceRelationship } from './relationship.js'

interface SearchRow {
  [key: string]: unknown
  id: number | string
}

export interface SearchPluginSourceOptions {
  config: SanitizedConfig
  /**
   * Extra fields to read from the source rows so they appear on RelatedItem.source
   * (title, slug, description, etc.). Without this the plugin still works, but
   * callers have to fetch display data themselves.
   */
  displayFields?: string[]
  /** Page size for paginated reads. Default: 1000. */
  pageSize?: number
}

/**
 * Builds a source adapter that reads candidate rows from the collection populated
 * by `@payloadcms/plugin-search`. Every row must include:
 *
 *   1. A relationship field (default `doc`) with shape `{ relationTo, value }`.
 *   2. At least one keyword field per the sanitized config (default: `keywords`).
 *
 * Paginates through the entire collection — OK up to ~50–100k rows; past that
 * flip on {@link SanitizedConfig.precompute} and serve from the sidecar.
 */
export function createSearchPluginSource(options: SearchPluginSourceOptions): SourceAdapter {
  const { config } = options
  const pageSize = options.pageSize ?? 1000

  // Collect every field we need to read off each source row.
  const fieldNames = new Set<string>([config.source.relationshipField])
  for (const col of Object.values(config.collections)) {
    for (const f of col.fields) {fieldNames.add(f.name)}
    if (col.recency?.field) {fieldNames.add(col.recency.field)}
  }
  for (const displayField of options.displayFields ?? []) {
    fieldNames.add(displayField)
  }

  const configuredCollections = new Set(Object.keys(config.collections))

  return {
    findOne: (args) => findSourceRowForDoc({ ...args, config }),
    list: async ({ filter, payload, req }) => {
      const entries: SourceRow[] = []
      let page = 1
      let hasMore = true

      while (hasMore) {
        const result = await payload.find({
          collection: config.source.collection,
          depth: 0,
          limit: pageSize,
          overrideAccess: req == null,
          page,
          req,
          where: filter,
        })

        for (const doc of result.docs as SearchRow[]) {
          const row = toSourceRow(doc, config)
          if (!row) {continue}
          // Drop rows from collections we don't serve related-items for — they
          // can't be candidates in any configured collection's query.
          if (!configuredCollections.has(row.collection)) {continue}
          entries.push(row)
        }

        hasMore = result.hasNextPage
        page++
      }

      return entries
    },
  }
}

/**
 * Loads a single source row for a given original collection + doc id. Used by the
 * public `getRelated` API to look up the query document before fetching candidates.
 */
export async function findSourceRowForDoc(args: {
  collection: string
  config: SanitizedConfig
  id: number | string
  payload: Payload
  req?: PayloadRequest
}): Promise<null | SourceRow> {
  const { id, collection, config, payload, req } = args
  const relField = config.source.relationshipField
  const result = await payload.find({
    collection: config.source.collection,
    depth: 0,
    limit: 1,
    overrideAccess: req == null,
    req,
    where: {
      and: [
        { [`${relField}.relationTo`]: { equals: collection } },
        { [`${relField}.value`]: { equals: id } },
      ],
    },
  })

  const doc = (result.docs as SearchRow[])[0]
  if (!doc) {return null}
  return toSourceRow(doc, config)
}

function toSourceRow(doc: SearchRow, config: SanitizedConfig): null | SourceRow {
  const relationship = readSourceRelationship(doc, config.source.relationshipField)
  if (!relationship) {return null}

  const keywordsByField: Record<string, string[]> = {}
  const collectionConfig = config.collections[relationship.collection]
  if (collectionConfig) {
    for (const field of collectionConfig.fields) {
      keywordsByField[field.name] = parseKeywords(doc[field.name])
    }
  } else {
    // Unknown collection in this row — still parse the default field so the
    // row can serve as a candidate when cross-collection is enabled from a
    // different, configured source collection.
    keywordsByField[config.source.defaultKeywordsField] = parseKeywords(
      doc[config.source.defaultKeywordsField],
    )
  }

  const recencyDate = collectionConfig?.recency?.field
    ? (doc[collectionConfig.recency.field] as Date | null | string | undefined) ?? null
    : null

  return {
    collection: relationship.collection,
    docId: relationship.docId,
    keywordsByField,
    raw: doc,
    recencyDate,
    sourceId: doc.id,
  }
}

