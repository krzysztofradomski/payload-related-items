import type { CollectionSlug, Payload, PayloadRequest, Where } from 'payload'

// ---------------------------------------------------------------------------
// Scorers
// ---------------------------------------------------------------------------

/**
 * Built-in set-similarity scorers.
 *
 * - `jaccard`           — |A ∩ B| / |A ∪ B|. Classic, cheap, high variance on sparse sets.
 * - `weightedJaccard`   — Jaccard with token multiplicity (best when keyword arrays may contain duplicates or repeat counts).
 * - `dice`              — 2|A ∩ B| / (|A| + |B|). More forgiving than Jaccard on short lists.
 * - `bm25`              — BM25-weighted set similarity. Down-weights common terms via IDF across the corpus and normalizes for length. Best default for "real" content.
 */
export type ScorerName = 'bm25' | 'dice' | 'jaccard' | 'weightedJaccard'

export interface ScorerContext {
  /** Average number of keywords per document. Used for BM25 length normalization. */
  avgDocLength: number
  /** BM25 tuning: length normalization. Default: 0.75 */
  b?: number
  /** Map of keyword → document frequency across the corpus (number of docs containing the term). */
  documentFrequency: Map<string, number>
  /** BM25 tuning: term frequency saturation. Default: 1.2 */
  k1?: number
  /** Total number of documents in the corpus. */
  totalDocs: number
}

/**
 * A scorer is a pure function from (query, candidate, context) → score in [0, 1].
 */
export type ScorerFn = (
  query: ReadonlyArray<string>,
  candidate: ReadonlyArray<string>,
  ctx: ScorerContext,
) => number

// ---------------------------------------------------------------------------
// Per-field configuration
// ---------------------------------------------------------------------------

export interface RelatedItemsFieldConfig {
  /** Name of the field on the source collection containing a string[] (or JSON-serialized string[]). */
  name: string
  /** Override the collection-level default scorer for this field. */
  scorer?: ScorerName
  /**
   * Contribution of this field to the blended score.
   * Weights are relative; the plugin normalizes them before combining. Default: 1.
   */
  weight?: number
}

// ---------------------------------------------------------------------------
// Recency decay
// ---------------------------------------------------------------------------

export interface RecencyConfig {
  /** Date field name on the source collection (e.g. `updatedAt`). */
  field: string
  /**
   * Minimum multiplier floor in [0, 1]. Results older than several half-lives
   * will bottom out at this value instead of approaching zero.
   * Default: 0 (unbounded decay toward 0).
   */
  floor?: number
  /** Half-life in days — score multiplier halves every N days of age. */
  halfLifeDays: number
}

// ---------------------------------------------------------------------------
// Collection-level configuration
// ---------------------------------------------------------------------------

export interface RelatedItemsCollectionConfig {
  /**
   * If false, only return results from the same collection as the source document.
   * Default: true (return related items across all indexed collections).
   */
  crossCollection?: boolean
  /** Exclude the source document itself from results. Default: true. */
  excludeSelf?: boolean
  /**
   * Fields on the source (search) collection to score on.
   * Default: `[{ name: 'keywords', weight: 1 }]` (uses the plugin's `source.defaultKeywordsField`).
   */
  fields?: RelatedItemsFieldConfig[]
  /** Additional `where` clause applied to the source collection when fetching candidates. */
  filter?: Where
  /** Minimum blended score to include in results. Default: 0. */
  minScore?: number
  /** Apply a recency decay multiplier to the blended score. */
  recency?: RecencyConfig
  /** Default scorer for any field that doesn't specify its own. Default: `bm25`. */
  scorer?: ScorerName
  /** Maximum number of related items to return. Default: 4. */
  topK?: number
}

// ---------------------------------------------------------------------------
// Plugin-level configuration
// ---------------------------------------------------------------------------

export interface RelatedItemsSourceConfig {
  /**
   * Custom source adapter. When omitted, the plugin reads from the collection
   * populated by `@payloadcms/plugin-search`.
   */
  adapter?: SourceAdapter
  /**
   * Slug of the source collection supplying keyword data.
   * Default: `'search'` — the default slug produced by `@payloadcms/plugin-search`.
   */
  collection?: string
  /**
   * Default keywords field name on the source collection. Used when a per-field
   * config isn't provided. Default: `'keywords'`.
   */
  defaultKeywordsField?: string
  /**
   * Name of the relationship field on the source that points back to the original document.
   * The plugin reads `{ relationTo, value }` from this field.
   * Default: `'doc'`.
   */
  relationshipField?: string
}

export interface RelatedItemsCacheConfig {
  /** Default: true. */
  enabled?: boolean
  /** Maximum number of cached entries (LRU). Default: 1000. */
  maxEntries?: number
  /** Default: 300 (5 minutes). */
  ttlSeconds?: number
}

