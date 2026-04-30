export interface SourceRelationship {
  collection: string
  docId: string
}

interface RelationshipValue {
  relationTo?: string
  value?: unknown
}

export function readSourceRelationship(
  doc: null | Record<string, unknown> | undefined,
  relationshipField: string,
): null | SourceRelationship {
  const rel = doc?.[relationshipField] as RelationshipValue | undefined
  const collection = rel?.relationTo ?? ''
  const value = rel?.value
  if (!collection || value == null) {return null}

  const docId =
    typeof value === 'object' && value !== null && 'id' in value
      ? String((value as { id: unknown }).id)
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : ''

  return docId ? { collection, docId } : null
}
