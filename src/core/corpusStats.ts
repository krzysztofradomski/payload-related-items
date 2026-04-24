import type { ScorerContext, SourceRow } from '../types.js'

/**
 * Computes document frequency + average keyword-list length for a given field
 * across the candidate corpus. Used by BM25 for IDF and length normalization.
 *
 * Cheap enough to recompute per query; amortized across all candidates in
 * that query. If this ever shows up in a profile, the per-field stats can
 * be cached alongside the source rows.
 */
export function buildCorpusStats(rows: ReadonlyArray<SourceRow>, fieldName: string): ScorerContext {
  const documentFrequency = new Map<string, number>()
  let totalLength = 0
  let totalDocs = 0

  for (const row of rows) {
    const tokens = row.keywordsByField[fieldName]
    if (!tokens || tokens.length === 0) {continue}
    totalDocs++
    totalLength += tokens.length

    const unique = new Set(tokens)
    for (const token of unique) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }

  return {
    avgDocLength: totalDocs > 0 ? totalLength / totalDocs : 0,
    documentFrequency,
    totalDocs,
  }
}
