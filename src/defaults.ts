import type {
  PayloadRelatedItemsConfig,
  SanitizedCollectionConfig,
  SanitizedConfig,
} from './types.js'

export const DEFAULT_SOURCE_COLLECTION = 'search'
export const DEFAULT_RELATIONSHIP_FIELD = 'doc'
export const DEFAULT_KEYWORDS_FIELD = 'keywords'
export const DEFAULT_SIDECAR_COLLECTION = 'related-items-index'

export const DEFAULT_TOP_K = 4
export const DEFAULT_CACHE_TTL_SECONDS = 300
export const DEFAULT_CACHE_MAX_ENTRIES = 1000
export const DEFAULT_PRECOMPUTE_TOP_K = 20

export const DEFAULT_ADMIN_FIELD_NAME = 'relatedItems'
export const DEFAULT_ENDPOINT_PATH = '/related'
export const DEFAULT_WORD_CLOUD_PATH = '/word-cloud'
export const DEFAULT_WORD_CLOUD_LIMIT = 100
export const DEFAULT_WORD_CLOUD_MIN_LENGTH = 3
export const DEFAULT_WORD_CLOUD_SAMPLE_SIZE = 2000
export const DEFAULT_WORD_CLOUD_TTL_SECONDS = 60

export const BM25_K1 = 1.2
export const BM25_B = 0.75

/**
 * Sanitizes a raw plugin config into a fully-specified internal shape.
 * Throws on obvious misconfiguration (negative weights, malformed fields, etc.).
 */
export function sanitizeConfig(raw: PayloadRelatedItemsConfig): SanitizedConfig {
  const source = {
    collection: raw.source?.collection ?? DEFAULT_SOURCE_COLLECTION,
    defaultKeywordsField: raw.source?.defaultKeywordsField ?? DEFAULT_KEYWORDS_FIELD,
    relationshipField: raw.source?.relationshipField ?? DEFAULT_RELATIONSHIP_FIELD,
  } satisfies SanitizedConfig['source']

  const collections: Record<string, SanitizedCollectionConfig> = {}
  for (const [slug, value] of Object.entries(raw.collections ?? {})) {
    if (!value) {continue}
    const cfg = value === true ? {} : value
    const fields = (cfg.fields ?? [{ name: source.defaultKeywordsField, weight: 1 }]).map(
      (field) => {
        if (!field.name) {
          throw new Error(
            `[payload-related-items] Field on collection "${slug}" is missing a "name".`,
          )
        }
        if (field.weight != null && field.weight < 0) {
          throw new Error(
            `[payload-related-items] Field "${field.name}" on collection "${slug}" has a negative weight.`,
          )
        }
        return {
          name: field.name,
          scorer: field.scorer ?? cfg.scorer ?? 'bm25',
          weight: field.weight ?? 1,
        }
      },
    )

    if (fields.length === 0) {
      throw new Error(
        `[payload-related-items] Collection "${slug}" must have at least one field configured.`,
      )
    }

    collections[slug] = {
      crossCollection: cfg.crossCollection ?? true,
      excludeSelf: cfg.excludeSelf ?? true,
      fields,
      filter: cfg.filter,
      minScore: cfg.minScore ?? 0,
      recency: cfg.recency,
      scorer: cfg.scorer ?? 'bm25',
      topK: cfg.topK ?? DEFAULT_TOP_K,
    }
  }

  const cache: SanitizedConfig['cache'] =
    raw.cache === false
      ? false
      : {
          enabled: raw.cache?.enabled ?? true,
          maxEntries: raw.cache?.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES,
          ttlSeconds: raw.cache?.ttlSeconds ?? DEFAULT_CACHE_TTL_SECONDS,
        }

  const precompute: SanitizedConfig['precompute'] = {
    collectionSlug: raw.precompute?.collectionSlug ?? DEFAULT_SIDECAR_COLLECTION,
    enabled: raw.precompute?.enabled ?? false,
    incremental: raw.precompute?.incremental ?? true,
    topK: raw.precompute?.topK ?? DEFAULT_PRECOMPUTE_TOP_K,
  }

  const adminField: SanitizedConfig['adminField'] =
    raw.adminField === false
      ? false
      : {
          name: raw.adminField?.name ?? DEFAULT_ADMIN_FIELD_NAME,
          crossCollection: raw.adminField?.crossCollection,
          enabled: raw.adminField?.enabled ?? true,
          excludeCollections: raw.adminField?.excludeCollections,
          label: raw.adminField?.label ?? 'Related items',
          limit: raw.adminField?.limit ?? 5,
          minScore: raw.adminField?.minScore,
          position: raw.adminField?.position ?? 'sidebar',
          scorer: raw.adminField?.scorer,
        }

  const endpoint: SanitizedConfig['endpoint'] =
    raw.endpoint === false
      ? false
      : {
          enabled: raw.endpoint?.enabled ?? true,
          path: raw.endpoint?.path ?? DEFAULT_ENDPOINT_PATH,
        }

  const wordCloud: SanitizedConfig['wordCloud'] =
    raw.wordCloud === false
      ? false
      : {
          enabled: raw.wordCloud?.enabled ?? true,
          endpointPath: raw.wordCloud?.endpointPath ?? DEFAULT_WORD_CLOUD_PATH,
          limit: raw.wordCloud?.limit ?? DEFAULT_WORD_CLOUD_LIMIT,
          minLength: raw.wordCloud?.minLength ?? DEFAULT_WORD_CLOUD_MIN_LENGTH,
          sampleSize: raw.wordCloud?.sampleSize ?? DEFAULT_WORD_CLOUD_SAMPLE_SIZE,
          ttlSeconds: raw.wordCloud?.ttlSeconds ?? DEFAULT_WORD_CLOUD_TTL_SECONDS,
        }

  return {
    adminField,
    cache,
    collections,
    disabled: raw.disabled ?? false,
    endpoint,
    precompute,
    source,
    wordCloud,
  }
}
