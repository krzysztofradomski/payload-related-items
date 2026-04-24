import type { CollectionConfig } from 'payload'

import type { SanitizedConfig } from '../types.js'

import { getRuntime } from '../runtime.js'
import { deletePrecomputedFor, precomputeFor } from '../sidecar/writePrecomputed.js'

/**
 * Attaches afterChange + afterDelete hooks to the source (search) collection so that:
 *
 *   - The in-memory result cache is flushed on any change (cheap and correct).
 *   - When precompute is enabled, the changed doc's sidecar row is recomputed.
 *   - When precompute is enabled, a delete cascades to the sidecar row.
 */
export function attachSourceHooks(collection: CollectionConfig, config: SanitizedConfig): void {
  const existingAfterChange = Array.isArray(collection.hooks?.afterChange)
    ? collection.hooks.afterChange
    : []
  const existingAfterDelete = Array.isArray(collection.hooks?.afterDelete)
    ? collection.hooks.afterDelete
    : []

  collection.hooks = {
    ...collection.hooks,
    afterChange: [
      ...existingAfterChange,
      async ({ doc, req }) => {
        try {
          const runtime = getRuntime(req.payload)
          runtime.cache?.clear()
          if (!config.precompute.enabled || !config.precompute.incremental) {return}

          const rel = doc?.[config.source.relationshipField] as
            | { relationTo?: string; value?: unknown }
            | undefined
          const targetCollection = rel?.relationTo
          const targetId = rel?.value
          if (!targetCollection || targetId == null) {return}
          if (!(targetCollection in config.collections)) {return}

          const docId =
            typeof targetId === 'object' && targetId !== null && 'id' in targetId
              ? String((targetId as { id: unknown }).id)
              : typeof targetId === 'string' || typeof targetId === 'number'
                ? String(targetId)
                : ''
          if (!docId) {return}

          await precomputeFor({
            id: docId,
            collection: targetCollection,
            config,
            payload: req.payload,
            req,
          })
        } catch (err) {
          req.payload.logger.error?.(
            `[payload-related-items] afterChange sync failed: ${String(err)}`,
          )
        }
      },
    ],
    afterDelete: [
      ...existingAfterDelete,
      async ({ doc, req }) => {
        try {
          const runtime = getRuntime(req.payload)
          runtime.cache?.clear()
          if (!config.precompute.enabled) {return}

          const rel = doc?.[config.source.relationshipField] as
            | { relationTo?: string; value?: unknown }
            | undefined
          const targetCollection = rel?.relationTo
          const targetId = rel?.value
          if (!targetCollection || targetId == null) {return}
          if (!(targetCollection in config.collections)) {return}

          const docId =
            typeof targetId === 'object' && targetId !== null && 'id' in targetId
              ? String((targetId as { id: unknown }).id)
              : typeof targetId === 'string' || typeof targetId === 'number'
                ? String(targetId)
                : ''
          if (!docId) {return}

          await deletePrecomputedFor({
            id: docId,
            collection: targetCollection,
            config,
            payload: req.payload,
            req,
          })
        } catch (err) {
          req.payload.logger.error?.(
            `[payload-related-items] afterDelete sync failed: ${String(err)}`,
          )
        }
      },
    ],
  }
}
