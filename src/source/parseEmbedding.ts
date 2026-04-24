/**
 * Safely parses a keyword field value into a string[].
 *
 * Supports:
 *   - Already-parsed string arrays (the common case for `type: 'json'` fields)
 *   - Stringified JSON arrays (some DB adapters return JSON columns as strings)
 *   - Single strings (returned as a one-element array)
 *   - Arrays of objects with a `value` property (Payload array fields)
 *
 * Invalid JSON and unknown shapes return an empty array rather than throwing,
 * so a malformed document can never break a query for unrelated documents.
 */
export function parseKeywords(raw: unknown): string[] {
  if (raw == null) {return []}
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') {return []}
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return parseKeywords(JSON.parse(trimmed))
      } catch {
        // Fall through — treat as a single keyword.
      }
    }
    return [trimmed]
  }
  if (Array.isArray(raw)) {
    const out: string[] = []
    for (const item of raw) {
      if (typeof item === 'string') {
        if (item) {out.push(item)}
      } else if (item && typeof item === 'object' && 'value' in item) {
        const value = (item as { value: unknown }).value
        if (typeof value === 'string' && value) {out.push(value)}
      }
    }
    return out
  }
  return []
}
