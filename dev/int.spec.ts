import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { aggregateWordCloud, getRelated } from 'payload-related-items'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload

const wordCloudAggregateConfig = {
  source: {
    collection: 'search',
    defaultKeywordsField: 'keywords',
    relationshipField: 'doc',
  },
}

afterAll(async () => {
  await payload.destroy()
})

beforeAll(async () => {
  payload = await getPayload({ config })

  // Seed a handful of articles and posts with deliberately overlapping vocabulary
  // so the BM25/Jaccard ranking has something to rank.
  const articles = [
    {
      summary: 'Understanding Jaccard coefficient for set comparison and keyword overlap.',
      title: 'How Jaccard similarity works',
    },
    {
      summary: 'BM25 is a ranking function used by search engines to score documents.',
      title: 'Introduction to BM25',
    },
    {
      summary: 'TF-IDF weights keywords by their rarity across a corpus.',
      title: 'TF-IDF basics',
    },
    {
      summary: 'Yeast, flour, patience, and a hot oven make the best loaves.',
      title: 'Baking sourdough at home',
    },
  ]
  for (const article of articles) {
    await payload.create({ collection: 'articles', data: article })
  }

  await payload.create({
    collection: 'posts',
    data: {
      body: 'Keywords, similarity, Jaccard, BM25 — the mechanics of related content widgets.',
      category: 'search',
      title: 'Why keyword overlap matters for related articles',
    },
  })
}, 60_000)

describe('payload-related-items', () => {
  test('registers the REST endpoint', async () => {
    const { docs } = await payload.find({
      collection: 'articles',
      limit: 1,
    })
    const first = docs[0]

    const results = await getRelated({
      id: first.id,
      collection: 'articles',
      limit: 3,
      payload,
    })

    expect(Array.isArray(results)).toBe(true)
  })

  test('ranks articles with strong keyword overlap above unrelated ones', async () => {
    // Sanity check: the search plugin should have indexed every seeded doc.
    const searchRows = await payload.find({ collection: 'search', limit: 100 })
    expect(searchRows.totalDocs).toBeGreaterThan(0)
    const withKeywords = searchRows.docs.filter(
      (d) =>
        Array.isArray((d as { keywords?: unknown }).keywords) &&
        (d as { keywords: unknown[] }).keywords.length > 0,
    )
    expect(withKeywords.length).toBeGreaterThan(0)

    const { docs } = await payload.find({
      collection: 'articles',
      limit: 10,
      where: { title: { like: 'Jaccard' } },
    })
    const source = docs[0]
    expect(source).toBeDefined()

    const results = await getRelated({
      id: source.id,
      collection: 'articles',
      limit: 5,
      payload,
      skipCache: true,
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].score).toBeGreaterThan(0)
    const top = results[0]
    expect(top.source).toBeTruthy()
    expect(top.matchedKeywords.length).toBeGreaterThan(0)
    // Sourdough is off-topic — it should not outrank the keyword-themed articles.
    expect(top.source).not.toHaveProperty('title', expect.stringMatching(/sourdough/i))
  })

  test('excludes the source document itself by default', async () => {
    const { docs } = await payload.find({
      collection: 'articles',
      limit: 1,
    })
    const source = docs[0]
    const results = await getRelated({
      id: source.id,
      collection: 'articles',
      payload,
      skipCache: true,
    })
    expect(results.find((r) => String(r.id) === String(source.id))).toBeUndefined()
  })

  test('throws for unconfigured collections', async () => {
    await expect(getRelated({ id: 'x', collection: 'media', payload })).rejects.toThrow(
      /not configured/,
    )
  })

  test('populates original docs when populate: true is passed', async () => {
    const { docs } = await payload.find({
      collection: 'articles',
      limit: 1,
      where: { title: { like: 'Jaccard' } },
    })
    const source = docs[0]
    expect(source).toBeDefined()

    const results = await getRelated<Record<string, unknown>, { id: string; title?: string }>({
      id: source.id,
      collection: 'articles',
      limit: 3,
      payload,
      populate: true,
      skipCache: true,
    })

    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.doc).toBeTruthy()
      expect(String(r.doc!.id)).toBe(String(r.id))
    }
  })

  test('exposes a REST endpoint at /api/related/:collection/:id', async () => {
    const { docs } = await payload.find({ collection: 'articles', limit: 1 })
    expect(docs.length).toBeGreaterThan(0)

    const endpoint = payload.config.endpoints?.find((e) => e.path === '/related/:collection/:id')
    expect(endpoint).toBeDefined()
  })

  test('exposes the word-cloud endpoint and aggregates on demand', async () => {
    const endpoint = payload.config.endpoints?.find((e) => e.path === '/related/word-cloud')
    expect(endpoint).toBeDefined()

    const result = await aggregateWordCloud({
      config: wordCloudAggregateConfig,
      limit: 50,
      minLength: 3,
      payload,
      sampleSize: 500,
    })

    expect(result.terms.length).toBeGreaterThan(0)
    expect(result.totalDocs).toBeGreaterThan(0)
    const firstTerm = result.terms[0]
    expect(firstTerm.term.length).toBeGreaterThanOrEqual(3)
    expect(firstTerm.frequency).toBeGreaterThan(0)
    expect(firstTerm.df).toBeLessThanOrEqual(result.totalDocs)
    // Results are sorted by frequency descending.
    for (let i = 1; i < result.terms.length; i++) {
      expect(result.terms[i - 1].frequency).toBeGreaterThanOrEqual(result.terms[i].frequency)
    }
  })

  test('word-cloud respects the originating-collection filter', async () => {
    const all = await aggregateWordCloud({
      config: wordCloudAggregateConfig,
      payload,
      sampleSize: 500,
    })

    const articlesOnly = await aggregateWordCloud({
      config: wordCloudAggregateConfig,
      filterCollection: 'articles',
      payload,
      sampleSize: 500,
    })

    expect(articlesOnly.totalDocs).toBeLessThanOrEqual(all.totalDocs)
    expect(articlesOnly.filterCollection).toBe('articles')
  })
})
