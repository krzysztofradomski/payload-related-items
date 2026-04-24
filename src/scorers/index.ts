import type { ScorerFn, ScorerName } from '../types.js'

import { bm25 } from './bm25.js'
import { dice } from './dice.js'
import { jaccard, weightedJaccard } from './jaccard.js'

export const scorers: Record<ScorerName, ScorerFn> = {
  bm25,
  dice,
  jaccard,
  weightedJaccard,
}

export function getScorer(name: ScorerName): ScorerFn {
  const fn = scorers[name]
  if (!fn) {
    throw new Error(`[payload-related-items] Unknown scorer: "${String(name)}"`)
  }
  return fn
}

export { bm25, dice, jaccard, weightedJaccard }
