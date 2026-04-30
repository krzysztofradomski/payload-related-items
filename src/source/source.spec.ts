import { describe, expect, test } from 'vitest'

import { sanitizeConfig } from '../defaults.js'
import { extractKeywords } from './keywords.js'
import { parseKeywords } from './parseEmbedding.js'
import { readSourceRelationship } from './relationship.js'
import { createSearchPluginSource } from './searchPluginSource.js'

describe('parseKeywords', () => {
  test('returns [] for null/undefined', () => {
    expect(parseKeywords(null)).toEqual([])
    expect(parseKeywords(undefined)).toEqual([])
  })

  test('passes through string arrays', () => {
    expect(parseKeywords(['a', 'b'])).toEqual(['a', 'b'])
  })

  test('parses JSON-stringified arrays', () => {
    expect(parseKeywords(JSON.stringify(['a', 'b']))).toEqual(['a', 'b'])
  })

  test('treats unparsable JSON as a single keyword rather than throwing', () => {
    // Inputs starting with `{` or `[` are attempted as JSON first; on failure
    // they fall back to being treated as one verbatim keyword.
    expect(parseKeywords('{not valid json')).toEqual(['{not valid json'])
    expect(parseKeywords('[oops')).toEqual(['[oops'])
  })

  test('handles Payload array-field shape {value}', () => {
    expect(parseKeywords([{ value: 'x' }, { value: 'y' }])).toEqual(['x', 'y'])
  })
})

describe('extractKeywords', () => {
  test('tokenizes, lowercases, and deduplicates', () => {
    const out = extractKeywords('The QUICK brown fox jumps over the lazy dog and the quick fox.')
    expect(out).toContain('quick')
    expect(out).toContain('brown')
    expect(out).toContain('jumps')
    // Stop words removed.
    expect(out).not.toContain('the')
    // Dedup.
    expect(out.filter((t) => t === 'quick')).toHaveLength(1)
  })

  test('respects minLength', () => {
    const out = extractKeywords('go to dev ops', { minLength: 3 })
    expect(out).toContain('dev')
    expect(out).toContain('ops')
    expect(out).not.toContain('to')
  })

  test('respects unicode letters (Polish, German, CJK)', () => {
    const out = extractKeywords('Spektakle teatralne, Gemütlichkeit, 日本東京')
    expect(out).toContain('spektakle')
    expect(out).toContain('teatralne')
    expect(out).toContain('gemütlichkeit')
    // CJK tokens pass through tokenization; short tokens are culled by minLength,
    // so we use a longer 4-char CJK string to exercise the unicode path.
    expect(out).toContain('日本東京')
  })

  test('caps output at maxTokens', () => {
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ')
    const out = extractKeywords(words, { maxTokens: 50 })
    expect(out).toHaveLength(50)
  })

  test('returns [] for non-string inputs', () => {
    expect(extractKeywords(null)).toEqual([])
    expect(extractKeywords(undefined)).toEqual([])
    expect(extractKeywords(42)).toEqual([])
  })
})

describe('readSourceRelationship', () => {
  test('reads primitive relationship ids', () => {
    expect(
      readSourceRelationship(
        { doc: { relationTo: 'articles', value: 123 } },
        'doc',
      ),
    ).toEqual({ collection: 'articles', docId: '123' })
  })

  test('reads populated relationship ids', () => {
    expect(
      readSourceRelationship(
        { doc: { relationTo: 'posts', value: { id: 'abc' } } },
        'doc',
      ),
    ).toEqual({ collection: 'posts', docId: 'abc' })
  })

  test('returns null for missing or unsupported relationship values', () => {
    expect(readSourceRelationship({}, 'doc')).toBeNull()
    expect(readSourceRelationship({ doc: { relationTo: 'posts', value: true } }, 'doc')).toBeNull()
  })
})

describe('createSearchPluginSource', () => {
  test('selects default display fields and exposes them on raw source rows', async () => {
    const config = sanitizeConfig({
      collections: {
        articles: {
          fields: [{ name: 'embedding' }],
        },
      },
      source: {
        collection: 'search-results',
        defaultKeywordsField: 'embedding',
        relationshipField: 'doc',
      },
    })
    const findCalls: unknown[] = []
    const payload = {
      find: (args: unknown) => {
        findCalls.push(args)
        return Promise.resolve({
          docs: [
            {
              id: 'search-1',
              name: 'Article Name',
              slug: 'article-slug',
              description: 'Short summary',
              doc: { relationTo: 'articles', value: 'article-1' },
              embedding: ['teatr'],
              title: 'Article Title',
            },
          ],
          hasNextPage: false,
        })
      },
    }

    const source = createSearchPluginSource({ config })
    const rows = await source.list({ payload: payload as never })

    expect(findCalls[0]).toMatchObject({
      select: {
        name: true,
        slug: true,
        description: true,
        doc: true,
        embedding: true,
        title: true,
      },
    })
    expect(rows[0].raw).toMatchObject({
      name: 'Article Name',
      slug: 'article-slug',
      description: 'Short summary',
      title: 'Article Title',
    })
  })
})
