'use client'

import { useConfig, useDocumentInfo } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import { useEffect, useMemo, useState } from 'react'

import type { RelatedItem, ScorerName } from '../types.js'

import styles from './RelatedItemsField.module.css'

const SCORER_OPTIONS: Array<{ label: string; value: '' | ScorerName }> = [
  { label: 'Collection default', value: '' },
  { label: 'BM25', value: 'bm25' },
  { label: 'Dice', value: 'dice' },
  { label: 'Jaccard', value: 'jaccard' },
  { label: 'Weighted Jaccard', value: 'weightedJaccard' },
]

interface RelatedItemsFieldProps {
  /** Override `crossCollection` for this widget. */
  crossCollection?: boolean
  /** Path of the REST endpoint mounted by the plugin. Default: `/related`. */
  endpointPath?: string
  /** Additional collections to exclude from results in this widget. */
  excludeCollections?: string[]
  /** Defaults to 'Related items'. Can be overridden via plugin config. */
  label?: string
  /** Max items to render in the sidebar. Default: 5. */
  limit?: number
  /** Override minimum-score threshold for this widget. */
  minScore?: number
  /**
   * Scorer to use for this widget. When omitted, the endpoint falls back to the
   * collection-level default (set in `payloadRelatedItems({ collections })`).
   */
  scorer?: ScorerName
}

/**
 * Admin UI field component. Fetches related items for the currently edited
 * document via the plugin's REST endpoint and renders them as a compact
 * sidebar list with per-item score and matched keywords.
 *
 * Ranking is controlled at the **widget** layer: `scorer`, `limit`, and other
 * overrides are configured on `adminField` (or per-mount, when used directly
 * via `<RelatedItemsField scorer="..." />`) and are independent of the
 * collection-level defaults the REST API and `getRelated()` use otherwise.
 */
export const RelatedItemsField: React.FC<RelatedItemsFieldProps> = ({
  crossCollection,
  endpointPath = '/related',
  excludeCollections,
  label = 'Related items',
  limit = 5,
  minScore,
  scorer,
}) => {
  // `useDocumentInfo`/`useConfig` can legitimately return `undefined` when this
  // component is rendered outside the Payload admin provider tree (e.g. during
  // HMR boundary re-renders, or in a misconfigured dev setup with duplicated
  // React instances). Guard defensively so the whole admin doesn't explode.
  const docInfo = useDocumentInfo() as ReturnType<typeof useDocumentInfo> | undefined
  const cfgCtx = useConfig() as ReturnType<typeof useConfig> | undefined
  const id = docInfo?.id
  const collectionSlug = docInfo?.collectionSlug
  const apiRoute = cfgCtx?.config?.routes?.api

  const [items, setItems] = useState<null | RelatedItem[]>(null)
  const [error, setError] = useState<null | string>(null)
  const [selectedScorer, setSelectedScorer] = useState<'' | ScorerName>(scorer ?? '')
  const effectiveScorer = selectedScorer || undefined

  const url = useMemo(() => {
    if (!id || !collectionSlug || !apiRoute) {return null}
    const base = endpointPath.startsWith('/') ? endpointPath.slice(1) : endpointPath
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (effectiveScorer) {params.set('scorer', effectiveScorer)}
    if (minScore != null) {params.set('minScore', String(minScore))}
    if (crossCollection != null) {
      params.set('crossCollection', crossCollection ? 'true' : 'false')
    }
    if (excludeCollections && excludeCollections.length > 0) {
      params.set('excludeCollections', excludeCollections.join(','))
    }
    const path =
      `/${base}/${collectionSlug}/${String(id)}?${params.toString()}` as `/${string}`
    return formatAdminURL({ apiRoute, path })
  }, [
    id,
    collectionSlug,
    apiRoute,
    endpointPath,
    limit,
    effectiveScorer,
    minScore,
    crossCollection,
    excludeCollections,
  ])

  useEffect(() => {
    if (!url) {return}
    let cancelled = false
    setError(null)
    setItems(null)

    void fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {throw new Error(`HTTP ${res.status}`)}
        return res.json() as Promise<{ results: RelatedItem[] }>
      })
      .then((data) => {
        if (cancelled) {return}
        setItems(data.results ?? [])
      })
      .catch((err: Error) => {
        if (cancelled) {return}
        setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [url])

  if (!cfgCtx || !docInfo) {return null}

  if (!id) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.label}>
          <span>{label}</span>
          <ScorerSelector selectedScorer={selectedScorer} setSelectedScorer={setSelectedScorer} />
        </div>
        <ScoreRangeNote />
        <div className={styles.empty}>Save the document to see related items.</div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        <span>{label}</span>
        <ScorerSelector selectedScorer={selectedScorer} setSelectedScorer={setSelectedScorer} />
      </div>
      <ScoreRangeNote />
      {error && <div className={styles.error}>Error: {error}</div>}
      {!error && items === null && <div className={styles.loading}>Computing…</div>}
      {items !== null && items.length === 0 && (
        <div className={styles.empty}>No related items found.</div>
      )}
      {items !== null && items.length > 0 && (
        <ul className={styles.list}>
          {items.map((item) => (
            <RelatedItemRow item={item} key={`${item.collection}:${item.id}`} />
          ))}
        </ul>
      )}
    </div>
  )
}

const ScorerSelector: React.FC<{
  selectedScorer: '' | ScorerName
  setSelectedScorer: (scorer: '' | ScorerName) => void
}> = ({ selectedScorer, setSelectedScorer }) => (
  <label className={styles.scorerControl}>
    <span className={styles.scorerLabel}>Scorer</span>
    <select
      className={styles.scorerSelect}
      onChange={(event) => {
        const value = event.currentTarget.value
        setSelectedScorer(value === '' ? '' : (value as ScorerName))
      }}
      value={selectedScorer}
    >
      {SCORER_OPTIONS.map((option) => (
        <option key={option.value || 'default'} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
)

const ScoreRangeNote: React.FC = () => (
  <div className={styles.scoreNote}>Scores range from 0 to 1. Higher scores mean stronger matches.</div>
)

const RelatedItemRow: React.FC<{ item: RelatedItem }> = ({ item }) => {
  const source = item.source ?? {}
  const title =
    (typeof source.title === 'string' && source.title) ||
    (typeof source.name === 'string' && source.name) ||
    (typeof source.slug === 'string' && source.slug) ||
    String(item.id)

  const href = `/admin/collections/${item.collection}/${item.id}`

  return (
    <li className={styles.item}>
      <a className={styles.link} href={href}>
        {title}
      </a>
      <div className={styles.meta}>
        <span className={styles.collection}>{item.collection}</span>
        <span className={styles.score}>score {item.score.toFixed(3)}</span>
      </div>
      {item.matchedKeywords.length > 0 && (
        <div className={styles.keywords}>
          {item.matchedKeywords.slice(0, 6).map((kw) => (
            <span className={styles.keyword} key={kw}>
              {kw}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}
