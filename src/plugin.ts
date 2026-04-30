import type { CollectionConfig, Config } from 'payload'

import type { PayloadRelatedItemsConfig, RelatedItem } from './types.js'

import { LruTtlCache } from './cache/index.js'
import { sanitizeConfig } from './defaults.js'
import { buildRelatedEndpoint } from './endpoints/relatedEndpoint.js'
import { buildWordCloudEndpoint } from './endpoints/wordCloudEndpoint.js'
import { buildAdminField } from './fields/relatedItemsField.js'
import { attachSourceHooks } from './hooks/sourceHooks.js'
import { registerRuntime } from './runtime.js'
import { buildSidecarCollection } from './sidecar/collection.js'
import { createSearchPluginSource } from './source/searchPluginSource.js'

/**
 * The payload-related-items plugin.
 *
 * Adds related-items querying, an admin sidebar field, a REST endpoint,
 * optional precomputed top-K storage, and cache management on top of data
 * produced by `@payloadcms/plugin-search` (or any compatible source collection).
 *
 * Usage:
 * ```ts
 * import { payloadRelatedItems } from 'payload-related-items'
 *
 * buildConfig({
 *   plugins: [
 *     searchPlugin({ ... }),
 *     payloadRelatedItems({
 *       collections: {
 *         articles: true,
 *         posts: { scorer: 'bm25', topK: 6 },
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
export const payloadRelatedItems =
  (pluginOptions: PayloadRelatedItemsConfig = {}) =>
  (incomingConfig: Config): Config => {
    const sanitized = sanitizeConfig(pluginOptions)

    const config: Config = {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? [])],
    }

    // Register the sidecar collection if precompute is enabled. We always register
    // it (even if `disabled`) for DB schema consistency across deployments — this
    // matches the convention used by other Payload plugins (e.g. search, seo).
    if (sanitized.precompute.enabled) {
      const sidecar = buildSidecarCollection(sanitized)
      if (!config.collections!.some((c) => c.slug === sidecar.slug)) {
        config.collections!.push(sidecar)
      }
    }

    // Attach the admin field (UI-only) to each configured collection.
    const adminField = buildAdminField(sanitized)
    if (adminField) {
      config.collections = config.collections!.map((collection) => {
        if (!(collection.slug in sanitized.collections)) {return collection}
        // Avoid double-adding on HMR reloads.
        const fieldName = 'name' in adminField ? adminField.name : undefined
        if (
          fieldName &&
          (collection.fields ?? []).some(
            (f) => 'name' in f && (f as { name?: string }).name === fieldName,
          )
        ) {
          return collection
        }
        return {
          ...collection,
          fields: [...(collection.fields ?? []), adminField],
        }
      })
    }

    // Bail out before attaching hooks/endpoints/onInit when disabled — but keep
    // collection/field registration for schema parity.
    if (sanitized.disabled) {
      return config
    }

    // Attach afterChange/afterDelete hooks to the source collection so cache
    // + sidecar stay in sync with search-plugin writes. Also inject the
    // word-cloud admin list-view add-on if enabled.
    const wordCloudEnabled =
      sanitized.endpoint !== false &&
      sanitized.endpoint.enabled &&
      sanitized.wordCloud !== false &&
      sanitized.wordCloud.enabled
    const wordCloudPath =
      wordCloudEnabled && sanitized.endpoint !== false && sanitized.wordCloud !== false
        ? `${sanitized.endpoint.path}${sanitized.wordCloud.endpointPath}`
        : null

    config.collections = config.collections!.map((collection) => {
      if (collection.slug !== sanitized.source.collection) {
        return collection
      }
      const cloned: CollectionConfig = { ...collection, hooks: { ...collection.hooks } }
      attachSourceHooks(cloned, sanitized)

      if (wordCloudEnabled && wordCloudPath) {
        const existingAdmin = cloned.admin ?? {}
        const existingComponents = existingAdmin.components ?? {}
        const existingAfterList = Array.isArray(existingComponents.afterList)
          ? existingComponents.afterList
          : []
        cloned.admin = {
          ...existingAdmin,
          components: {
            ...existingComponents,
            afterList: [
              ...existingAfterList,
              {
                clientProps: {
                  endpointPath: wordCloudPath,
                  limit:
                    sanitized.wordCloud !== false ? sanitized.wordCloud.limit : 100,
                  sampleSize:
                    sanitized.wordCloud !== false ? sanitized.wordCloud.sampleSize : 2000,
                  sourceCollection: sanitized.source.collection,
                },
                path: 'payload-related-items/client#WordCloud',
              },
            ],
          },
        }
      }

      return cloned
    })

    if (sanitized.endpoint !== false && sanitized.endpoint.enabled) {
      config.endpoints = [...(config.endpoints ?? []), buildRelatedEndpoint(sanitized)]
      const wordCloudEndpoint = buildWordCloudEndpoint(sanitized)
      if (wordCloudEndpoint) {
        config.endpoints = [...config.endpoints, wordCloudEndpoint]
      }
    }

    // Initialize the per-Payload runtime on first boot.
    const incomingOnInit = config.onInit
    config.onInit = async (payload) => {
      if (incomingOnInit) {await incomingOnInit(payload)}

      const cache =
        sanitized.cache === false || !sanitized.cache.enabled
          ? null
          : new LruTtlCache<RelatedItem[]>({
              maxEntries: sanitized.cache.maxEntries,
              ttlSeconds: sanitized.cache.ttlSeconds,
            })

      registerRuntime(payload, {
        cache,
        config: sanitized,
        source: sanitized.source.adapter ?? createSearchPluginSource({ config: sanitized }),
      })

      payload.logger.info?.(
        `[payload-related-items] Initialized (collections: ${Object.keys(sanitized.collections).join(', ') || '<none>'}, ` +
          `source: ${sanitized.source.collection}, precompute: ${sanitized.precompute.enabled ? 'on' : 'off'}).`,
      )
    }

    return config
  }
