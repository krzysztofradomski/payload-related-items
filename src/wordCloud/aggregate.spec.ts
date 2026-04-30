import { describe, expect, test } from 'vitest'

import type { SourceRow } from '../types.js'

import { aggregateWordCloudRows } from './aggregate.js'

describe('aggregateWordCloudRows', () => {
  test('aggregates adapter rows and respects originating collection filters', () => {
    const rows: SourceRow[] = [
      {
        collection: 'articles',
        docId: '1',
        keywordsByField: { keywords: ['Payload', 'Search'] },
        raw: {},
        sourceId: 'source-1',
      },
      {
        collection: 'posts',
        docId: '2',
        keywordsByField: { keywords: ['Payload', 'Ignored'] },
        raw: {},
        sourceId: 'source-2',
      },
    ]

    const result = aggregateWordCloudRows({
      field: 'keywords',
      filterCollection: 'articles',
      rows,
    })

    expect(result.totalDocs).toBe(1)
    expect(result.filterCollection).toBe('articles')
    expect(result.terms).toEqual([
      { df: 1, frequency: 1, term: 'payload' },
      { df: 1, frequency: 1, term: 'search' },
    ])
  })
})
