import type { SanitizedCollectionConfig, SourceRow } from '../types.js'

export interface FilterCandidatesArgs {
  config: SanitizedCollectionConfig
  crossCollectionOverride?: boolean
  excludeCollections?: ReadonlyArray<string>
  excludeIds?: ReadonlyArray<number | string>
  query: SourceRow
  rows: ReadonlyArray<SourceRow>
}

/**
 * Applies all pre-scoring filters to the candidate pool.
 *
 *   - Drops the query document itself (if excludeSelf).
 *   - Drops items from other collections (if crossCollection === false).
 *   - Drops items from `excludeCollections`.
 *   - Drops items whose original doc id is in `excludeIds`.
 *   - Drops rows with an empty primary-field keyword list (they can't contribute).
 */
export function filterCandidates(args: FilterCandidatesArgs): SourceRow[] {
  const { config, excludeCollections, excludeIds, query, rows } = args
  const crossCollection = args.crossCollectionOverride ?? config.crossCollection
  const primaryField = config.fields[0].name
  const excludedCollectionSet = new Set(excludeCollections ?? [])
  const excludedIdSet = new Set((excludeIds ?? []).map(String))
  const queryDocId = String(query.docId)
  const querySourceId = String(query.sourceId)

  return rows.filter((row) => {
    const sameOriginalDoc =
      String(row.docId) === queryDocId && row.collection === query.collection
    const sameSourceRow = String(row.sourceId) === querySourceId

    if (config.excludeSelf && (sameOriginalDoc || sameSourceRow)) {
      return false
    }
    if (!crossCollection && row.collection !== query.collection) {return false}
    if (row.collection === '') {return false}
    if (excludedCollectionSet.has(row.collection)) {return false}
    if (excludedIdSet.has(row.docId)) {return false}

    const primary = row.keywordsByField[primaryField]
    if (!primary || primary.length === 0) {return false}

    return true
  })
}
