# Scorers

All built-in scorers operate on token sets extracted from the configured
fields on the source row. They're pure functions of `(query, candidate, ctx)`
returning a per-field score in **`[0, 1]`**. After blending fields (weighted average),
recency decay multiplies that blended score in **`computeRelated`**.

### BM25 score shape and display

BM25 raw similarity is compared against the **query scoring itself as if it were
the candidate** (`candidate === query`). That yields **`1`** for an exact keyword
overlap match on that field and values **below `1`** for partial overlaps —
better defaults than saturating unrelated BM25 sums to `~1` under arbitrary squash curves.

Result **`RelatedItem.score`** is still clamped to **`[0, 1]`** after blending and recency.

| Name              | Good for                                                    | Cost    |
| ----------------- | ----------------------------------------------------------- | ------- |
| `jaccard`         | Small, tidy keyword sets                                    | Lowest  |
| `weightedJaccard` | Keyword lists where repetition is meaningful                | Low     |
| `dice`            | Short documents; treats overlap more generously than Jaccard| Low     |
| `bm25` (default)  | Mixed-length docs, noisy keyword lists, larger corpora      | Medium  |

BM25 builds per-field corpus statistics (IDF + average length) on demand from
the candidate set for each related-items query. No extra index columns needed.

## Where to set the scorer

Three independent layers. Pick the one that matches the concern.

### 1. Per-field — `collections.<slug>.fields[].scorer`

Used when that specific field contributes to the blended score. Useful when
one field on the same collection should be scored differently from another
(e.g. dense `keywords` with BM25, sparse `tags` with Jaccard).

```ts
collections: {
  posts: {
    fields: [
      { name: 'keywords', weight: 1, scorer: 'bm25' },
      { name: 'tags', weight: 0.5, scorer: 'jaccard' },
    ],
  },
}
```

### 2. Per-collection default — `collections.<slug>.scorer`

Used for any field on that collection that doesn't specify its own, **and**
applied by `getRelated()` and the public REST endpoint when no `scorer` is
passed at call time. This is the data-layer default the rest of your app
inherits.

### 3. Per-widget — `adminField.scorer` + editor dropdown

`adminField.scorer`, when set, seeds the **default selection** in the admin sidebar
scorer dropdown. Editors can switch scorer live without touching collection config;
their choice is sent as `?scorer=` on the related-items REST call used by the widget.

This layer stays **independent** of the collection-level default used by `getRelated()`
and the public REST endpoint when no `scorer` is passed — same idea applies to:

- the headless `useRelatedItems` hook (`scorer: '...'` per call), and
- direct REST calls (`?scorer=...`).

A short note under the widget explains scores live in **`[0, 1]`** with higher = stronger match.

## Picking a scorer

- **Start with `bm25`.** It handles mixed-length, noisy keyword sets best
  out of the box, and the IDF term naturally suppresses generic words like
  "the" or "video".
- **Use `weightedJaccard`** when your extractor emits term frequencies
  (the same keyword appearing N times means something).
- **Use `dice`** for very short keyword lists (≤ 5–10 tokens), where
  Jaccard's denominator (the union) can punish small overlaps unfairly.
- **Use `jaccard`** when you want the cheapest baseline, or for debugging
  by comparison.

When in doubt, set them on the **widget** (not the collection) and flip
between them in the admin to compare on real content.
