# API

Three ways to read related items: server-side `getRelated()`, REST endpoint,
and the headless React hook.

## `getRelated()` — server / Node

```ts
import { getRelated } from 'payload-related-items'

const results = await getRelated({
  payload,
  collection: 'posts',
  id: postId,
  limit: 5,
  populate: true,                // or { depth: 1 } — batch-load originating docs as `doc`
  // scorer: 'dice',
  // crossCollection: true,
  // excludeCollections: ['drafts'],
  // excludeIds: [],
  // minScore: 0.05,
  // skipCache: false,
  // skipPrecomputed: false,
  // req,                         // pass PayloadRequest for access-control-aware reads
})

// RelatedItem<TSource, TDoc>[] — { id, collection, score, fieldScores, matchedKeywords, source, doc? }
```

### Populating original docs

When `populate: true` (or `{ depth: N }`), the plugin batches one
`payload.find` per originating collection, deduplicated by ID, and attaches
the full doc as `doc` on each item. This avoids an N+1 fetch on the consumer
side.

Pass a `depth > 0` to resolve relationships (e.g. cover images).

## REST endpoint

```
GET /api/related/:collection/:id
  ?limit=5
  &scorer=bm25
  &crossCollection=false
  &excludeCollections=drafts,media
  &minScore=0.05
  &skipCache=false
  &skipPrecomputed=false
  &populate=true        # or `populate=1` for a specific Payload depth
```

Returns `{ results: RelatedItem[] }`. Honors the requesting user's session
for access control on populated docs.

## Headless React hook

For client components and dynamic UIs, a framework-agnostic hook is exported
from the `/client` subpath:

```tsx
'use client'
import { useRelatedItems } from 'payload-related-items/client'

function RelatedSection({ articleId }: { articleId: string }) {
  const { items, loading, error, refetch } = useRelatedItems({
    collection: 'articles',
    id: articleId,
    limit: 4,
    populate: 1,                  // `true` or a Payload `depth`
    // scorer: 'dice',
    // crossCollection: true,
    // excludeCollections: ['drafts'],
    // skip: false,               // gate fetching without unmounting
    // endpoint: '/api/related',  // override mount path
    // fetcher: myFetch,          // custom fetch for SSR / tests
  })

  if (loading) return <Skeleton />
  if (error || !items.length) return null
  return (
    <ul>
      {items.map((item) => (
        <li key={`${item.collection}:${item.id}`}>
          <a href={`/things/${item.doc?.slug}`}>{item.doc?.title ?? item.id}</a>
        </li>
      ))}
    </ul>
  )
}
```

The hook:

- Uses `AbortController` to cancel stale requests when inputs change.
- De-duplicates in-flight calls and exposes `refetch()` for manual refresh.
- Returns `items: []` during loading / error so renders stay trivial.
- Works in any React environment (Next, Remix, vanilla) — only depends
  on `fetch` and `useState` / `useEffect`.

## Result shape

```ts
interface RelatedItem<TSource, TDoc> {
  id: number | string
  collection: string
  score: number                              // blended score
  fieldScores: Record<string, number>        // raw per-field scores, before weighting/recency
  matchedKeywords: string[]                  // overlap on the first configured field
  recencyMultiplier: number                  // 1 if recency not configured
  source: TSource                            // raw source-collection row (for title/slug/etc.)
  doc?: TDoc                                 // populated when `populate` is set
}
```
