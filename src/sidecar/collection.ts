import type { CollectionConfig } from 'payload'

import type { SanitizedConfig } from '../types.js'

/**
 * Builds the sidecar collection definition used to store precomputed top-K
 * related items per source document.
 *
 * Schema (pragmatic rather than normalized — the point is fast reads):
 *   - sourceCollection: original collection slug
 *   - sourceId: original document id (as string, normalized for lookup)
 *   - items: JSON array of precomputed RelatedItem shapes
 *   - computedAt: timestamp of last compute
 */
export function buildSidecarCollection(config: SanitizedConfig): CollectionConfig {
  return {
    slug: config.precompute.collectionSlug,
    access: {
      // Default-deny. The plugin writes via overrideAccess; users can override
      // access to expose read if they want to query the sidecar directly.
      create: () => false,
      delete: () => false,
      read: ({ req }) => Boolean(req.user),
      update: () => false,
    },
    admin: {
      defaultColumns: ['sourceCollection', 'sourceId', 'computedAt'],
      description:
        'Precomputed top-K related items per document. Managed automatically by payload-related-items.',
      group: 'System',
      hidden: ({ user }) => !user,
      useAsTitle: 'sourceId',
    },
    fields: [
      {
        name: 'sourceCollection',
        type: 'text',
        admin: { readOnly: true },
        index: true,
        required: true,
      },
      {
        name: 'sourceId',
        type: 'text',
        admin: { readOnly: true },
        index: true,
        required: true,
      },
      {
        name: 'items',
        type: 'json',
        admin: {
          description:
            'Precomputed ranked related items. Read via getRelated(); do not edit by hand.',
          readOnly: true,
        },
      },
      {
        name: 'computedAt',
        type: 'date',
        admin: { readOnly: true },
      },
    ],
    timestamps: true,
  }
}
