import type { Payload } from 'payload'

import type { LruTtlCache } from './cache/index.js'
import type { RelatedItem, SanitizedConfig, SourceAdapterObject } from './types.js'

/**
 * Per-payload-instance runtime state. Kept out of the plugin config so hot
 * state (cache, stats counters) can mutate without disturbing the immutable
 * payload config object.
 */
export interface Runtime {
  cache: LruTtlCache<RelatedItem[]> | null
  config: SanitizedConfig
  source: SourceAdapterObject
}

// Using `Symbol.for` guarantees the same symbol across duplicated module
// instances (common under Next.js / Turbopack when a workspace package is
// imported from multiple bundles). We attach the runtime directly to the
// payload instance so any module copy can retrieve it.
const RUNTIME_KEY = Symbol.for('payload-related-items.runtime')

type PayloadWithRuntime = { [RUNTIME_KEY]?: Runtime } & Payload

export function registerRuntime(payload: Payload, runtime: Runtime): void {
  ;(payload as PayloadWithRuntime)[RUNTIME_KEY] = runtime
}

export function getRuntime(payload: Payload): Runtime {
  const rt = (payload as PayloadWithRuntime)[RUNTIME_KEY]
  if (!rt) {
    throw new Error(
      '[payload-related-items] Runtime not initialized. Did you add payloadRelatedItems() to your Payload config?',
    )
  }
  return rt
}

/**
 * Builds a stable cache key from the query options so equivalent queries hit the cache.
 */
export function buildCacheKey(args: {
  collection: string
  crossCollection?: boolean
  excludeCollections?: string[]
  excludeIds?: Array<number | string>
  filter?: unknown
  id: number | string
  limit?: number
  minScore?: number
  scorer?: string
}): string {
  const parts = [
    args.collection,
    String(args.id),
    args.limit ?? '',
    args.scorer ?? '',
    args.crossCollection == null ? '' : String(args.crossCollection),
    [...(args.excludeCollections ?? [])].sort().join(','),
    [...(args.excludeIds ?? []).map(String)].sort().join(','),
    args.minScore == null ? '' : String(args.minScore),
    args.filter ? JSON.stringify(args.filter) : '',
  ]
  return parts.join('|')
}
