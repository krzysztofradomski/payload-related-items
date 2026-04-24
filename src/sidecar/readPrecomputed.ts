import type { Payload, PayloadRequest } from 'payload'

import type { RelatedItem, SanitizedConfig } from '../types.js'

export interface ReadPrecomputedArgs {
  collection: string
  config: SanitizedConfig
  id: number | string
  limit: number
  payload: Payload
  req?: PayloadRequest
}

/**
 * Reads precomputed related items for a given doc from the sidecar collection.
 * Returns null if no row exists yet (callers fall back to live computation).
 */
export async function readPrecomputed(args: ReadPrecomputedArgs): Promise<null | RelatedItem[]> {
  const { id, collection, config, limit, payload, req } = args
  const result = await payload.find({
    collection: config.precompute.collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      and: [
        { sourceCollection: { equals: collection } },
        { sourceId: { equals: String(id) } },
      ],
    },
  })

  const doc = result.docs[0] as { items?: unknown } | undefined
  if (!doc) {return null}
  const items = doc.items
  if (!Array.isArray(items)) {return null}
  return (items as RelatedItem[]).slice(0, limit)
}
