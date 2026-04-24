import type { ScorerFn } from '../types.js'

import { BM25_B, BM25_K1 } from '../defaults.js'

/**
 * BM25 similarity over keyword sets.
 *
 * Standard BM25 (Okapi) treats the query as a bag of terms and scores each
 * candidate document by summing per-term contributions:
 *
 *   score(q, d) = Σ_t∈q IDF(t) · (f(t,d) · (k1 + 1)) / (f(t,d) + k1 · (1 - b + b · |d| / avgdl))
 *
 * Where:
 *   - IDF(t) = ln((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
 *   - f(t,d) is the term frequency of t in candidate document d
 *   - |d| is candidate length, avgdl is the corpus average
 *   - k1 controls term-frequency saturation (default 1.2)
 *   - b controls length normalization (default 0.75)
 *
 * The raw sum is then squashed into [0, 1] with a smooth exponential mapping
 * so it combines cleanly with other scorers when multiple fields are blended.
 * Ranking within a single scorer is unaffected by the squash.
 *
 * Quality notes:
 *   - BM25 dramatically outperforms Jaccard on real corpora because it
 *     down-weights common keywords via IDF.
 *   - Requires corpus statistics (document frequency, avg length), which the
 *     core pipeline computes once per query and reuses across candidates.
 */
export const bm25: ScorerFn = (query, candidate, ctx) => {
  if (query.length === 0 || candidate.length === 0) {return 0}

  const { avgDocLength, documentFrequency, totalDocs } = ctx
  const k1 = ctx.k1 ?? BM25_K1
  const b = ctx.b ?? BM25_B

  const candidateCounts = new Map<string, number>()
  for (const token of candidate) {
    candidateCounts.set(token, (candidateCounts.get(token) ?? 0) + 1)
  }
  const candidateLength = candidate.length

  // Deduplicate query terms — classical BM25 uses unique query terms.
  const queryTokens = new Set(query)

  let rawScore = 0
  for (const term of queryTokens) {
    const tf = candidateCounts.get(term)
    if (!tf) {continue}

    const df = documentFrequency.get(term) ?? 0
    // Add-one smoothing on IDF so it never dips to negative, following
    // Lucene / Elasticsearch's practical variant.
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5))
    if (idf <= 0) {continue}

    const norm = 1 - b + (b * candidateLength) / Math.max(avgDocLength, 1)
    const termScore = (idf * (tf * (k1 + 1))) / (tf + k1 * norm)
    rawScore += termScore
  }

  // Squash the unbounded BM25 sum into [0, 1] via a smooth saturating function.
  // Monotonic in rawScore so ranking is preserved.
  return rawScore <= 0 ? 0 : 1 - Math.exp(-rawScore / 4)
}
