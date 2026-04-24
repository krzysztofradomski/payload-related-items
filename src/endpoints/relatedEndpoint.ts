import type { Endpoint, PayloadHandler } from 'payload'

import type { SanitizedConfig, ScorerName } from '../types.js'

import { getRelated } from '../api/getRelated.js'

const VALID_SCORERS: ReadonlySet<ScorerName> = new Set([
  'bm25',
  'dice',
  'jaccard',
  'weightedJaccard',
])

/**
 * Builds the public related-items endpoint:
 *
 *   GET /api{path}/:collection/:id
 *
 * Query params:
 *   - limit:                integer
 *   - scorer:               one of jaccard | weightedJaccard | dice | bm25
 *   - crossCollection:      'true' | 'false'
 *   - excludeCollections:   comma-separated list
 *   - minScore:             float in [0, 1]
 *   - skipCache:            'true' | 'false'
 *   - skipPrecomputed:      'true' | 'false'
 *   - populate:             'true' | 'false' | depth integer (e.g. `populate=1`)
 *
 * Returns:
 *   { results: RelatedItem[] }
 */
export function buildRelatedEndpoint(config: SanitizedConfig): Endpoint {
  const basePath = config.endpoint === false ? '/related' : config.endpoint.path
  const handler: PayloadHandler = async (req) => {
    const collection = getParam(req, 'collection')
    const id = getParam(req, 'id')
    if (!collection || !id) {
      return jsonError('Missing :collection or :id path parameter', 400)
    }

    if (!(collection in config.collections)) {
      return jsonError(`Collection "${collection}" is not configured for related items`, 400)
    }

    const searchParams = new URL(req.url ?? 'http://localhost').searchParams
    const limit = parseIntOr(searchParams.get('limit'))
    const scorer = parseScorer(searchParams.get('scorer'))
    const crossCollection = parseBool(searchParams.get('crossCollection'))
    const minScore = parseFloatOr(searchParams.get('minScore'))
    const skipCache = parseBool(searchParams.get('skipCache')) ?? false
    const skipPrecomputed = parseBool(searchParams.get('skipPrecomputed')) ?? false
    const populate = parsePopulate(searchParams.get('populate'))
    const excludeCollectionsRaw = searchParams.get('excludeCollections')
    const excludeCollections = excludeCollectionsRaw
      ? excludeCollectionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined

    try {
      const results = await getRelated({
        id,
        collection,
        crossCollection,
        excludeCollections,
        limit,
        minScore,
        payload: req.payload,
        populate,
        req,
        scorer,
        skipCache,
        skipPrecomputed,
      })
      return Response.json({ results })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return jsonError(message, 500)
    }
  }

  return {
    handler,
    method: 'get',
    path: `${basePath}/:collection/:id`,
  }
}

function getParam(req: { routeParams?: Record<string, unknown> }, key: string): null | string {
  const params = req.routeParams
  const raw = params?.[key]
  if (raw == null) {return null}
  if (typeof raw === 'string') {return raw}
  if (typeof raw === 'number') {return String(raw)}
  return null
}

function parseIntOr(raw: null | string): number | undefined {
  if (!raw) {return undefined}
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : undefined
}

function parseFloatOr(raw: null | string): number | undefined {
  if (!raw) {return undefined}
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : undefined
}

function parseBool(raw: null | string): boolean | undefined {
  if (raw == null) {return undefined}
  if (raw === 'true') {return true}
  if (raw === 'false') {return false}
  return undefined
}

function parsePopulate(raw: null | string): { depth: number } | boolean | undefined {
  if (raw == null) {return undefined}
  if (raw === 'true') {return true}
  if (raw === 'false') {return false}
  const n = parseInt(raw, 10)
  if (Number.isFinite(n) && n >= 0) {return { depth: n }}
  return undefined
}

function parseScorer(raw: null | string): ScorerName | undefined {
  if (!raw) {return undefined}
  if (VALID_SCORERS.has(raw as ScorerName)) {return raw as ScorerName}
  return undefined
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}
