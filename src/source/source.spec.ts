import { describe, expect, test } from 'vitest'

import { extractKeywords } from './keywords.js'
import { parseKeywords } from './parseEmbedding.js'

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
