import type { Payload, PayloadRequest, Where } from 'payload'

import type {
  RelatedItem,
  SanitizedConfig,
  ScorerName,
  SourceAdapterObject,
  SourceRow,
} from '../types.js'

import { computeRelated } from './computeRelated.js'
import { filterCandidates } from './filters.js'

export interface ResolveRelatedArgs {
  collection: string
  config: SanitizedConfig
  crossCollection?: boolean
  excludeCollections?: ReadonlyArray<string>
  excludeIds?: ReadonlyArray<number | string>
  filter?: Where
  id: number | string
  limit?: number
  minScore?: number
  payload: Payload
  req?: PayloadRequest
  rows?: ReadonlyArray<SourceRow>
  scorer?: ScorerName
  source: SourceAdapterObject
}

/**
 * Owns the live related-item resolution pipeline shared by public reads and
 * sidecar writes: find the query row, load candidates, filter, then rank.
 */
export async function resolveRelated(args: ResolveRelatedArgs): Promise<null | RelatedItem[]> {
  const collectionConfig = args.config.collections[args.collection]
  if (!collectionConfig) {return null}

  const query = await args.source.findOne({
    id: args.id,
    collection: args.collection,
    payload: args.payload,
    req: args.req,
  })

  if (!query) {return null}

  const rows =
    args.rows ??
    (await args.source.list({
      filter: mergeFilter(collectionConfig.filter, args.filter),
      payload: args.payload,
      req: args.req,
    }))

  const candidates = filterCandidates({
    config: collectionConfig,
    crossCollectionOverride: args.crossCollection,
    excludeCollections: args.excludeCollections,
    excludeIds: args.excludeIds,
    query,
    rows,
  })

  return computeRelated({
    candidates,
    config: collectionConfig,
    overrides: {
      limit: args.limit,
      minScore: args.minScore,
      scorer: args.scorer,
    },
    query,
  })
}

function mergeFilter(a: undefined | Where, b: undefined | Where): undefined | Where {
  if (!a) {return b}
  if (!b) {return a}
  return { and: [a, b] }
}
