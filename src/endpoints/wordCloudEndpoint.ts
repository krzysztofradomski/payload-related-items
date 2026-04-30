import type { Endpoint, PayloadHandler } from 'payload'

import type { SanitizedConfig } from '../types.js'

import { getRuntime } from '../runtime.js'
import { DEFAULT_STOP_WORDS } from '../source/keywords.js'
import {
  aggregateWordCloud,
  aggregateWordCloudRows,
  type WordCloudResult,
} from '../wordCloud/aggregate.js'

interface CacheEntry {
  expiresAt: number
  result: WordCloudResult
}

// Per-process, module-scoped cache keyed on query params. Separate from the
// main LRU cache because a word-cloud aggregate is a single large value that
// we want to keep alive briefly regardless of other activity.
const CACHE = new Map<string, CacheEntry>()

/**
 * Builds the word-cloud endpoint. Mounted under the main endpoint base:
 *
 *   GET /api{basePath}{wordCloudPath}
 *
 * Defaults: `GET /api/related/word-cloud`.
 *
 * Query params:
 *   - limit:      top-N terms returned (default: config.wordCloud.limit)
 *   - minLength:  minimum term character length (default: config.wordCloud.minLength)
 *   - sampleSize: max source rows to scan (default: config.wordCloud.sampleSize)
 *   - collection: filter source rows by `doc.relationTo === collection`
 *   - stopWords:  'default' to apply the plugin's built-in multilingual stop list
 *   - skipCache:  'true' to bypass the in-memory cache for this call
 *
 * Response:
 *   { terms: WordCloudTerm[], totalDocs, field, filterCollection, elapsedMs, cached }
 */
export function buildWordCloudEndpoint(config: SanitizedConfig): Endpoint | null {
  if (config.endpoint === false || config.wordCloud === false || !config.wordCloud.enabled) {
    return null
  }

  const basePath = config.endpoint.path
  const path = `${basePath}${config.wordCloud.endpointPath}`
  const { limit, minLength, sampleSize, ttlSeconds } = config.wordCloud

  const handler: PayloadHandler = async (req) => {
    const url = new URL(req.url ?? 'http://localhost')
    const params = url.searchParams

    const reqLimit = clamp(parseIntOr(params.get('limit')) ?? limit, 1, limit)
    const reqMinLength = parseIntOr(params.get('minLength')) ?? minLength
    const reqSampleSize = clamp(parseIntOr(params.get('sampleSize')) ?? sampleSize, 1, sampleSize)
    const filterCollection = params.get('collection') || null
    const useStopWords = params.get('stopWords') === 'default'
    const skipCache = params.get('skipCache') === 'true'

    const cacheKey = [
      filterCollection ?? '*',
      reqLimit,
      reqMinLength,
      reqSampleSize,
      useStopWords ? 'stop' : 'raw',
    ].join('|')

    if (!skipCache) {
      const hit = CACHE.get(cacheKey)
      if (hit && hit.expiresAt > Date.now()) {
        return Response.json({ ...hit.result, cached: true })
      }
    }

    try {
      const stopWords = useStopWords ? DEFAULT_STOP_WORDS : undefined
      const result = config.source.adapter
        ? aggregateWordCloudRows({
            field: config.source.defaultKeywordsField,
            filterCollection,
            limit: reqLimit,
            minLength: reqMinLength,
            rows: await getRuntime(req.payload).source.list({
              collection: filterCollection ?? undefined,
              limit: reqSampleSize,
              payload: req.payload,
              req,
            }),
            sampleSize: reqSampleSize,
            stopWords,
          })
        : await aggregateWordCloud({
            config,
            filterCollection,
            limit: reqLimit,
            minLength: reqMinLength,
            payload: req.payload,
            req,
            sampleSize: reqSampleSize,
            stopWords,
          })

      if (ttlSeconds > 0) {
        CACHE.set(cacheKey, { expiresAt: Date.now() + ttlSeconds * 1000, result })
      }

      return Response.json({ ...result, cached: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ error: message }, { status: 500 })
    }
  }

  return { handler, method: 'get', path }
}

/** Test / runtime helper — drop any cached entries. */
export function clearWordCloudCache(): void {
  CACHE.clear()
}

function parseIntOr(raw: null | string): number | undefined {
  if (!raw) {return undefined}
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
