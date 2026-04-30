import { describe, expect, test } from 'vitest'

import type { ScorerContext } from '../types.js'

import { bm25 } from './bm25.js'
import { dice } from './dice.js'
import { jaccard, weightedJaccard } from './jaccard.js'

const emptyCtx: ScorerContext = {
  avgDocLength: 0,
  documentFrequency: new Map(),
  totalDocs: 0,
}

describe('jaccard', () => {
  test('returns 0 for empty inputs', () => {
    expect(jaccard([], ['a'], emptyCtx)).toBe(0)
    expect(jaccard(['a'], [], emptyCtx)).toBe(0)
  })

  test('returns 1 for identical sets', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'], emptyCtx)).toBe(1)
  })

  test('classic example: 2/3 for {a,b,c} vs {a,b}', () => {
    expect(jaccard(['a', 'b', 'c'], ['a', 'b'], emptyCtx)).toBeCloseTo(2 / 3)
  })

  test('ignores duplicates (pure set behavior)', () => {
    expect(jaccard(['a', 'a', 'b'], ['a', 'b'], emptyCtx)).toBe(1)
  })
})

describe('weightedJaccard', () => {
  test('degenerates to classic Jaccard on deduped inputs', () => {
    expect(weightedJaccard(['a', 'b'], ['a', 'b', 'c'], emptyCtx)).toBeCloseTo(2 / 3)
  })

  test('respects multiplicity: {a,a,b} vs {a,b,b} → min(2,1)+min(1,2) / max(2,1)+max(1,2) = 2/4', () => {
    expect(weightedJaccard(['a', 'a', 'b'], ['a', 'b', 'b'], emptyCtx)).toBeCloseTo(0.5)
  })

  test('disjoint sets → 0', () => {
    expect(weightedJaccard(['a'], ['b'], emptyCtx)).toBe(0)
  })
})

describe('dice', () => {
  test('returns 1 for identical sets', () => {
    expect(dice(['a', 'b'], ['a', 'b'], emptyCtx)).toBe(1)
  })

  test('is higher than Jaccard for partial overlap', () => {
    const q = ['a', 'b', 'c']
    const c = ['a', 'b']
    expect(dice(q, c, emptyCtx)).toBeGreaterThan(jaccard(q, c, emptyCtx))
  })
})

describe('bm25', () => {
  test('returns 0 when no terms overlap', () => {
    const ctx: ScorerContext = {
      avgDocLength: 3,
      documentFrequency: new Map([['a', 1], ['b', 1]]),
      totalDocs: 2,
    }
    expect(bm25(['a'], ['b', 'c'], ctx)).toBe(0)
  })

  test('score increases with term overlap and decreases with df', () => {
    const query = ['kangaroo', 'algorithm']
    const ctx: ScorerContext = {
      avgDocLength: 4,
      documentFrequency: new Map([
        ['algorithm', 5],
        ['kangaroo', 2],
        ['the', 100],
      ]),
      totalDocs: 100,
    }
    const candidateRareMatch = ['kangaroo', 'notebook']
    const candidateCommonMatch = ['the', 'algorithm']
    const rareScore = bm25(query, candidateRareMatch, ctx)
    const commonScore = bm25(query, candidateCommonMatch, ctx)
    expect(rareScore).toBeGreaterThan(0)
    expect(commonScore).toBeGreaterThan(0)
    // Rare terms should carry more weight than common ones.
    expect(rareScore).toBeGreaterThan(commonScore)
  })

  test('stays inside [0, 1]', () => {
    const ctx: ScorerContext = {
      avgDocLength: 5,
      documentFrequency: new Map([['a', 1]]),
      totalDocs: 1000,
    }
    // Large pile of overlap to try to blow the squash.
    const tokens = Array.from({ length: 50 }, () => 'a')
    const score = bm25(tokens, tokens, ctx)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  test('returns 1 for an exact keyword match', () => {
    const ctx: ScorerContext = {
      avgDocLength: 3,
      documentFrequency: new Map([
        ['alpha', 1],
        ['beta', 1],
        ['gamma', 1],
      ]),
      totalDocs: 10,
    }

    expect(bm25(['alpha', 'beta', 'gamma'], ['alpha', 'beta', 'gamma'], ctx)).toBe(1)
  })

  test('keeps partial multi-token matches below 1', () => {
    const query = Array.from({ length: 20 }, (_, i) => `term-${i}`)
    const partialCandidate = query.slice(0, 10)
    const ctx: ScorerContext = {
      avgDocLength: 10,
      documentFrequency: new Map(query.map((term) => [term, 1])),
      totalDocs: 50,
    }

    const score = bm25(query, partialCandidate, ctx)

    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(0.8)
  })
})