export interface RelatedItemsPrecomputeConfig {
  /**
   * Slug of the sidecar collection used to store precomputed top-K related items per source doc.
   * Default: `'related-items-index'`.
   */
  collectionSlug?: string
  /** Default: false. */
  enabled?: boolean
  /**
   * Update the sidecar on every source doc create/update/delete.
   * Default: true. Set to false to rely solely on periodic full rebuilds.
   */
  incremental?: boolean
  /** Items stored per source doc. Default: 20. */
  topK?: number
}

export interface RelatedItemsAdminFieldConfig {
  /**
   * Override `crossCollection` for this widget only. When omitted, the widget
   * uses whatever the source collection is configured for.
   */
  crossCollection?: boolean
  /** Default: true. */
  enabled?: boolean
  /** Additional collections to exclude from results in this widget only. */
  excludeCollections?: string[]
  /** Human-readable label. Default: `Related items`. */
  label?: Record<string, string> | string
  /** How many items to render. Default: 5. */
  limit?: number
  /**
   * Minimum blended score to include in results in this widget only. Useful for
   * keeping low-confidence matches out of the editor UI without changing the
   * collection-wide threshold used by the REST API. When omitted, the
   * collection's `minScore` is used.
   */
  minScore?: number
  /** Field name in the admin. Default: `relatedItems`. */
  name?: string
  /** UI position. Default: `sidebar`. */
  position?: 'main' | 'sidebar'
  /**
   * Scoring algorithm to use **for this widget only**. Independent of the
   * collection's default scorer (which is what `getRelated()` and the REST
   * endpoint use when no scorer is requested). Defaults to the collection's
   * scorer (which itself defaults to `bm25`). Pick by content shape:
   *  - `bm25` (default): best general-purpose. Down-weights common terms via
   *     IDF and length-normalizes; needs a real corpus to shine.
   *  - `weightedJaccard`: respects keyword multiplicity; good when your
   *     keyword arrays repeat important terms.
   *  - `dice`: more forgiving than Jaccard for short keyword lists.
   *  - `jaccard`: cheapest, classic set similarity. High variance on sparse
   *     sets; use for debugging/comparison.
   */
  scorer?: ScorerName
}

export interface RelatedItemsEndpointConfig {
  /** Default: true. */
  enabled?: boolean
  /** Endpoint path. Default: `/related`. Served under `/api{path}/:collection/:id`. */
  path?: string
}

/**
 * Admin "keyword cloud" widget shown below the source collection's list view,
 * plus the REST endpoint backing it.
 *
 * Computation is **fully on-demand**: nothing runs at plugin boot, and the
 * endpoint only aggregates when hit. Results are cached for `ttlSeconds` per
 * query-param combination inside the Node process.
 */
export interface RelatedItemsWordCloudConfig {
  /** Default: true. When false, neither the endpoint nor the admin widget are registered. */
  enabled?: boolean
  /**
   * Path under the main endpoint base. Default: `/word-cloud`. With the default
   * `endpoint.path = '/related'` this lands at `GET /api/related/word-cloud`.
   */
  endpointPath?: string
  /** Top-N terms returned per call. Default: 100. */
  limit?: number
  /** Minimum character length for a term to be counted. Default: 3. */
  minLength?: number
  /**
   * Maximum source rows the endpoint will scan per call. The aggregation is
   * paginated in batches of 200 and stops at this cap. Default: 2000.
   * Bump if your source corpus is larger and you want a broader sample.
   */
  sampleSize?: number
  /** Result cache TTL in seconds. Set to 0 to disable. Default: 60. */
  ttlSeconds?: number
}

/**
 * Public plugin configuration.
 */
export interface PayloadRelatedItemsConfig {
  /** Admin UI field shown on every enabled collection. Set to `false` to disable. */
  adminField?: false | RelatedItemsAdminFieldConfig
  /** In-memory cache of query results. Set to `false` to disable. */
  cache?: false | RelatedItemsCacheConfig
  /**
   * Collections to attach the plugin to. Each value may be `true` (use defaults) or
   * an override object. Only collections listed here get the admin field, the hooks,
   * and appear as related-item candidates.
   */
  collections?: Partial<Record<CollectionSlug, RelatedItemsCollectionConfig | true>>
  /**
   * Keep collections/fields registered but skip hooks, endpoints, and sidecar work.
   * Useful for database-schema parity when temporarily disabling the plugin.
   */
  disabled?: boolean
  /** REST endpoint for querying related items. Set to `false` to disable. */
  endpoint?: false | RelatedItemsEndpointConfig
  /** Precomputed top-K sidecar collection. Off by default; turn on for large corpora (>10k docs). */
  precompute?: RelatedItemsPrecomputeConfig
  /** How the plugin reads keyword data (typically from the search plugin's collection). */
  source?: RelatedItemsSourceConfig
  /**
   * Admin word-cloud widget shown below the source collection's list view,
   * plus the REST endpoint backing it. Computation is on-demand, cached
   * briefly in-memory. Set to `false` to disable both the widget and the
   * endpoint.
   */
  wordCloud?: false | RelatedItemsWordCloudConfig
}

// ---------------------------------------------------------------------------
// Sanitized internal config (what the plugin actually reads at runtime)
// ---------------------------------------------------------------------------

