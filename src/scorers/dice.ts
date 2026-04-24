import type { ScorerFn } from '../types.js'

/**
 * Sørensen–Dice coefficient: 2 × |A ∩ B| / (|A| + |B|).
 *
 * Slightly more forgiving than Jaccard on short keyword lists — a single
 * shared keyword weighs more. Always in [0, 1].
 */
export const dice: ScorerFn = (query, candidate) => {
  if (query.length === 0 || candidate.length === 0) {return 0}

  const q = new Set(query)
  const c = new Set(candidate)

  let intersection = 0
  for (const token of q) {
    if (c.has(token)) {intersection++}
  }

  return (2 * intersection) / (q.size + c.size)
}
