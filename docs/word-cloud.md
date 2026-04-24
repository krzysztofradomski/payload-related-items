# Word cloud

An admin-only helper that aggregates keyword frequencies across the plugin's
source collection and renders them as a weighted cloud below the list view.

Useful for:

- Sanity-checking that your `beforeSync` keyword extraction is doing what you
  think it is.
- Spotting outlier or stop-word terms that dominate rankings.
- Quick content audits — what is the corpus actually about?

## Behaviour

- **Disabled at rest.** Nothing is computed at plugin boot or on page load.
- **On-demand.** The editor clicks **Compute word cloud**. A fetch hits the
  REST endpoint, which pages through up to `sampleSize` **matching** source
  rows (newest by `updatedAt` first) and only includes rows that already have
  a non-empty keyword/embedding field. That way **All collections** is not
  filled with the oldest, pre-migration `search` rows that never received
  keywords — a common reason an unfiltered run previously showed
  *N docs scanned* but *0 terms*.
- **Filter dropdown** lists **every** collection registered in the Payload
  project (read from the admin config), not only the collections listed under
  `payloadRelatedItems({ collections: { ... } })`.
- **Lazily bundled.** The cloud renderer is code-split with `React.lazy`, so
  the initial admin list-view bundle only ships a button and a few hundred
  bytes of control UI.
- **Short-lived cache.** The endpoint caches each `(filter, limit, minLength,
  sampleSize, stopWords)` tuple for `ttlSeconds` inside the Node process.
  Subsequent clicks within the TTL return instantly.
- **Filterable.** Dropdown lets the editor restrict to one originating
  collection (e.g. only keywords attached to `posts`). An optional
  "stop-words" checkbox applies the plugin's built-in multilingual stop list.

## Configuration

```ts
payloadRelatedItems({
  wordCloud: {
    enabled: true,
    endpointPath: '/word-cloud',   // GET /api/related/word-cloud
    limit: 100,                    // top-N terms returned
    minLength: 3,                  // drop tokens shorter than this
    sampleSize: 2000,              // max source rows scanned per call
    ttlSeconds: 60,                // per-process result cache TTL
  },
})
```

Set `wordCloud: false` to disable both the widget and the endpoint.

## REST endpoint

```
GET /api/related/word-cloud
  ?limit=100
  &minLength=3
  &sampleSize=2000
  &collection=posts              # optional: filter source rows by doc.relationTo
  &stopWords=default             # optional: apply the built-in stop list
  &skipCache=false               # optional: bypass the in-memory cache
```

Response:

```jsonc
{
  "terms": [
    { "term": "keyword", "frequency": 42, "df": 18 },
    { "term": "search", "frequency": 31, "df": 14 }
  ],
  "totalDocs": 1200,
  "field": "keywords",
  "filterCollection": null,
  "elapsedMs": 87,
  "cached": false
}
```

- `frequency` — total occurrences across all scanned rows.
- `df` — number of scanned rows containing the term (document frequency).
- `totalDocs` — rows actually scanned (capped at `sampleSize`).
- `cached` — true when served from the per-process cache.

## Programmatic usage

You can call the aggregator directly — for example in a cron job that dumps
a snapshot to disk, or in a custom admin view:

```ts
import { aggregateWordCloud } from 'payload-related-items'

const cloud = await aggregateWordCloud({
  payload,
  config: payload.config as never, // or pass your own SanitizedConfig-shaped object
  limit: 200,
  sampleSize: 5000,
  filterCollection: 'articles',
})
```

## Scale notes

- Aggregation is O(rows × avg keywords per row). At `sampleSize: 2000` with
  ~40 keywords per row, this is in single-digit-millisecond territory on any
  production DB.
- For much larger corpora, raise `sampleSize` in small steps and monitor
  latency — or precompute a snapshot out-of-band and serve it from a custom
  endpoint. The plugin is deliberately **not** trying to be an analytics
  dashboard.
- The cache is per-process, so replicas compute independently. Keep
  `ttlSeconds` modest (30–120s) unless your corpus is very stable.
