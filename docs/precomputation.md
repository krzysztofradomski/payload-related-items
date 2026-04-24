# Precomputation (optional)

For most sites, the live in-memory cache is enough — BM25 over a few thousand
keyword sets is fast. For large corpora (~10k+ docs) or when you want a
guaranteed-cheap read path, turn on **precomputation**.

## Enabling

```ts
payloadRelatedItems({
  precompute: {
    enabled: true,
    collectionSlug: 'related-items-index',     // sidecar collection
    topK: 20,                                  // items stored per source doc
    incremental: true,                         // afterChange/afterDelete on source
  },
  // ...rest
})
```

## What it does

- Registers a sidecar Payload collection (default slug
  `related-items-index`) that holds the top-K related items per source doc,
  serialized as a small JSON blob.
- `getRelated()` reads from the sidecar when a row exists, falling back to
  live computation otherwise.
- With `incremental: true`, `afterChange` / `afterDelete` hooks on the source
  collection update the affected sidecar rows immediately (single-row writes,
  not full rebuilds).

## Full rebuild

For an offline rebuild — e.g. after changing scorers, or in a scheduled job:

```ts
import { rebuildRelatedIndex } from 'payload-related-items'

await rebuildRelatedIndex({ payload })
```

This iterates every source row, computes top-K with the current config, and
upserts into the sidecar. Safe to run while the app is serving reads.

## When NOT to use it

- Small or low-traffic sites: the in-memory cache is simpler and equally
  fast.
- When you want to A/B-test scorer changes without bouncing the sidecar
  (use the widget-level scorer override instead — see `./scorers.md`).
- When data is highly volatile and most precomputed rows would be stale
  before being read.
