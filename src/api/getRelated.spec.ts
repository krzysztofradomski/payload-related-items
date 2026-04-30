import type { Payload } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import type { SourceAdapter, SourceRow } from '../types.js'

import { sanitizeConfig } from '../defaults.js'
import { registerRuntime } from '../runtime.js'
import { getRelated } from './getRelated.js'

describe('getRelated source adapter seam', () => {
  test('carries a custom SourceAdapter through sanitized config', () => {
    const fakeSource: SourceAdapter = {
      findOne: vi.fn(() => Promise.resolve(null)),
      list: vi.fn(() => Promise.resolve([])),
    }

    const config = sanitizeConfig({
      collections: { articles: true },
      source: { adapter: fakeSource },
    })

    expect(config.source.adapter).toBe(fakeSource)
  })

  test('uses the registered SourceAdapter for live candidate rows', async () => {
    const config = sanitizeConfig({
      cache: false,
      collections: {
        articles: {
          filter: { _status: { equals: 'published' } },
        },
      },
    })

    const queryRow: SourceRow = {
      collection: 'articles',
      docId: 'source-1',
      keywordsByField: { keywords: ['payload', 'search'] },
      raw: { id: 'search-query' },
      sourceId: 'search-query',
    }
    const candidateRow: SourceRow = {
      collection: 'articles',
      docId: 'candidate-1',
      keywordsByField: { keywords: ['payload', 'search'] },
      raw: { id: 'search-candidate', title: 'Candidate from adapter' },
      sourceId: 'search-candidate',
    }
    const fakeSource: SourceAdapter = {
      findOne: vi.fn(() => Promise.resolve(queryRow)),
      list: vi.fn(() => Promise.resolve([queryRow, candidateRow])),
    }

    const payload = {
      logger: { warn: vi.fn() },
    } as unknown as Payload

    registerRuntime(payload, { cache: null, config, source: fakeSource })

    const results = await getRelated({
      id: 'source-1',
      collection: 'articles',
      filter: { locale: { equals: 'en' } },
      payload,
      skipCache: true,
      skipPrecomputed: true,
    })

    expect(fakeSource.findOne).toHaveBeenCalledWith({
      id: 'source-1',
      collection: 'articles',
      payload,
      req: undefined,
    })
    expect(fakeSource.list).toHaveBeenCalledWith({
      filter: {
        and: [
          { _status: { equals: 'published' } },
          { locale: { equals: 'en' } },
        ],
      },
      payload,
      req: undefined,
    })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      id: 'candidate-1',
      collection: 'articles',
      source: { title: 'Candidate from adapter' },
    })
  })
})
