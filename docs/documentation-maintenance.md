# Documentation maintenance (internal)

This is internal engineering documentation. Public user-facing pages are authored
in `apps/docs/src/content/docs`; this directory is never published wholesale. All
existing `docs/` materials remain maintained. Architecture and accepted OpenSpec
remain authoritative; public prose does not replace them.

## Topic ownership

| Public section | Internal references and acceptance sources |
| --- | --- |
| Getting started | personal-site-guide.md, compatibility.md, generated README/Compose guides |
| Content modeling | node-api.md, configuration-synchronization.md, composite-fields.md, field-guidance.md, form-organization.md, model/SEO/block specs |
| Editing content | rich-text-authoring.md, admin/media/account specs |
| Astro integration | site-styling.md, generated lace-astro-site.md, SDK/render/block-installation specs |
| Deployment | cloudflare-worker.md, cloudflare-deployment-handoff.md, generated Compose/Cloudflare guides |
| Operations | auth-operations.md, database-migrations.md, compatibility.md, generated lace-operations.md |
| Reference | CLI help/environment declarations, REST/API-docs specs, apps/api/openapi/api-v1.json |

When behavior changes, review the public guide, the related internal documents and
generated guides separately. Preserve internal evidence and historical records.
Generated guides remain version-matched consumer assets, not imports of latest
public prose. Public pages link within the public site; contributor-only links
should explicitly identify GitHub source.

## Locale/version catalog

`apps/docs/src/catalog.json` declares default/supported locales and versions.
English/latest targets `0.1.0-alpha.6` and follows main; it does not assert npm
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
