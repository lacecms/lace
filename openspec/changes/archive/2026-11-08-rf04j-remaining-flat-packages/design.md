## Context

- See proposal.md *Why*. Production sizes: `sdk` 1,477 lines (`client.ts`
  645, `published-site.ts` 564), `render` 691, `create-lace` 856
  (`index.ts` 417), `apps/api` 568, `apps/builder` 919. No file is in the
  oversized or cycle baselines.
- `scripts/check-boundaries.mjs` `checkSourceLayout` accepts a root module
  only when `manifestEntrySources` (manifest `exports` and `bin` targets of the
  form `./dist/<name>.js`) names it, and reads the header from `src/index.ts`.
  `checkJavaScriptSources` skips every `*.test.(c|m)js` path, and its scan
  covers `.js`, `.cjs` and `.mjs`. `.mjs` files are not production graph
  nodes (`sourceExtensions` holds `.ts`, `.tsx`, `.mts`, `.cts`, `.astro`), so
  `apps/api/src/dev-bootstrap.mjs` needs no root-entry entry; it stays in the
  JavaScript allowlist.
- Process entries started directly: `apps/api` `dev.ts` (`pnpm dev`,
  `scripts/dev-stack.mjs`), `production.ts` (Dockerfile `CMD`),
  `dispatcher.ts` (Compose `dispatcher` service, also in the generated
  project's `docker-compose.yml` and the template 0.35.0/0.39.0 fixtures),
  `content-sync-cli.ts` (operator command in `deploy/README.md`,
  `scripts/dev-stack.mjs`), `cloudflare-local.ts` (`scripts/dev-stack.mjs`);
  `apps/builder` `main.ts` (`start` script, Dockerfile).
- Modules resolving files relative to their own URL:
  `create-lace/src/index.ts` (`../templates/`) and
  `apps/api/src/project-config.ts` (`../../../lace.config.ts`).
  `cloudflare-local.ts` (`../wrangler.jsonc`) stays at root.
- External readers of moved files: `scripts/release-model.mjs` and
  `tests/release-artifacts.test.mjs` read
  `packages/create-lace/src/inventory.ts`; `scripts/release-artifacts.mjs`
  imports the packed `dist/inventory.js`; `scripts/release-images.mjs`,
  `scripts/generate-openapi.mjs`, `scripts/fixtures/oauth-mcp/ui-server.mjs`
  and `tests/support/cross-runtime-fixture.mjs` import `apps/api` dist
  modules; `tests/builder-diagnostics.test.mjs` imports
  `apps/builder/dist/diagnostics.js`; `scripts/operations-verification.mjs`
  and `scripts/security-resilience-verification.mjs` name
  `apps/builder/src/runner.test.ts`; `docs/personal-site-guide.md` names
  `apps/builder/src/runner.ts`.

## Goals / Non-Goals

**Goals:** every RF4J package is either declared in
`scripts/source-layout.json` or recorded as exempt; moves are verbatim, so
runtime keys, declaration names and test titles are unchanged; operator
commands keep their paths; the checker can express both new outcomes.

**Non-Goals:** splitting test files over 1,000 lines (`sdk`
`published-site.test.ts`, 1,096 lines, is RF9C's); typing baselined tests;
renaming any export; changing what any process does.

## Decisions

### D1. `sdk`: `client/` and `site/`

| Module | Content |
| --- | --- |
| `client/errors.ts` | `LaceSdkError`, `LaceTransportError`, `LaceTimeoutError`, `LaceHttpError`, `LaceContractError`, `LaceLinkManifestError`, `LaceUnsupportedExportFormatError` |
| `client/client.ts` | the rest of `client.ts`: `packageName`, `userAgent`, options and result types, request helpers, `createLaceClient` |
| `site/published-site.ts`, `site/seo.ts`, `site/internal-links.ts`, `site/site-files.ts` | verbatim |

Direction `client ← site`. The entry keeps `export *` from `client/client.ts`,
`client/errors.ts`, `site/published-site.ts`, `site/seo.ts`,
`site/site-files.ts` and the named type-only re-export from
`site/internal-links.ts`, so the export list is identical. Tests:
`index.test.ts` (client behavior) moves to `client/client.test.ts`
importing the two client modules, keeping its package-identity case;
`published-site.test.ts`, `seo.test.ts` and `site-files.test.ts` move into
`site/` and import the `client/` and `site/` modules they exercise instead of
the entry. Rejected: keeping `client.ts` whole — errors are imported by
`published-site.ts` independently of the transport, and the file would be the
only one mixing an error hierarchy with request logic.

### D2. `create-lace`: `site/`, `template/`, `generator/`, `cli/`

| Module | Content (from) |
| --- | --- |
| `site/modes.ts` | `SiteMode`, `SITE_MODES`, `SiteSelection`, `SiteRecord`, `SiteError`, `siteRecord`, `siteFlags`, `normalizeSitePath`, `requireSitePath` (`site.ts`) |
| `site/existing.ts` | `isAstroProject`, `validateExistingSite` and their private `lstat` helper (`site.ts`) |
| `template/inventory.ts`, `template/render.ts` | verbatim |
| `generator/project.ts` | `GenerateOptions`, `GeneratedProject`, `ProjectManifest`, `GeneratorError`, `generateProject` and private helpers (`index.ts`) |
| `cli/prompt.ts` | `Prompter`, `createPrompter`, `promptSite` (`site.ts`) |
| `cli/arguments.ts` | `usage`, `FLAGS`, `ParsedArguments`, `parseArguments` (`index.ts`) |
| `cli/run.ts` | `CliTerminal`, `detectAstroParent`, `nextSteps`, `runCli` (`index.ts`) |

Direction: `site ← template ← generator ← cli`, with `cli` also importing
`site`. `index.ts` keeps only the header and the current re-exports; `bin.ts`
is unchanged. The template root becomes `new URL("../../templates/", …)` in
`generator/project.ts`. `template/` is named in the singular to stay distinct
from the package's top-level `templates/` directory.

`scripts/release-model.mjs` and `tests/release-artifacts.test.mjs` read
`src/template/inventory.ts`; `scripts/release-artifacts.mjs` imports packed
`dist/template/inventory.js`. Tests stay at root: `scenario-guides.test.ts`
and `site-modes.test.ts` exercise `generateProject` and `runCli` across
directories through the entry. Rejected: moving prompting into `site/` — it
is terminal interaction, which `site/` would then share with filesystem
validation.

### D3. `apps/api`: `server/`, `config/`, `dispatch/` and root process entries

`server/node-server.ts` and `server/admin-assets.ts`,
`config/project-config.ts` and `dispatch/dispatcher-loop.ts` move verbatim.
`NodeApiConfig` moves from `node-server.ts` into `config/project-config.ts`,
which then imports only `@lacecms/platform-node` types; the three directories
import nothing from each other. The entry re-exports `node-server.ts` with
`export *` and `NodeApiConfig` by name, so the declaration list is unchanged.
The project configuration URL becomes `../../../../lace.config.ts`.

`dev.ts`, `production.ts`, `dispatcher.ts`, `content-sync-cli.ts` and
`cloudflare-local.ts` stay at root and are listed in
`scripts/source-root-entries.json`. External importers switch to
`dist/server/node-server.js`, `dist/server/admin-assets.js` and
`dist/config/project-config.js`. Tests: `node-server.test.ts` →
`server/`, `project-config.test.ts` → `config/`; `production.test.ts` and
`content-sync.test.ts` exercise root entries' composition and stay at root.

Rejected: moving process entries into a `bin/` directory or declaring them as
manifest subpath exports. The first changes operator commands in the
generated project template, Compose files, deploy guide and frozen template
fixtures; the second publishes private composition modules as package
exports.

### D4. `apps/builder`: `runner/` and `server/`

`runner/` holds `runner.ts`, `cache.ts`, `source.ts`, `diagnostics.ts` and
`settings.ts`; `server/handler.ts` is `server.ts` (`createBuilderHandler`).
Direction `runner ← server`. `main.ts` stays at root and is listed in
`scripts/source-root-entries.json`. Tests `runner.test.ts`,
`source.test.ts` → `runner/`, `server.test.ts` → `server/handler.test.ts`;
`index.test.ts` stays. External readers switch to
`dist/runner/diagnostics.js` and `apps/builder/src/runner/runner.test.ts`.
`docs/personal-site-guide.md` is updated in the same change. Rejected: a
`shared/` directory for `diagnostics.ts` and `settings.ts` — only the HTTP
handler reads diagnostics outside the runner, and failure reasons are build
outcomes.

### D5. `render` is exempt

`render` implements the one component of architecture §13.3: every module
turns published content into adapter-neutral render descriptions, and all of
them share `errors.ts`. It stays flat. `scripts/source-layout-exemptions.json`
records `"packages/render": "<reason>"`. Rejected: `blocks/` and
`rich-text/` directories — `links.ts` and `video-embeds.ts` serve both, so
the split would add a `shared/` directory for two 70-line modules.

### D6. Checker extensions

- `scripts/source-root-entries.json`: `{ "<member>/src/<file>": "<reason>" }`.
  `checkSourceLayout` adds listed files of the package to its accepted root
  set. A separate pass fails on an entry whose file is missing, whose path
  has a directory under `src/`, or whose member is not declared in
  `source-layout.json`.
- `scripts/source-layout-exemptions.json`: `{ "<member path>": "<reason>" }`.
  Fails when the path is not a member, is declared in `source-layout.json`,
  or its `src/` holds a directory other than `test-support/`. Full member
  coverage is not enforced (proposal non-goal).
- `checkJavaScriptSources`: the skip narrows from `*.test.(c|m)js` to
  `*.packaged.test.mjs`. A JavaScript test outside `test-support/` passes
  only when the allowlist names it.
- `tests/boundaries.test.mjs` gains one fixture case per new failure and pass
  scenario of the delta spec.

The two new files follow the reasoned-map shape of
`scripts/javascript-source-allowlist.json`. Rejected: adding reserved keys
inside `source-layout.json` values — every value is a directory map and the
directory-set comparison would have to exclude them.

### D7. Leftovers

- Contracts tests import the concrete module that defines each symbol,
  located with the entry's re-export lines. `index.test.ts` keeps
  `../index.js`; `shared/json.test.ts` and `shared/page-limit.test.ts`
  already import their module. Moved tests stay `@ts-nocheck` where baselined.
- The `config` packaged test adds a case that reads the emitted
  `dist/index.d.ts`, collects the names of its `export { … }`,
  `export type { … }` and `export declare …` statements, sorted, and compares
  them with a literal list captured in task 1.1. The workspace's TypeScript 7
  package has no JavaScript compiler API, so the test parses the entry text;
  it fails on an `export *` it cannot follow, which the `config` entry does
  not use. (Revised during apply; the first draft used the compiler API.)
- The one contracts case that tests the entry's re-export of the content SEO
  predicates (`shared SEO text rules > re-exports the domain SEO
  predicates`) moves from `content/seo.test.ts` into `index.test.ts` under
  the same describe, so its title is unchanged. `content/entries.test.ts`
  takes `SLUG_PATTERN` from `@lacecms/content`, which owns it. Namespace
  imports (`const c = await import(…)`) spread the concrete modules they use.
- `apps/api/vitest.config.mjs` becomes `sharedTestConfig()`. The packaged
  config is unchanged (the Worker tests already run there).

## Risks / Trade-offs

- [A relative URL off by one directory breaks generation or config loading
  only at runtime] → `create-lace` packaged tests generate projects from
  `dist/`, and `apps/api` `project-config.test.ts` loads the root config;
  both run in task verification.
- [A missed external importer of a moved dist file] → task 1.1 records the
  grep inventory of `apps/api/dist`, `apps/builder/dist`, `create-lace`
  `inventory` and moved test paths; the final grep must find no old path
  outside archives and the roadmap.
- [Removing serial execution exposes a hidden shared resource in `apps/api`
  source tests] → run the suite three times; if a file collides, fix its
  isolation (unique temp directories or ports) rather than restoring the
  flag.
- [The text-based declaration pin misses an export form it does not parse]
  → the emitted entry contains only re-export lists and `export declare`
  statements; the test rejects `export *` explicitly, and task 4.2 checks
  that removing a type export fails it.

## Migration Plan

Repository-internal refactor; no data, release or operator migration.
Rollback is reverting the commit.
