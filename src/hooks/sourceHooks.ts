import type { CollectionConfig } from 'payload'

import type { SanitizedConfig } from '../types.js'

import { getRuntime } from '../runtime.js'
import { deletePrecomputedFor, precomputeFor } from '../sidecar/writePrecomputed.js'
import { readSourceRelationship } from '../source/relationship.js'

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

          const relationship = readSourceRelationship(doc, config.source.relationshipField)
          if (!relationship) {return}
          if (!(relationship.collection in config.collections)) {return}

          await precomputeFor({
            id: relationship.docId,
            collection: relationship.collection,
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

          const relationship = readSourceRelationship(doc, config.source.relationshipField)
          if (!relationship) {return}
          if (!(relationship.collection in config.collections)) {return}

          await deletePrecomputedFor({
            id: relationship.docId,
            collection: relationship.collection,
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
