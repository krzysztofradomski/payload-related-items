import type {
  RelatedItem,
  SanitizedCollectionConfig,
  SanitizedFieldConfig,
  ScorerName,
  SourceRow,
} from '../types.js'

import { getScorer } from '../scorers/index.js'
import { buildCorpusStats } from './corpusStats.js'
import { readDate, recencyMultiplier } from './recency.js'

export interface ComputeRelatedArgs {
  /** All candidate rows (pre-filtered — see `filters.ts`). */
  candidates: ReadonlyArray<SourceRow>
  /** Sanitized per-collection config. */
  config: SanitizedCollectionConfig
  /** Overrides applied at query time. */
  overrides?: {
    limit?: number
    minScore?: number
    scorer?: ScorerName
  }
  /** The source row of the document we want related items for. */
  query: SourceRow
}

/**
 * Core scoring loop. Given a query row + candidates + config, produces a
 * ranked list of RelatedItems.
 *
 * Behavior:
 *   - For each configured field, computes per-candidate raw score using that
 *     field's scorer (falling back to collection default; BM25 gets corpus stats).
 *   - Blends per-field scores with normalized weights.
 *   - Applies recency multiplier if configured.
 *   - Filters by minScore, sorts descending, slices to topK.
 *   - Collects `matchedKeywords` (intersection on the primary field) for each hit.
 */
export function computeRelated(args: ComputeRelatedArgs): RelatedItem[] {
  const { candidates, config, overrides, query } = args

  const limit = overrides?.limit ?? config.topK
  const minScore = overrides?.minScore ?? config.minScore

  const effectiveFields: SanitizedFieldConfig[] = overrides?.scorer
    ? config.fields.map((f) => ({ ...f, scorer: overrides.scorer! }))
    : config.fields

  const totalWeight = effectiveFields.reduce((sum, f) => sum + f.weight, 0) || 1

  // Precompute corpus stats only for fields whose scorer needs them (BM25).
  const statsByField = new Map<string, ReturnType<typeof buildCorpusStats>>()
  for (const field of effectiveFields) {
    if (field.scorer === 'bm25') {
      statsByField.set(field.name, buildCorpusStats(candidates, field.name))
    }
  }

  const primaryField = effectiveFields[0]
  const queryPrimary = new Set(query.keywordsByField[primaryField.name] ?? [])

  const results: RelatedItem[] = []

  for (const candidate of candidates) {
    const fieldScores: Record<string, number> = {}
    let weightedSum = 0

    for (const field of effectiveFields) {
      const scorer = getScorer(field.scorer)
      const queryTokens = query.keywordsByField[field.name] ?? []
      const candidateTokens = candidate.keywordsByField[field.name] ?? []
      const ctx = statsByField.get(field.name) ?? {
        avgDocLength: 0,
        documentFrequency: new Map<string, number>(),
        totalDocs: candidates.length,
      }
      const raw = scorer(queryTokens, candidateTokens, ctx)
      fieldScores[field.name] = raw
      weightedSum += raw * field.weight
    }

    const blended = weightedSum / totalWeight
    if (blended <= 0) {continue}

    let multiplier = 1
    if (config.recency) {
      const date = readDate(candidate.raw, config.recency.field) ?? toDate(candidate.recencyDate)
      multiplier = recencyMultiplier(date, config.recency)
    }

    const finalScore = blended * multiplier
    if (finalScore < minScore) {continue}

    const matchedKeywords: string[] = []
    if (queryPrimary.size > 0) {
      const cand = candidate.keywordsByField[primaryField.name] ?? []
      const seen = new Set<string>()
      for (const token of cand) {
        if (queryPrimary.has(token) && !seen.has(token)) {
          matchedKeywords.push(token)
          seen.add(token)
        }
      }
    }

    results.push({
      id: candidate.docId,
      collection: candidate.collection,
      fieldScores,
      matchedKeywords,
      recencyMultiplier: multiplier,
      score: finalScore,
      source: candidate.raw,
    })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

function toDate(value: Date | null | string | undefined): Date | null {
  if (!value) {return null}
  if (value instanceof Date) {return isNaN(value.getTime()) ? null : value}
  const parsed = new Date(value)
  return isNaN(parsed.getTime()) ? null : parsed
}