export interface SanitizedFieldConfig {
  name: string
  scorer: ScorerName
  weight: number
}

export interface SanitizedCollectionConfig {
  crossCollection: boolean
  excludeSelf: boolean
  fields: SanitizedFieldConfig[]
  filter?: Where
  minScore: number
  recency?: RecencyConfig
  scorer: ScorerName
  topK: number
}

export interface SanitizedConfig {
  adminField:
    | false
    | (Pick<
          RelatedItemsAdminFieldConfig,
          'crossCollection' | 'excludeCollections' | 'minScore' | 'scorer'
        > &
        Required<
          Pick<RelatedItemsAdminFieldConfig, 'enabled' | 'label' | 'limit' | 'name' | 'position'>
        >)
  cache: false | Required<RelatedItemsCacheConfig>
  collections: Record<string, SanitizedCollectionConfig>
  disabled: boolean
  endpoint: false | Required<RelatedItemsEndpointConfig>
  precompute: Required<RelatedItemsPrecomputeConfig>
  source: Pick<RelatedItemsSourceConfig, 'adapter'> & Required<Omit<RelatedItemsSourceConfig, 'adapter'>>
  wordCloud: false | Required<RelatedItemsWordCloudConfig>
}

// ---------------------------------------------------------------------------
// Public query API
// ---------------------------------------------------------------------------

export interface GetRelatedOptions {
  collection: string
  /** Override cross-collection behavior. */
  crossCollection?: boolean
  /** Additional collections to exclude from results. */
  excludeCollections?: string[]
  /** Additional document IDs to exclude (applied to the source-collection candidates). */
  excludeIds?: Array<number | string>
  /** Extra `where` clause on the source collection. Merged (AND) with the collection's `filter`. */
  filter?: Where
  id: number | string
  /** Override the configured `topK`. */
  limit?: number
  /** Override minimum-score threshold. */
  minScore?: number
  payload: Payload
  /**
   * If set, batch-load the originating docs from their collections and attach them
   * as `doc` on each RelatedItem. Useful for rendering without a second fetch.
   *  - `true` → populate with `depth: 0`
   *  - `{ depth: 1 }` → populate with the given Payload `depth` (to resolve relationships like media)
   *  - `false` / undefined → no population (default)
   */
  populate?: { depth?: number } | boolean
  /** Pass a `PayloadRequest` for access-control-aware source lookups. */
  req?: PayloadRequest
  /** Override the configured default scorer for this query. */
  scorer?: ScorerName
  /** Skip in-memory cache. */
  skipCache?: boolean
  /** Skip reading from the precomputed sidecar collection; always compute live. */
  skipPrecomputed?: boolean
}

export interface RelatedItem<TSource = Record<string, unknown>, TDoc = Record<string, unknown>> {
  /** Original document collection slug (from `doc.relationTo`). */
  collection: string
  /**
   * Full original document, fetched from its collection via `payload.findByID`.
   * Only present when `populate: true` (or `populate: { depth }`) is passed to `getRelated`
   * / the REST endpoint. Respects access control when a `req` is available.
   */
  doc?: TDoc
  /** Per-field raw scores, before weighting and recency decay. Useful for debugging and explainability. */
  fieldScores: Record<string, number>
  /** Original document ID (from `doc.value`). */
  id: number | string
  /** Overlapping keywords for the first configured field. Handy for "why was this related?" UI. */
  matchedKeywords: string[]
  /** Recency multiplier applied (if recency is configured). 1 means "no decay applied". */
  recencyMultiplier: number
  /** Blended score. For single-field + single-scorer runs this is in [0, 1]; multi-field blends may exceed that intuitively but are always ordered consistently. */
  score: number
  /** Raw source-collection row (trimmed to useful fields). */
  source: TSource
}

// ---------------------------------------------------------------------------
// Source adapter — minimal surface the rest of the plugin depends on
// ---------------------------------------------------------------------------

export interface SourceRow {
  /** Original collection slug (from relationshipField.relationTo). */
  collection: string
  /** Original document ID (from relationshipField.value), stringified for stable lookups. */
  docId: string
  /** Per-field keyword arrays. Keys are field names from the sanitized config. */
  keywordsByField: Record<string, string[]>
  /** Full raw row — handy to surface title/slug/description in the result. */
  raw: Record<string, unknown>
  /** Date used for recency decay (ISO string or Date). Optional. */
  recencyDate?: Date | null | string
  /** Source-collection document ID (NOT the original doc ID). */
  sourceId: number | string
}

export interface FetchSourceArgs {
  /** Extra filter to AND into the query. */
  filter?: Where
  payload: Payload
  req?: PayloadRequest
}

export interface FindSourceArgs {
  collection: string
  id: number | string
  payload: Payload
  req?: PayloadRequest
}

export interface SourceAdapter {
  findOne: (args: FindSourceArgs) => Promise<null | SourceRow>
  list: (args: FetchSourceArgs) => Promise<SourceRow[]>
}
