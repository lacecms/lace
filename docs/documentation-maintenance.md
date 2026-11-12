# Documentation maintenance (internal)

This is internal engineering documentation. Public user-facing pages are authored
in `apps/docs/src/content/docs`; this directory is never published wholesale. The
[internal index](README.md) records each document’s status and consolidated replacements. Architecture and accepted OpenSpec
remain authoritative; public prose does not replace them.

## Topic ownership

| Public section | Internal references and acceptance sources |
| --- | --- |
| Getting started | compatibility.md, project-generator and generated-project-onboarding specs, generated README/Compose guides |
| Content modeling | configuration-synchronization.md, collection-queries.md, internal-url-links.md (links page), ADR 0013, ADR 0018 and ADR 0031, content-model-configuration, field-descriptors, list-layout, conditional-fields, collection-query-options and block specs |
| Editing content | content-import.md (import guide, sample package), auth-operations.md (accounts), admin draft-editor, media-library, remote-state/lists, account and content-import-cli specs |
| Astro integration | render-core, astro-adapter, gallery-block, block-source-registry and public-sdk specs, registry sources, generated lace-astro-site.md |
| Deployment | node-api.md, cloudflare-worker.md, cloudflare-deployment-handoff.md, generated Compose/Cloudflare guides |
| Operations | auth-operations.md, database-migrations.md, compatibility.md, [verification.md](verification.md) (commands, coverage and owner checks), MCP specs (MCP page), generated lace-operations.md and lace-mcp.md |
| Reference | CLI help, generated configuration files, configuration input types, `apps/api/openapi/api-v1.json`, contracts MCP tool schemas; guarded by `tests/docs-reference.test.mjs` |

Each user-facing topic has one owner. User procedures, settings and examples
live on public pages; a remaining internal note keeps engineering content and
links to its public owner (named in the [index](README.md)). A note left with
nothing engineering is deleted and recorded under "Promoted and deleted".

When behavior changes, review the public guide, the related internal documents and
generated guides separately. Keep run evidence in its result directory and release readiness in archived changes; update the index and incoming links when consolidating or deleting internal documents.
Generated guides remain version-matched consumer assets, not imports of latest
public prose. Public pages link within the public site; contributor-only links
should explicitly identify GitHub source.

## Page rules

Every page declares `kind` and `verifiedAgainst` in its frontmatter;
`apps/docs/scripts/check.mjs` enforces both.

- `overview`: an introduction and links, no second-level sections (landing,
  `deployment/`, `reference/`).
- `guide`: a purpose paragraph, then *Before you start*, at least one task
  section, and a final *Reference* section that links a Reference page.
- `reference`: tables under `reference/`, one row per item with purpose text.

`verifiedAgainst` names the release a page was last checked against: the
current `version` of `release/alpha.json` or one of its non-alpha
`publishedVersions`. Set it to the current `version` whenever you change or
re-check a page; release preparation does not touch pages. The footer shows it
as "Verified against …". The catalog `target` must equal the release `version`.

`tests/docs-reference.test.mjs` derives every CLI command and flag, `LACE_*`
setting, configuration option, field builder, REST path and MCP tool/scope from
shipped artifacts and fails naming each one the Reference pages do not mention.
Add the row when you add the item.

## Locale/version catalog

`apps/docs/src/catalog.json` declares default/supported locales and versions.
English/latest targets `0.1.0-rc2` and follows main; it does not assert npm
publication or actual deployment verification. Author under `en/latest/`. Future
variants use `<locale>/<version>/` and stable page slugs; do not rename existing
routes. The validation/build fixture proves another locale and version without
publishing fixtures. Enable real translations/snapshots and design switcher/search
UX in their own change. Unknown pairs must not silently display another version.

## Local checks

Run `pnpm docs:dev`, `pnpm docs:build`, or `pnpm docs:check` from the root.
`pnpm --filter @lacecms/app-docs test:variants` builds an isolated extra variant.
Serve the built site with `pnpm --filter @lacecms/app-docs exec astro preview --port 4322`
and smoke-check root entry, deep navigation, theme, keyboard/mobile and Pagefind
in a browser at `/lace/`.
Root quality gates include the app; no CMS service is needed. Build preparation
copies only committed OpenAPI JSON into ignored `public/reference/openapi.json`.
The publication detector also treats the rendered `release/alpha.json` fields
(`version`, `publishedVersions`) as input.
`pnpm openapi:check` verifies that the committed API contract is current.

## GitHub Pages setup and recovery

The docs-pages workflow publishes `https://lacecms.github.io/lace/` from main.
One-time repository setup: select Settings → Pages → Source → GitHub Actions;
allow only main in the `github-pages` environment deployment branch policy.
Allow the workflow its read/deployment permissions. No PAT, CMS credentials or
Cloudflare secrets are used. PRs use normal CI checks and never deploy.

The workflow compares declared public build inputs to the last successful Pages
deployment for this workflow. It runs lightweight detection on every main push,
but builds/uploads/deploys only changed inputs. Input scope includes the app,
OpenAPI, deployment/check scripts, effective toolchain/build configuration and
the docs lockfile dependency closure. Unrelated CMS/internal docs/README/release
status or unrelated dependency changes do not independently publish. If a shared
setting begins affecting the build, extend the detector and its fixtures.

Deployment-history errors are failures, not first-publish states. Caches are not
publication receipts. Running publications are serialized; stale ancestors cannot
replace a successfully deployed descendant. A failed publication does not advance
the baseline, so the next main push retries unpublished docs even if that push
only changes CMS code. Summaries show baseline/source SHAs and Pages URL.

Use Actions → Documentation Pages → Run workflow on **main** with `force` enabled
to rebuild an unchanged revision after an infrastructure failure. Feature-branch
dispatch cannot publish. Revert content through a new main commit to roll back.
For divergent/force-pushed history restore access to the deployed commit and main
ancestry; do not bypass the history guard to publish an old run. Never manually
mark a failed run successful.

After the first actual successful hosted run, check the returned URL, a deep page,
resources and Pagefind search. Local verification and workflow source inspection
do not establish live hosting; report pending Pages settings or account permission
checks explicitly. No deployment or settings mutation is performed by local builds.
