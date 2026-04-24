# Scorers

All built-in scorers operate on token sets extracted from the configured
fields on the source row. They're pure functions of `(query, candidate, ctx)`
returning a score in `[0, 1]` (BM25 is normalised to the same range for
ordering purposes).

| Name              | Good for                                                    | Cost    |
| ----------------- | ----------------------------------------------------------- | ------- |
| `jaccard`         | Small, tidy keyword sets                                    | Lowest  |
| `weightedJaccard` | Keyword lists where repetition is meaningful                | Low     |
| `dice`            | Short documents; treats overlap more generously than Jaccard| Low     |
| `bm25` (default)  | Mixed-length docs, noisy keyword lists, larger corpora      | Medium  |

BM25 builds per-field corpus statistics (IDF + average length) on demand from
the candidate set. No extra index columns needed.

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

### 3. Per-widget — `adminField.scorer`

Used by the editor-facing admin sidebar widget. **Independent** of the
collection-level default so you can experiment with ranking strategy in the
admin without changing the storage/data-layer defaults the rest of your app
relies on. Same applies to:

- the headless `useRelatedItems` hook (`scorer: '...'` per call), and
- direct REST calls (`?scorer=...`).

The widget renders the active scorer as a small uppercase badge next to its
label, so editors can tell at a glance which strategy produced the list
they're looking at.

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
