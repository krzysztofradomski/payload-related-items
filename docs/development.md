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

### First publish (one-time)

1. Create the package on [npmjs.com](https://www.npmjs.com/) (or let the first publish create it if your account allows).
2. Under **Settings → Trusted publishing**, add **GitHub Actions** with:
   - Repository: `krzysztofradomski/payload-related-items`
   - Workflow filename: `publish.yml`
3. Optionally set **Publishing access** to disallow long-lived tokens after trusted publishing works.

### Automated releases (recommended)

### npm authentication (required)

CI publish failed with `npm error 404` / “you do not have permission” almost always means **no valid npm credentials** in the workflow.

**Option A — Trusted publishing (recommended, no GitHub secret)**

1. On [npmjs.com](https://www.npmjs.com/) → `@krzysztofradomski/payload-related-items` → **Settings** → **Trusted publishing**
2. Add **GitHub Actions**: repo `krzysztofradomski/payload-related-items`, workflow filename **`publish.yml`**
3. Re-run the failed workflow or publish a new release

**Important:** If you use trusted publishing, **delete** the repo secret `NPM_TOKEN` if it exists. A stale or read-only `NPM_TOKEN` is passed as `NODE_AUTH_TOKEN` and **overrides OIDC**, which produces the same `npm error 404` even when trusted publishing is configured correctly.

**Option B — Automation token (fallback only)**

Use this instead of trusted publishing (not both): add a valid publish token as `NPM_TOKEN` and use a workflow that sets `NODE_AUTH_TOKEN` — not the default `publish.yml` in this repo.

1. Bump `version` in `package.json` on `main` and merge.
2. On GitHub: **Releases → Create a new release** → tag `v1.0.1` (must match `package.json`, e.g. `1.0.1`) → **Publish release**.
3. The [publish workflow](../.github/workflows/publish.yml) runs on `release: published`, then typecheck, lint, tests, build, and publish to npm.

The release tag (without the `v` prefix) must match `package.json` `version`.

### Manual publish (fallback)

```bash
pnpm build
npm publish --access public
```

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
