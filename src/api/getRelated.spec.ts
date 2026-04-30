import type { Payload } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import type { SourceAdapter, SourceRow } from '../types.js'

import { sanitizeConfig } from '../defaults.js'
import { registerRuntime } from '../runtime.js'
import { getRelated } from './getRelated.js'

describe('getRelated source adapter seam', () => {
  test('uses the registered SourceAdapter for live candidate rows', async () => {
    const config = sanitizeConfig({
      cache: false,
      collections: { articles: true },
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
    const fakeSource: SourceAdapter = vi.fn(() => Promise.resolve([queryRow, candidateRow]))

    const payload = {
      find: vi.fn(() => Promise.resolve({
        docs: [
          {
            id: 'search-query',
            doc: { relationTo: 'articles', value: 'source-1' },
            keywords: ['payload', 'search'],
          },
        ],
      })),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    registerRuntime(payload, { cache: null, config, source: fakeSource })

    const results = await getRelated({
      id: 'source-1',
      collection: 'articles',
      payload,
      skipCache: true,
      skipPrecomputed: true,
    })

    expect(fakeSource).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      id: 'candidate-1',
      collection: 'articles',
      source: { title: 'Candidate from adapter' },
    })
  })
})
