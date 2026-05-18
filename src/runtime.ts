import type { Config, Payload } from 'payload'

import type { LruTtlCache } from './cache/index.js'
import type { RelatedItem, SanitizedConfig, SourceAdapterObject } from './types.js'

import { LruTtlCache as LruTtlCacheImpl } from './cache/index.js'
import { normalizeSourceAdapter } from './source/adapter.js'
import { createSearchPluginSource } from './source/searchPluginSource.js'

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
const CUSTOM_CONFIG_KEY = 'payload-related-items'

type PayloadWithRuntime = { [RUNTIME_KEY]?: Runtime } & Payload

/**
 * Stores the plugin's sanitized config on `config.custom` so the runtime can
 * be created lazily on first use (e.g. when `onInit` was skipped due to
 * getPayload caching or dev HMR). Symbol keys would be dropped by Payload's
 * config sanitizer, which shallow-copies the root config object.
 */
export function attachSanitizedConfig(config: Config, sanitized: SanitizedConfig): void {
  if (config.custom == null || typeof config.custom !== 'object') {
    config.custom = {}
  }
  ;(config.custom as Record<string, unknown>)[CUSTOM_CONFIG_KEY] = sanitized
}

function getAttachedSanitizedConfig(config: Payload['config']): SanitizedConfig | undefined {
  const custom = config.custom
  if (custom == null || typeof custom !== 'object') {
    return undefined
  }
  return (custom as Record<string, unknown>)[CUSTOM_CONFIG_KEY] as SanitizedConfig | undefined
}

export function createRuntime(sanitized: SanitizedConfig): Runtime {
  const cache =
    sanitized.cache === false || !sanitized.cache.enabled
      ? null
      : new LruTtlCacheImpl<RelatedItem[]>({
          maxEntries: sanitized.cache.maxEntries,
          ttlSeconds: sanitized.cache.ttlSeconds,
        })

  return {
    cache,
    config: sanitized,
    source: normalizeSourceAdapter({
      adapter: sanitized.source.adapter ?? createSearchPluginSource({ config: sanitized }),
      config: sanitized,
    }),
  }
}

export function registerRuntime(payload: Payload, runtime: Runtime): void {
  ;(payload as PayloadWithRuntime)[RUNTIME_KEY] = runtime
}

export function getRuntime(payload: Payload): Runtime {
  const existing = (payload as PayloadWithRuntime)[RUNTIME_KEY]
  if (existing) {
    return existing
  }

  const sanitized = getAttachedSanitizedConfig(payload.config)
  if (!sanitized) {
    throw new Error(
      '[payload-related-items] Runtime not initialized. Did you add payloadRelatedItems() to your Payload config?',
    )
  }

  const runtime = createRuntime(sanitized)
  registerRuntime(payload, runtime)
  return runtime
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
