# Development

```bash
pnpm install
pnpm dev           # run the dev Payload app in ./dev
pnpm test:int      # vitest (unit + integration)
pnpm test:e2e      # playwright
pnpm lint
pnpm tsc --noEmit
```

The `dev/` folder contains a minimal Payload app wired up with
`@payloadcms/plugin-search` and this plugin. It boots an in-memory MongoDB
replica set if `DATABASE_URL` is unset, so `pnpm dev` and `pnpm test:int`
work out of the box.

## Project layout

```
src/
  api/             getRelated() and helpers
  cache/           in-memory LRU + TTL
  components/     RelatedItemsField (admin UI)
  core/            ranking pipeline
  endpoints/       REST endpoint
  fields/          ui-field factory for the admin sidebar
  hooks/           useRelatedItems React hook
  scorers/         jaccard, weightedJaccard, dice, bm25
  sidecar/         precomputed-index collection + rebuild
  source/          search-plugin source adapter, keyword utils
  defaults.ts      sanitizeConfig + defaults
  plugin.ts        plugin entrypoint
  runtime.ts       per-Payload runtime registry
  types.ts         public types
dev/               minimal Payload app for local testing
docs/              extended documentation (this folder)
```

## Adding a scorer

1. Implement `ScorerFn` in `src/scorers/<name>.ts`.
2. Register it in `src/scorers/index.ts`.
3. Add the literal to `ScorerName` in `src/types.ts`.
4. Add unit tests in `src/scorers/scorers.spec.ts`.
5. Document it in `docs/scorers.md` and the README quick-start table.

## Releasing

The package publishes only the `dist/` folder (per `package.json` `files`).
Make sure `pnpm build` succeeds and tests are green before tagging a release.

## Plugin API surface

The public entrypoint (`src/plugin.ts`) uses Payload's `definePlugin` helper
with explicit `slug` (`payload-related-items`) and `order` metadata.
This keeps the consumer API unchanged (`payloadRelatedItems({ ... })`) while
aligning with the recommended API shape for published Payload plugins.

The package also declares:

```ts
declare module 'payload' {
  interface RegisteredPlugins {
    'payload-related-items': PayloadRelatedItemsConfig
  }
}
```

so downstream projects get typed plugin registration automatically on import.
