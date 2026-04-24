'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { RelatedItem, ScorerName } from '../types.js'

export interface UseRelatedItemsOptions {
  /** Originating collection slug. */
  collection: null | string | undefined
  /** Override cross-collection behavior. */
  crossCollection?: boolean

  /**
   * URL path where the related-items endpoint is mounted, without the
   * `/:collection/:id` suffix. Default: `/api/related`.
   * Useful if you mounted the plugin at a custom path or behind a reverse proxy.
   */
  endpoint?: string
  /** Comma-joined client-side. */
  excludeCollections?: string[]
  /** Inject a custom fetch (e.g. for SSR, auth headers, or tests). */
  fetcher?: typeof fetch
  /** Originating document ID. If nullish, the hook stays idle. */
  id: null | number | string | undefined
  /** Max number of items to return. */
  limit?: number
  /** Minimum blended score threshold. */
  minScore?: number
  /**
   * Fetch originating docs server-side so results include a `doc` field.
   * - `true` → `depth: 0`
   * - a number → that Payload `depth` (to resolve relationships like media)
   */
  populate?: boolean | number
  /** Override the configured scorer. */
  scorer?: ScorerName

  /** Conditionally disable fetching without unmounting the component. */
  skip?: boolean
  /** Skip in-memory cache. Default: false. */
  skipCache?: boolean
  /** Skip sidecar precomputed results. Default: false. */
  skipPrecomputed?: boolean
}

export interface UseRelatedItemsResult<
  TSource = Record<string, unknown>,
  TDoc = Record<string, unknown>,
> {
  /** Last error, if any. Cleared on successful refetch. */
  error: Error | null
  /** Current list of related items. Empty array while loading or on error. */
  items: RelatedItem<TSource, TDoc>[]
  /** True while a request is in flight. */
  loading: boolean
  /** Manually re-run the query (bypasses in-flight dedupe). */
  refetch: () => Promise<void>
}

/**
 * Headless client hook for the related-items REST endpoint.
 *
 * Returns `{ items, loading, error, refetch }`. Does not render anything —
 * UI composition is up to the consumer.
 *
 * @example
 * ```tsx
 * 'use client'
 * import { useRelatedItems } from 'payload-related-items/client'
 *
 * function RelatedSection({ articleId }: { articleId: string }) {
 *   const { items, loading, error } = useRelatedItems({
 *     collection: 'articles',
 *     id: articleId,
 *     limit: 4,
 *     populate: 1,
 *   })
 *   if (loading) return <Skeleton />
 *   if (error) return null
 *   if (!items.length) return null
 *   return <ul>{items.map((i) => <li key={i.id}>{i.doc?.title ?? i.id}</li>)}</ul>
 * }
 * ```
 */
export function useRelatedItems<
  TSource = Record<string, unknown>,
  TDoc = Record<string, unknown>,
>(options: UseRelatedItemsOptions): UseRelatedItemsResult<TSource, TDoc> {
  const {
    id,
    collection,
    crossCollection,
    endpoint = '/api/related',
    excludeCollections,
    fetcher,
    limit,
    minScore,
    populate,
    scorer,
    skip = false,
    skipCache,
    skipPrecomputed,
  } = options

  const url = useMemo(() => {
    if (!collection || id == null || id === '') {return null}
    const params = new URLSearchParams()
    if (limit != null) {params.set('limit', String(limit))}
    if (scorer) {params.set('scorer', scorer)}
    if (crossCollection != null) {params.set('crossCollection', String(crossCollection))}
    if (excludeCollections?.length) {
      params.set('excludeCollections', excludeCollections.join(','))
    }
    if (minScore != null) {params.set('minScore', String(minScore))}
    if (skipCache) {params.set('skipCache', 'true')}
    if (skipPrecomputed) {params.set('skipPrecomputed', 'true')}
    if (populate != null) {
      params.set('populate', typeof populate === 'number' ? String(populate) : String(populate))
    }
    const base = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
    const qs = params.toString()
    return `${base}/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}${qs ? `?${qs}` : ''}`
  }, [
    collection,
    crossCollection,
    endpoint,
    excludeCollections,
    id,
    limit,
    minScore,
    populate,
    scorer,
    skipCache,
    skipPrecomputed,
  ])

  const [state, setState] = useState<{
    error: Error | null
    items: RelatedItem<TSource, TDoc>[]
    loading: boolean
  }>({
    error: null,
    items: [],
    loading: Boolean(url && !skip),
  })

  // Track abort controller so rapid re-renders cancel stale requests.
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(async () => {
    if (!url || skip) {
      setState({ error: null, items: [], loading: false })
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState((s) => ({ ...s, error: null, loading: true }))
    try {
      const doFetch = fetcher ?? fetch
      const res = await doFetch(url, { credentials: 'include', signal: controller.signal })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed: ${res.status}`)
      }
      const payload = (await res.json()) as { results: RelatedItem<TSource, TDoc>[] }
      if (!controller.signal.aborted) {
        setState({ error: null, items: payload.results ?? [], loading: false })
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {return}
      setState({ error: err as Error, items: [], loading: false })
    }
  }, [fetcher, skip, url])

  useEffect(() => {
    void run()
    return () => abortRef.current?.abort()
  }, [run])

  return { error: state.error, items: state.items, loading: state.loading, refetch: run }
}
