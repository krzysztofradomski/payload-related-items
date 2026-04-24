import type { RecencyConfig } from '../types.js'

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Reads a date value from an arbitrary record safely.
 */
export function readDate(record: Record<string, unknown>, field: string): Date | null {
  const value = record[field]
  if (!value) {return null}
  if (value instanceof Date) {return isNaN(value.getTime()) ? null : value}
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

/**
 * Exponential-decay recency multiplier.
 *
 * multiplier = max(floor, 2^(-ageDays / halfLifeDays))
 *
 * - Fresh content (age = 0) → multiplier = 1
 * - Age equal to one half-life → multiplier = 0.5
 * - Age much larger than half-life → multiplier approaches `floor` (default 0)
 *
 * Returns 1 when no date is available, so missing-data never makes a result worse.
 */
export function recencyMultiplier(
  date: Date | null,
  config: RecencyConfig | undefined,
  now: Date = new Date(),
): number {
  if (!config || !date) {return 1}

  const ageMs = now.getTime() - date.getTime()
  if (ageMs <= 0) {return 1}

  const ageDays = ageMs / MS_PER_DAY
  const raw = Math.pow(2, -ageDays / Math.max(config.halfLifeDays, Number.EPSILON))
  const floor = config.floor ?? 0
  return Math.max(floor, raw)
}
