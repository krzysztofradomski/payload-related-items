'use client'

import { useConfig } from '@payloadcms/ui'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'

import type { WordCloudTerm } from './WordCloudInner.js'

import styles from './WordCloud.module.css'

// Code-split the renderer: this chunk is only fetched after the user clicks
// "Compute word cloud". The outer shell (button + controls) is tiny and
// doesn't ship the cloud rendering code until it's actually needed.
const WordCloudInner = lazy(() => import('./WordCloudInner.js'))

interface WordCloudProps {
  /**
   * Optional slugs to show in the collection filter. When omitted, slugs are
   * read from the live Payload admin config (all registered collections) so
   * the list matches the project without duplicating the related-items
   * plugin's `collections` allow-list.
   */
  availableCollections?: string[]
  /** Default value for the stop-words checkbox. Default: true. */
  defaultStopWords?: boolean
  /** REST endpoint path mounted by the plugin (absolute under the API route). Default: `/related/word-cloud`. */
  endpointPath?: string
  /** Max terms to render. Default: 100. */
  limit?: number
  /** Max source rows the backend is allowed to scan per call. Default: 2000. */
  sampleSize?: number
  /** Slug of the source collection we're aggregating over. Used for display only. */
  sourceCollection: string
}

interface ApiResponse {
  cached?: boolean
  elapsedMs: number
  field: string
  filterCollection: null | string
  terms: WordCloudTerm[]
  totalDocs: number
}

/**
 * Admin list-view add-on for the source collection. Renders a "Compute word
 * cloud" button that, on click:
 *   1. Dynamically imports the renderer chunk (`React.lazy`).
 *   2. Calls the word-cloud REST endpoint, which aggregates keywords on
 *      demand and caches the result for a short TTL.
 *
 * No computation happens at page load, no extra data is sent to the client
 * until interaction. The backend also never pre-aggregates — computation is
 * triggered exclusively by this UI (or anyone hitting the endpoint directly).
 */
export const WordCloud: React.FC<WordCloudProps> = ({
  availableCollections = [],
  defaultStopWords = true,
  endpointPath = '/related/word-cloud',
  limit = 100,
  sampleSize = 2000,
  sourceCollection,
}) => {
  const cfgCtx = useConfig() as ReturnType<typeof useConfig> | undefined
  const apiRoute = cfgCtx?.config?.routes?.api ?? '/api'

  const collectionOptions = useMemo(() => {
    const fromConfig = (cfgCtx?.config?.collections ?? [])
      .map((c) => c.slug)
      .filter((s): s is string => Boolean(s))
    fromConfig.sort((a, b) => a.localeCompare(b))
    if (fromConfig.length > 0) return fromConfig
    if (availableCollections && availableCollections.length > 0) {
      return [...availableCollections].sort((a, b) => a.localeCompare(b))
    }
    return []
  }, [availableCollections, cfgCtx?.config?.collections])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [stopWords, setStopWords] = useState(defaultStopWords)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('sampleSize', String(sampleSize))
      if (filter) params.set('collection', filter)
      if (stopWords) params.set('stopWords', 'default')

      const prefix = apiRoute.endsWith('/') ? apiRoute.slice(0, -1) : apiRoute
      const suffix = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`
      const url = `${prefix}${suffix}?${params.toString()}`

      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed: ${res.status}`)
      }
      const payload = (await res.json()) as ApiResponse
      setData(payload)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [apiRoute, endpointPath, filter, limit, sampleSize, stopWords])

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>Keyword cloud</h3>
          <p className={styles.subtitle}>
            Aggregated across <code>{sourceCollection}</code> rows. Computed on demand and cached
            briefly in-memory — nothing is indexed eagerly.
          </p>
        </div>
        <div className={styles.controls}>
          {collectionOptions.length > 0 && (
            <select
              className={styles.select}
              disabled={loading}
              onChange={(e) => setFilter(e.target.value)}
              value={filter}
            >
              <option value="">All collections</option>
              {collectionOptions.map((slug) => (
                <option key={slug} value={slug}>
                  {slug}
                </option>
              ))}
            </select>
          )}
          <label className={styles.toggle}>
            <input
              checked={stopWords}
              disabled={loading}
              onChange={(e) => setStopWords(e.target.checked)}
              type="checkbox"
            />
            stop-words
          </label>
          <button className={styles.button} disabled={loading} onClick={load} type="button">
            {loading ? 'Computing…' : data ? 'Recompute' : 'Compute word cloud'}
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>Error: {error}</div>}

      {!data && !error && !loading && (
        <div className={styles.placeholder}>
          Click <strong>Compute word cloud</strong> to scan up to {sampleSize.toLocaleString()} rows
          and display the top {limit} keywords.
        </div>
      )}

      {data && (
        <>
          <div className={styles.meta}>
            {data.terms.length} terms from {data.totalDocs.toLocaleString()} docs · field{' '}
            <code>{data.field}</code>
            {data.filterCollection && (
              <>
                {' '}
                · filter <code>{data.filterCollection}</code>
              </>
            )}{' '}
            · {data.elapsedMs} ms{data.cached ? ' (cached)' : ''}
          </div>
          <Suspense fallback={<div className={styles.placeholder}>Rendering…</div>}>
            <WordCloudInner terms={data.terms} />
          </Suspense>
        </>
      )}
    </section>
  )
}
