# Configuration

Full reference for the `payloadRelatedItems({ ... })` options.

```ts
payloadRelatedItems({
  // ---------------------------------------------------------------------
  // Where the keyword data actually lives.
  // Defaults to @payloadcms/plugin-search's `search` collection.
  // ---------------------------------------------------------------------
  source: {
    collection: 'search',          // or 'search-results', etc.
    relationshipField: 'doc',      // polymorphic rel on the search row
    defaultKeywordsField: 'keywords',
  },

  // ---------------------------------------------------------------------
  // One entry per originating collection. `fields` references columns on
  // the SOURCE row above, not on `posts` itself.
  // ---------------------------------------------------------------------
  collections: {
    posts: {
      fields: [
        { name: 'keywords', weight: 1 },
        { name: 'tags', weight: 0.6 },          // optional second sparse field
      ],
      topK: 5,
      scorer: 'bm25',                            // jaccard | weightedJaccard | dice | bm25
      minScore: 0,
      crossCollection: false,                    // also rank candidates from other configured collections
      recency: { field: 'publishedAt', halfLifeDays: 60, floor: 0.25 },
      excludeSelf: true,
      // filter: { status: { equals: 'published' } }, // any Payload Where
    },
  },

  // ---------------------------------------------------------------------
  // Per-process LRU cache of computed result lists.
  // ---------------------------------------------------------------------
  cache: { enabled: true, ttlSeconds: 300, maxEntries: 500 },

  // ---------------------------------------------------------------------
  // Optional sidecar collection with precomputed top-K per doc.
  // See ./precomputation.md.
  // ---------------------------------------------------------------------
  precompute: {
    enabled: false,
    collectionSlug: 'related-items-index',
    topK: 20,
    incremental: true,                           // afterChange hook on the source collection
  },

  // ---------------------------------------------------------------------
  // Admin sidebar widget. Ranking strategy is set HERE — independent of
  // each collection's `scorer` above. See ./scorers.md.
  // ---------------------------------------------------------------------
  adminField: {
    enabled: true,
    name: 'relatedItems',
    label: 'Related Items',
    scorer: 'bm25',                              // bm25 | weightedJaccard | dice | jaccard
    limit: 6,
    // Optional widget-only overrides:
    // minScore: 0.05,
    // crossCollection: false,
    // excludeCollections: ['drafts'],
  },

  // ---------------------------------------------------------------------
  // REST endpoint. See ./api.md.
  // ---------------------------------------------------------------------
  endpoint: { path: '/related' },                // GET /api/related/:collection/:id

  // ---------------------------------------------------------------------
  // Admin "keyword cloud" widget + backing REST endpoint. Shown below the
  // list view of the source collection. Computation is fully on-demand.
  // See ./word-cloud.md. Set to `false` to remove both widget and endpoint.
  // ---------------------------------------------------------------------
  wordCloud: {
    enabled: true,
    endpointPath: '/word-cloud',                 // GET /api/related/word-cloud
    limit: 100,                                  // top-N terms returned
    minLength: 3,                                // minimum term length
    sampleSize: 2000,                            // max source rows scanned per call
    ttlSeconds: 60,                              // per-process result cache TTL
  },

  // ---------------------------------------------------------------------
  // disabled: true                              // off without removing
  // ---------------------------------------------------------------------
})
```

## Recency decay

```ts
recency: { field: 'publishedAt', halfLifeDays: 30, floor: 0.2 }
```

Multiplies the similarity score by `max(floor, 2 ^ (-age / halfLife))`.
Items without a valid date keep their raw score.

## Cache

The in-memory LRU cache is **per-process**, not cluster-wide. It's invalidated
automatically by the source collection's `afterChange` / `afterDelete` hooks,
so writes are never served stale within the same process. For multi-instance
deployments where strong freshness matters, lower `ttlSeconds` or turn the
cache off entirely.

## Disabling

`disabled: true` keeps collection/field registration intact (so DB schema
parity is maintained) but skips hooks, endpoints, and sidecar work. Use this
to temporarily turn the plugin off without forcing a migration.
