/**
 * Tiny, dependency-free LRU cache with per-entry TTL.
 *
 * The plugin uses a single cache for:
 *   - Result cache: keyed by (collection, id, serialized-opts) → RelatedItem[].
 *
 * Invalidation strategy: the hooks module wipes the entire cache whenever any
 * indexed source row changes. At the sizes this plugin targets (low tens of
 * thousands of source rows) a full flush is cheaper and simpler than maintaining
 * per-entry dependency tracking.
 *
 * This cache is in-memory and per-process. Multi-instance deployments (serverless
 * replicas, multi-container) get independent caches; stale entries age out after
 * `ttlSeconds`. Use `precompute` for deterministic cross-instance consistency.
 */
export class LruTtlCache<V> {
  private readonly maxEntries: number
  private readonly store: Map<string, { expiresAt: number; value: V }>
  private readonly ttlMs: number

  constructor(options: { maxEntries: number; ttlSeconds: number }) {
    this.maxEntries = Math.max(1, options.maxEntries)
    this.ttlMs = Math.max(0, options.ttlSeconds) * 1000
    this.store = new Map()
  }

  clear(): void {
    this.store.clear()
  }

  get(key: string): undefined | V {
    const entry = this.store.get(key)
    if (!entry) {return undefined}
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    // Refresh recency ordering.
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: string, value: V): void {
    if (this.store.has(key)) {this.store.delete(key)}
    this.store.set(key, { expiresAt: Date.now() + this.ttlMs, value })
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value
      if (!oldestKey) {break}
      this.store.delete(oldestKey)
    }
  }

  get size(): number {
    return this.store.size
  }
}
