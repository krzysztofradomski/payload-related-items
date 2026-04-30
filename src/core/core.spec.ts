import { describe, expect, test } from 'vitest'

import type { SanitizedCollectionConfig, SourceRow } from '../types.js'

import { computeRelated } from './computeRelated.js'
import { filterCandidates } from './filters.js'
import { recencyMultiplier } from './recency.js'

function row(
  id: string,
  collection: string,
  keywords: string[],
  opts: { updatedAt?: string } = {},
): SourceRow {
  return {
    collection,
    docId: id,
    keywordsByField: { keywords },
    raw: opts.updatedAt ? { updatedAt: opts.updatedAt } : {},
    recencyDate: opts.updatedAt ?? null,
    sourceId: `src-${id}`,
  }
}

const baseConfig: SanitizedCollectionConfig = {
  crossCollection: true,
  excludeSelf: true,
  fields: [{ name: 'keywords', scorer: 'jaccard', weight: 1 }],
  minScore: 0,
  scorer: 'jaccard',
  topK: 4,
}

describe('computeRelated', () => {
  test('ranks candidates by similarity and respects topK', () => {
    const query = row('1', 'articles', ['payload', 'cms', 'nextjs'])
    const candidates = [
      row('2', 'articles', ['payload', 'cms']),
      row('3', 'articles', ['payload']),
      row('4', 'articles', ['unrelated']),
      row('5', 'articles', ['payload', 'cms', 'nextjs', 'typescript']),
    ]
    const results = computeRelated({
      candidates,
      config: { ...baseConfig, topK: 2 },
      query,
    })
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe('5')
    expect(results[1].id).toBe('2')
  })

  test('exposes matched keywords for the primary field', () => {
    const query = row('1', 'articles', ['alpha', 'beta', 'gamma'])
    const candidates = [row('2', 'articles', ['beta', 'delta', 'alpha'])]
    const [top] = computeRelated({ candidates, config: baseConfig, query })
    expect(top.matchedKeywords.sort()).toEqual(['alpha', 'beta'])
  })

  test('applies recency decay multiplier when configured', () => {
    const now = new Date()
    const fresh = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const old = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()

    const query = row('1', 'articles', ['alpha', 'beta'])
    const candidates = [
      row('2', 'articles', ['alpha', 'beta'], { updatedAt: fresh }),
      row('3', 'articles', ['alpha', 'beta'], { updatedAt: old }),
    ]
    const results = computeRelated({
      candidates,
      config: {
        ...baseConfig,
        recency: { field: 'updatedAt', halfLifeDays: 30 },
      },
      query,
    })
    expect(results[0].id).toBe('2')
    expect(results[0].score).toBeGreaterThan(results[1].score)
    expect(results[1].recencyMultiplier).toBeLessThan(0.1)
  })

  test('filters by minScore', () => {
    const query = row('1', 'articles', ['a', 'b'])
    const candidates = [row('2', 'articles', ['a', 'c'])] // jaccard = 1/3
    const results = computeRelated({
      candidates,
      config: { ...baseConfig, minScore: 0.5 },
      query,
    })
    expect(results).toHaveLength(0)
  })
})

describe('filterCandidates', () => {
  const query = row('1', 'articles', ['a'])

  test('excludes self by default', () => {
    const rows = [query, row('2', 'articles', ['a'])]
    const out = filterCandidates({ config: baseConfig, query, rows })
    expect(out.map((r) => r.docId)).toEqual(['2'])
  })

  test('excludes self when ids are equivalent but not the same runtime type', () => {
    const numericQuery: SourceRow = {
      ...row('1', 'articles', ['a']),
      docId: 1 as unknown as string,
      sourceId: 101,
    }
    const rows: SourceRow[] = [
      {
        ...row('1', 'articles', ['a']),
        sourceId: 'different-source-row',
      },
      row('2', 'articles', ['a']),
    ]

    const out = filterCandidates({ config: baseConfig, query: numericQuery, rows })

    expect(out.map((r) => r.docId)).toEqual(['2'])
  })

  test('excludes self by source row id even when the relationship doc id differs', () => {
    const rows: SourceRow[] = [
      {
        ...row('legacy-doc-id', 'articles', ['a']),
        sourceId: query.sourceId,
      },
      row('2', 'articles', ['a']),
    ]

    const out = filterCandidates({ config: baseConfig, query, rows })

    expect(out.map((r) => r.docId)).toEqual(['2'])
  })

  test('honors crossCollection = false', () => {
    const rows = [row('2', 'articles', ['a']), row('3', 'posts', ['a'])]
    const out = filterCandidates({
      config: { ...baseConfig, crossCollection: false },
      query,
      rows,
    })
    expect(out.map((r) => r.collection)).toEqual(['articles'])
  })

  test('drops candidates with empty primary keywords', () => {
    const rows = [row('2', 'articles', []), row('3', 'articles', ['a'])]
    const out = filterCandidates({ config: baseConfig, query, rows })
    expect(out).toHaveLength(1)
  })

  test('excludeIds removes specific docs', () => {
    const rows = [row('2', 'articles', ['a']), row('3', 'articles', ['a'])]
    const out = filterCandidates({
      config: baseConfig,
      excludeIds: ['2'],
      query,
      rows,
    })
    expect(out).toHaveLength(1)
    expect(out[0].docId).toBe('3')
  })
})

describe('recencyMultiplier', () => {
  test('returns 1 for missing date', () => {
    expect(recencyMultiplier(null, { field: 'x', halfLifeDays: 30 })).toBe(1)
  })

  test('returns 1 with no config', () => {
    expect(recencyMultiplier(new Date('2020-01-01'), undefined)).toBe(1)
  })

  test('halves at one half-life', () => {
    const now = new Date()
    const oneHalfLifeAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const multiplier = recencyMultiplier(
      oneHalfLifeAgo,
      { field: 'x', halfLifeDays: 30 },
      now,
    )
    expect(multiplier).toBeCloseTo(0.5, 2)
  })

  test('respects the floor', () => {
    const now = new Date()
    const ancient = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    const multiplier = recencyMultiplier(
      ancient,
      { field: 'x', floor: 0.1, halfLifeDays: 7 },
      now,
    )
    expect(multiplier).toBe(0.1)
  })
})
