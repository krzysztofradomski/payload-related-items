import type { Field } from 'payload'

import type { SanitizedConfig } from '../types.js'

/**
 * Produces a `ui`-type field that renders the RelatedItemsField client component.
 * The field name is configurable (default: `relatedItems`) and does not persist
 * to the database — it's pure UI.
 *
 * Widget-level overrides (scorer, limit, minScore, crossCollection,
 * excludeCollections) come from `config.adminField` and flow through as
 * `clientProps` to the React component, which appends them as query params on
 * the REST endpoint call. This is intentional: ranking strategy for the
 * editor-facing widget should be independent of the collection's default
 * scorer used by `getRelated()` and the public REST API.
 */
export function buildAdminField(config: SanitizedConfig): Field | null {
  if (config.adminField === false || !config.adminField.enabled) {
    return null
  }

  const {
    name,
    crossCollection,
    excludeCollections,
    label,
    limit,
    minScore,
    position,
    scorer,
  } = config.adminField
  const endpointPath = config.endpoint === false ? '/related' : config.endpoint.path

  const clientProps: Record<string, unknown> = {
    endpointPath,
    label: typeof label === 'string' ? label : 'Related items',
    limit,
  }
  if (scorer != null) clientProps.scorer = scorer
  if (minScore != null) clientProps.minScore = minScore
  if (crossCollection != null) clientProps.crossCollection = crossCollection
  if (excludeCollections != null && excludeCollections.length > 0) {
    clientProps.excludeCollections = excludeCollections
  }

  const field: Field = {
    name,
    type: 'ui',
    admin: {
      components: {
        Field: {
          clientProps,
          path: 'payload-related-items/client#RelatedItemsField',
        },
      },
      position,
    },
    label: typeof label === 'string' ? label : label,
  }

  return field
}
