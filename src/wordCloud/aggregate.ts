import type { Payload, PayloadRequest, Where } from 'payload'

import type { SanitizedConfig } from '../types.js'

import { parseKeywords } from '../source/parseEmbedding.js'

/**
 * Excludes source rows with no parseable keyword data, so a naive full-table
 * scan doesn't spend the `sampleSize` budget on the oldest, pre-embedding
 * history rows (which have `null` / `[]` in the default keywords field) while
 * filtered queries hit only newer, fully-synced rows.
 */
function buildNonEmptyKeywordFieldWhere(field: string): Where {
  return {
    and: [
      { [field]: { exists: true } },
      { [field]: { not_equals: null } },
      { [field]: { not_equals: [] } },
    ],
  }
}

function mergeWhere(a: undefined | Where, b: undefined | Where): undefined | Where {
  if (a == null) {return b}
  if (b == null) {return a}
  return { and: [a, b] }
}

export interface WordCloudTerm {
  /** Number of source rows containing the term (document frequency). */
  df: number
  /** Total occurrences across all scanned rows. */
  frequency: number
  /** Lowercased term. */
  term: string
}

export interface WordCloudResult {
  /** Time taken to aggregate, in milliseconds (excludes cache hits). */
  elapsedMs: number
  /** Which source-collection field was aggregated. */
  field: string
  /** Originating-collection filter (from `doc.relationTo`), or `null` for all. */
  filterCollection: null | string
  /** Terms sorted by frequency descending, capped at `limit`. */
  terms: WordCloudTerm[]
  /** Number of source rows actually scanned. */
  totalDocs: number
}

export interface WordCloudAggregateConfig {
  source: SanitizedConfig['source']
}

export interface AggregateOptions {
  config: WordCloudAggregateConfig
  /** Optional originating-collection filter (e.g. `'posts'`). Filters on `<relationshipField>.relationTo`. */
  filterCollection?: null | string
  /** Maximum number of terms in the response. Default: 100. */
  limit?: number
  /** Minimum term character length. Default: 3. */
  minLength?: number
  payload: Payload
  req?: PayloadRequest
  /** Maximum source rows to scan per call. Default: 2000. Protects against giant-corpus scans. */
  sampleSize?: number
  /** Optional stop list. Terms in this set are dropped. */
  stopWords?: Iterable<string>
}

/**
 * Aggregates keyword frequencies across rows of the plugin's source collection
 * (the one populated by `@payloadcms/plugin-search` by default).
 *
 * Paginates through the source collection up to `sampleSize` rows; for each row
 * collects tokens from the configured field, lowercases them, drops short
 * tokens and anything in `stopWords`, and tracks per-term `frequency` and
 * document-frequency `df`.
 *
 * Intentionally computed on demand — nothing runs at plugin boot. Callers
 * (endpoint, tests) are responsible for caching repeated calls.
 */
export async function aggregateWordCloud(opts: AggregateOptions): Promise<WordCloudResult> {
  const start = Date.now()
  const {
    config,
    filterCollection = null,
    limit = 100,
    minLength = 3,
    payload,
    req,
    sampleSize = 2000,
    stopWords,
  } = opts

  const field = config.source.defaultKeywordsField
  const stop = stopWords ? new Set(stopWords) : null

  const frequency = new Map<string, number>()
  const docFrequency = new Map<string, number>()

  let page = 1
  let totalDocs = 0
  const pageSize = 200

  const baseWhere: undefined | Where = filterCollection
    ? { [`${config.source.relationshipField}.relationTo`]: { equals: filterCollection } }
    : undefined

  const where = mergeWhere(baseWhere, buildNonEmptyKeywordFieldWhere(field))

  while (totalDocs < sampleSize) {
    const remaining = sampleSize - totalDocs
    const batch = Math.min(pageSize, remaining)

    const result = await payload.find({
      collection: config.source.collection,
      depth: 0,
      limit: batch,
      overrideAccess: false,
      page,
      req,
      // Prefer recently re-synced rows; unfiltered "all" is otherwise often
      // dominated by the oldest N rows, which can predate a populated
      // keyword/embedding field.
      sort: '-updatedAt',
      where,
    })

    if (result.docs.length === 0) {break}

    for (const doc of result.docs) {
      totalDocs++
      const raw = (doc as Record<string, unknown>)[field]
      const keywords = parseKeywords(raw)
      if (keywords.length === 0) {continue}

      const seenInDoc = new Set<string>()
      for (const kw of keywords) {
        const term = kw.toLowerCase().trim()
        if (term.length < minLength) {continue}
        if (stop && stop.has(term)) {continue}
        frequency.set(term, (frequency.get(term) ?? 0) + 1)
        if (!seenInDoc.has(term)) {
          seenInDoc.add(term)
          docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1)
        }
      }
    }

    if (!result.hasNextPage) {break}
    page++
  }

  const terms: WordCloudTerm[] = Array.from(frequency.entries())
    .map(([term, freq]) => ({
      df: docFrequency.get(term) ?? freq,
      frequency: freq,
      term,
    }))
    .sort((a, b) => b.frequency - a.frequency || a.term.localeCompare(b.term))
    .slice(0, limit)

  return {
    elapsedMs: Date.now() - start,
    field,
    filterCollection,
    terms,
    totalDocs,
  }
}
