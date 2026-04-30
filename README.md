# payload-related-items

A [Payload CMS](https://payloadcms.com) plugin that surfaces **related
content** using classical, transparent similarity algorithms — no external
AI service required.

Built for editorial sites, docs, knowledge bases, and any Payload project
that wants **"Related posts"**, **"You might also like…"**, or **"More like
this"** sections backed by predictable math instead of a black box.

---

## Features

- **Deterministic ranking** you can reason about and debug.
- **Four built-in scorers**: Jaccard, Weighted Jaccard, Sørensen–Dice, BM25
  (default).
- **Multi-field weighting**, **recency decay**, and **flexible exclusions**.
- **In-memory LRU cache** (TTL-aware) and **optional precomputed sidecar
  collection** for large corpora.
- **Admin sidebar widget** with an editor-visible scorer dropdown plus optional
  `adminField.scorer` default (compare algorithms without touching collection config).
- **Keyword cloud** rendered on the source-collection list view, lazy-loaded
  and computed on demand.
- **REST endpoint**, typed **`getRelated()`** server API, and a headless
  **`useRelatedItems`** React hook.
- Pairs with [`@payloadcms/plugin-search`](https://payloadcms.com/docs/plugins/search)
  out of the box, or any custom data source via the `SourceAdapter`
  interface.

<!-- > Tiered roadmap: this repo ships the **free core**. A commercial add-on with
> semantic embeddings, A/B testing, external vector providers, and an
> analytics dashboard is planned separately. -->

## Install

```bash
pnpm add payload-related-items
# or
npm install payload-related-items
```

Peer dependency: `payload` ≥ 3.x. `@payloadcms/ui`, `react`, `react-dom` are
optional peer deps used only by the admin sidebar widget and the React hook.

## Quick start

The simplest setup pairs this plugin with `@payloadcms/plugin-search`, which
handles keyword extraction and gives you one shared index to query.

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { searchPlugin } from '@payloadcms/plugin-search'
import { extractKeywords, payloadRelatedItems } from 'payload-related-items'

export default buildConfig({
  collections: [
    /* posts, articles, ... */
  ],
  plugins: [
    searchPlugin({
      collections: ['posts', 'articles'],
      searchOverrides: {
        fields: ({ defaultFields }) => [
          ...defaultFields,
          { name: 'keywords', type: 'text', hasMany: true },
        ],
      },
      beforeSync: ({ originalDoc, searchDoc }) => ({
        ...searchDoc,
        keywords: extractKeywords(
          [originalDoc.title, originalDoc.excerpt, originalDoc.body].filter(Boolean).join(' '),
        ),
      }),
    }),
    payloadRelatedItems({
      collections: {
        posts: {
          fields: [{ name: 'keywords', weight: 1 }],
          recency: { field: 'publishedAt', halfLifeDays: 60 },
        },
        articles: {
          fields: [{ name: 'keywords', weight: 1 }],
        },
      },
    }),
  ],
})
```

That's it. Each configured collection now exposes:

- A sidebar **Related Items** panel in the admin.
- `GET /api/related/:collection/:id?limit=5` — JSON response.
- `getRelated({ payload, collection, id })` in server code.
- `useRelatedItems({ collection, id })` in client components (from
  `payload-related-items/client`).

## Documentation

| Topic                                      | What's in there                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| [Configuration](./docs/configuration.md)   | Full options reference: source, collections, cache, recency, disabling. |
| [Scorers](./docs/scorers.md)               | Algorithm comparison + the three layers where you can set the scorer.   |
| [API](./docs/api.md)                       | `getRelated()`, REST endpoint, headless React hook, result shape.       |
| [Precomputation](./docs/precomputation.md) | Sidecar collection, incremental sync, full rebuilds.                    |
| [Word cloud](./docs/word-cloud.md)         | On-demand admin keyword cloud + REST endpoint.                          |
| [Source adapter](./docs/source-adapter.md) | How keyword storage works + plugging in a non-search-plugin source.     |
| [Development](./docs/development.md)       | Project layout, scripts, releasing, adding a scorer.                    |

## FAQ

### Do I need `@payloadcms/plugin-search`?

No, but it's the path of least resistance. The plugin reads from any source
via a `SourceAdapter`. The default adapter targets the search plugin's
collection because (a) it already gives you a polymorphic relationship back
to the originating doc, and (b) it's where most Payload projects already
extract keywords. See [Source adapter](./docs/source-adapter.md) to roll
your own.

### Where do keywords actually get stored?

Once, on the search-plugin collection — not duplicated on each content
collection. Your `searchPlugin({ beforeSync })` decides what goes in. See
[Source adapter](./docs/source-adapter.md#how-keyword-storage-works).

### Which scorer should I use?

`bm25` is a strong default. It down-weights generic words via IDF and
length-normalizes, which matters once you have more than a few hundred
documents. For very short keyword lists try `dice`; for sparse, tidy sets
`jaccard` is fine. Full guidance in
[Scorers](./docs/scorers.md#picking-a-scorer).

### Can I use a different scorer for the admin widget vs. the public site?

Yes — that's a first-class concern. Set `adminField.scorer` as the **initial**
scorer for the widget (collection default vs BM25 vs Dice, …).
Editors can change it per session via the scorer dropdown in the sidebar.
See [Where to set the scorer](./docs/scorers.md#where-to-set-the-scorer).

### What does the score number mean?

All blended scores are in **`[0, 1]`** — higher means more related.
Exact BM25 keyword overlap normalizes to **1** for that query; partial overlaps are below **1**.
Recency decay (when configured) can multiply the blended score before filtering.

See [Scorers](./docs/scorers.md#bm25-score-shape-and-display).

### Why does my sidebar show title/name/slug from search rows?

With the default search-plugin adapter, the plugin **`select`s common display fields**
(`title`, `name`, `slug`, `description`) onto each source row so `RelatedItem.source`
can render readable labels without calling `populate`. For populated originals use
`getRelated({ populate: true })` or `?populate=true` as usual.
See [API](./docs/api.md#populating-original-docs).

### Is the cache safe across multiple processes?

The LRU cache is **per-process**. Source-collection writes invalidate the
local cache instantly via `afterChange` / `afterDelete` hooks. For
multi-instance deployments where strong cross-process freshness matters,
lower `cache.ttlSeconds` or disable the cache. For larger corpora, prefer
the [precomputed sidecar](./docs/precomputation.md) instead.

### How fresh is the precomputed sidecar?

With `precompute.incremental: true` (default when precompute is enabled),
the sidecar is updated on every source-collection write. Run
`rebuildRelatedIndex({ payload })` periodically if you want a belt-and-suspenders
guarantee.

### Does this work with Postgres / SQLite / Mongo?

Yes — the plugin only uses Payload's collection APIs (`find`, `findByID`,
`update`, `create`, `delete`). Whatever Payload supports, this supports.

### Does it support draft / locale-aware content?

Reads honour the requesting user's session via `PayloadRequest`, so
collection-level access control applies. For drafts/locales specifically,
pass an explicit `filter` in the collection config (e.g. `{ status: { equals:
'published' } }`), or call `getRelated({ filter, req })` per call.

### How do I render the title / slug / cover image of related items on the frontend?

Pass `populate: true` (or `{ depth: 1 }` for relationship resolution) to
`getRelated()`, the REST endpoint (`?populate=true`), or the
`useRelatedItems` hook. Each result then carries the full originating
document as `doc`, batched server-side to avoid N+1 fetches. See
[API → Populating original docs](./docs/api.md#populating-original-docs).

### What is the keyword cloud on the source-collection list page?

An admin-only helper that aggregates keyword frequencies across your source
collection rows on demand and renders them sized by frequency. The renderer
is code-split (`React.lazy`), so nothing is bundled or computed until an
editor clicks **Compute word cloud**. See [Word cloud](./docs/word-cloud.md)
for scale notes, configuration, and the REST endpoint that backs it.

### Can I disable the admin widget without removing the plugin?

Yes — `adminField: false` (or `adminField: { enabled: false }`) keeps the
REST endpoint, hooks, and `getRelated()` working without injecting any
field into the admin.

### Does this need a separate background worker?

No. The default path is in-memory + cache. Precomputation runs inline in the
source collection's hooks (incremental) or as an explicit
`rebuildRelatedIndex()` call you can schedule any way you like (cron, queue
job, `onInit`, etc.). No new runtime to operate.

## License

MIT. Copyright © Krzysztof Radomski
