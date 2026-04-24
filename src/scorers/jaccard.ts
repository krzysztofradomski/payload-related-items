import type { ScorerFn } from '../types.js'

/**
 * Classic Jaccard similarity: |A ∩ B| / |A ∪ B|.
 *
 * Treats inputs as sets (duplicates are ignored).
 * Cheap, explainable, but saturates to 0 on sparse keyword lists.
 */
export const jaccard: ScorerFn = (query, candidate) => {
  if (query.length === 0 || candidate.length === 0) {return 0}

  const q = new Set(query)
  const c = new Set(candidate)

  let intersection = 0
  for (const token of q) {
    if (c.has(token)) {intersection++}
  }

  const union = q.size + c.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Weighted Jaccard similarity over multisets (Ruzicka similarity).
 *
 * When your keyword arrays carry repetition (e.g. a token repeated N times to
 * signal importance), weighted Jaccard respects those counts:
 *   sum(min(qCount, cCount)) / sum(max(qCount, cCount))
 *
 * For dedup'd arrays this degenerates to classic Jaccard.
 */
export const weightedJaccard: ScorerFn = (query, candidate) => {
  if (query.length === 0 || candidate.length === 0) {return 0}

  const qCounts = countTokens(query)
  const cCounts = countTokens(candidate)

  let num = 0
  let den = 0
  const visited = new Set<string>()

  for (const [token, qCount] of qCounts) {
    const cCount = cCounts.get(token) ?? 0
    num += Math.min(qCount, cCount)
    den += Math.max(qCount, cCount)
    visited.add(token)
  }
  for (const [token, cCount] of cCounts) {
    if (visited.has(token)) {continue}
    // Tokens only in candidate — min is 0, max is cCount.
    den += cCount
  }

  return den === 0 ? 0 : num / den
}

function countTokens(tokens: ReadonlyArray<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return counts
}
