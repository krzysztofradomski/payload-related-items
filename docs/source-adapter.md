# Source adapter & keyword storage

## How keyword storage works

**Keywords live in one place only — the search-plugin collection** (`search`
by default, or whatever slug `searchPlugin` uses). Each content doc (post,
article, spectacle, …) contributes exactly one row to that collection, and
`beforeSync` in `searchPlugin` is where you populate the keyword field(s).

Inside `payloadRelatedItems`:

- `source` tells the plugin **where those keywords live** — which collection,
  which relationship field, which default keyword field.
- `collections[slug].fields` tells the plugin **which fields on that source
  row to read when ranking candidates whose `doc.relationTo === slug`**.
  It is _not_ a second copy of keywords on your content collection.

This split exists so different originating collections can be scored against
different fields on the same shared search index — e.g. articles against one
`embedding` field, spectacles against `embedding` plus an `actorNames`
sparse list.

## Custom source adapter

If you don't use `@payloadcms/plugin-search`, you can plug in any source by
providing a `SourceAdapter`:

```ts
import type { SourceAdapter } from 'payload-related-items'

const mySource: SourceAdapter = {
  async findOne({ payload, collection, id, req }) {
    // return SourceRow | null
  },
  async list({ filter, payload, req }) {
    // return SourceRow[]
  },
}

payloadRelatedItems({
  collections: { posts: { fields: [{ name: 'keywords', weight: 1 }] } },
  source: { adapter: mySource },
})
```

A `SourceRow` is the minimal shape the scorers consume:

```ts
interface SourceRow {
  collection: string                              // originating collection slug
  docId: string                                   // originating document id (stringified)
  keywordsByField: Record<string, string[]>       // per-field keyword arrays
  raw: Record<string, unknown>                    // full row, surfaced as `result.source`
  recencyDate?: string | Date | null              // for recency decay
  sourceId: number | string                       // source-collection row id (NOT the originating doc id)
}
```

This lets you back the plugin with anything that emits keyword arrays per
document — Postgres `tsvector`, an external tagging service, your own batch
job — without reimplementing the scoring/caching pipeline.

`list` receives the same merged `filter` that would be applied to the source
collection when using the default search-plugin adapter. It combines the
configured `collections[slug].filter` with any per-call `getRelated({ filter })`
override. Custom adapters should honor it when their backend can apply Payload
`where` clauses; otherwise, document the unsupported filter behavior for callers.
