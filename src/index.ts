export { getRelated } from './api/getRelated.js'
export { clearWordCloudCache } from './endpoints/wordCloudEndpoint.js'
export { payloadRelatedItems } from './plugin.js'
export { bm25, dice, getScorer, jaccard, scorers, weightedJaccard } from './scorers/index.js'

export {
  deletePrecomputedFor,
  precomputeFor,
  rebuildRelatedIndex,
} from './sidecar/writePrecomputed.js'
export { DEFAULT_STOP_WORDS, extractKeywords } from './source/keywords.js'
export type { ExtractKeywordsOptions } from './source/keywords.js'

export { parseKeywords } from './source/parseEmbedding.js'

export type {
  GetRelatedOptions,
  PayloadRelatedItemsConfig,
  RecencyConfig,
  RelatedItem,
  RelatedItemsAdminFieldConfig,
  RelatedItemsCacheConfig,
  RelatedItemsCollectionConfig,
  RelatedItemsEndpointConfig,
  RelatedItemsFieldConfig,
  RelatedItemsPrecomputeConfig,
  RelatedItemsSourceConfig,
  RelatedItemsWordCloudConfig,
  ScorerFn,
  ScorerName,
  SourceAdapter,
  SourceAdapterObject,
  SourceListAdapter,
  SourceRow,
} from './types.js'
export { aggregateWordCloud } from './wordCloud/aggregate.js'
export type {
  AggregateOptions as WordCloudAggregateOptions,
  WordCloudResult,
  WordCloudTerm,
} from './wordCloud/aggregate.js'
