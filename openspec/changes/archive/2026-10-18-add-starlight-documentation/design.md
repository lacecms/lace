## Context

See proposal.md for motivation and DOC1 scope. There are no other active changes. The engine already has a pnpm catalog, Astro `7.3.1`, Turbo build outputs (`dist/**`), Oxlint/Oxfmt, root quality CI on PR/main, a generated OpenAPI document at `apps/api/openapi/api-v1.json`, and private `apps/site` as the engine fixture rather than public documentation. The root README currently serves contributors. Maintained internal `docs/` and generated-project scenario guides already describe many user journeys.

`release/alpha.json` selects `0.1.0-alpha.6` but records published versions separately. Documentation targets alpha.6 as the owner requested, follows main, and must preserve that distinction. Documentation languages do not change CMS content-localization scope.

This design is required because the change adds a new application/dependency and crosses content routing, contributor entry points and externally deployed CI.

## Goals / Non-Goals

**Goals:** Keep documentation deployable as static files, preserve runtime boundaries, establish stable language/version routes now, and make publication decisions recoverable from durable successful deployment history.

**Non-Goals:** No CMS data or authentication changes, new runtime provider, generated-consumer template rewrite, release automation, translated content, archived release content, custom domain or automated snapshots. Support for future variants means an implemented structural seam tested with fixtures, not production content or a full translation/version-management product.

## Decisions

### 1. Private Astro/Starlight workspace app

Create `apps/docs` / `@lacecms/app-docs`, using a stable Starlight release verified compatible with the pinned Astro baseline, pinned in the root catalog and frozen lockfile. Keep one workspace lockfile. Use static output; no SSR adapter. App scripts cover dev, build, typecheck, lint and focused verification. Add convenient root `docs:dev`, `docs:build`, `docs:check` entry points delegating to the package/Turbo rather than duplicating behavior. Preserve the current Node `24.12.0` and pnpm `12.3.4` execution pins and minimum eligibility policy.

Use Starlight's sidebar, contents, theme, code presentation and Pagefind; apply only modest Lace branding. Docs sources depend on Astro/Starlight and local files, not Lace runtime packages. Extend the boundary check's explicit member map with an empty Lace dependency set and add forbidden-edge fixtures in both directions. Avoid application exports pretending this is a public runtime library; the app is consumed through commands and static output. Existing public-package entry-point guarantees apply when another member consumes a Lace library, which docs does not do. Verify root build/checks and release inventory tolerate the new private member without changing the fifteen public packages or API/builder image contents.

Alternative rejected: reuse `apps/site`, which is an engine fixture with runtime content dependencies. A separate repository would add unnecessary version/review coordination.

### 2. Locale first, explicit version second

Use Starlight's native explicit `en` locale rather than a root locale. Place authored pages under `src/content/docs/en/latest/`. URLs are `/lace/en/latest/<page>/`; the latest landing page is `/lace/en/latest/`. Build a static root entry redirect/link to it that honors Astro base. This is a GitHub Pages static redirect, not a promised HTTP redirect status.

Keep a small typed/validated local documentation catalog containing supported locales, supported version slugs, default pair and target CMS version. Initially it contains only English, latest and `0.1.0-alpha.6`; it is independent of npm dist tags and is not fetched during builds. The target appears as normal reader-facing version information; explain that latest follows main. Link release status/notes on GitHub when necessary rather than publishing internal evidence directories.

Derive sidebar entries from the active locale/version catalog. Do not render one-option selectors. Additional languages can later add `src/content/docs/<locale>/<version>/...`; fixed snapshots can add a stable version slug alongside latest. Stable routes and page identity are preserved. Validate catalog/content agreement and distinct page slugs. No production translations/snapshots are authored now. A temporary build fixture proves another locale and fixed-version section work without replacing templates or renaming existing pages; remove fixtures from production output. Current production search indexes only the supported English/latest section. Future mixed-version search filtering and variant-switcher UX must be designed when those variants are actually enabled, rather than promising silent cross-version fallback now.

Use base-aware links and local source assets. Nonexistent language/version paths produce the static not-found page, not a catch-all rewrite to English latest. Keep public page identity stable so later translations can reuse the same page slugs.

Alternative rejected: unprefixed English/latest routes, which complicate later coexistence; a third-party versioning plugin is unnecessary for one edition.

### 3. Authored public guides with an internal ownership map

Author the seven sections from the proposal, using the accepted specs and current implementation as accuracy references. Public prose addresses adopters/editors/operators; it does not copy acceptance logs, machine paths, roadmap IDs or internal architecture text into the site. Include substantive guides for all requirements in `public-documentation`; avoid placeholder pages.

Keep every existing `docs/**` document internal in purpose and maintained. Add `docs/documentation-maintenance.md` mapping public sections to relevant accepted specs, internal guides and generated consumer guides, with the policy that behavior changes review each affected audience. Internal architecture/OpenSpec retain their existing authority; audience ownership does not override that order. Add small cross-links/purpose clarifications in relevant internal guides where useful, rather than removing originals or making docs build from the entire directory. Public pages link to other public pages; contributor-only references point explicitly to GitHub source when needed.

Use these initial source groups:

| Public section | Maintained internal and generated reference material |
| --- | --- |
| Getting started | `docs/personal-site-guide.md`, `docs/compatibility.md`, generated README/Compose guides |
| Content modeling | `docs/node-api.md`, configuration synchronization, composite fields, field guidance, form organization; accepted model/SEO/block specs |
| Editing content | `docs/rich-text-authoring.md`, accepted admin/media/account specs |
| Astro integration | `docs/site-styling.md`, generated `lace-astro-site.md`, accepted SDK/rendering/block-installation specs |
| Deployment | `docs/cloudflare-worker.md`, deployment handoff, generated Compose/Cloudflare guides |
| Operations | `docs/auth-operations.md`, `docs/database-migrations.md`, `docs/compatibility.md`, generated `lace-operations.md` |
| Reference | CLI help, config/environment declarations, accepted REST/API-docs specs, committed OpenAPI JSON |

Build preparation copies only the committed OpenAPI JSON into an ignored/generated app output location served as a public download. Do not import the API app or generate OpenAPI from a running CMS. Keep `pnpm openapi:check` as the existing contract freshness check. There is no embedded API request console on the site; describe the existing optional same-origin `/api/docs` feature and its configuration.

### 4. README and development guide

Rewrite `README.md` around a short product introduction, practical capabilities, deployment options, alpha maturity and prominent links to `https://lacecms.github.io/lace/en/latest/` and `./DEVELOPMENT.md`. Move/adapt the existing contributor material into root `DEVELOPMENT.md`, preserving valid `./docs/...` links and command distinctions. Explain engine development versus generated project operation. Include how to run and verify the docs application and link its internal maintenance guide. Keep the long internal setup/acceptance instructions discoverable rather than deleting them or forcing them into public quickstart prose. Do not change generated-project READMEs in this session.

### 5. Declared inputs, compared with successful deployment history

Use a separate `.github/workflows/docs-pages.yml` for main publication/manual recovery and root CI for PR/root verification. The main workflow runs a lightweight decision on every push rather than relying exclusively on GitHub's path-filter diff limits or a prior failed run. PR optimization may use a change detector, but existing required root CI is never path-skipped.

Implement a deterministic docs-input fingerprint helper in `scripts/`, using a pinned YAML parser where necessary. Its declared inputs include authored app sources/assets/configuration (excluding generated output), the docs workflow and build/verification scripts, the committed public OpenAPI JSON, relevant TypeScript/Turbo configuration and build-tool settings. Project only the root manifest scripts/toolchain/catalog settings actually used by docs. From the pnpm lockfile, normalize the docs importer and its complete resolved build dependency closure, including transitive/peer/optional snapshots and applicable overrides/install settings. Do not hash the entire monorepo lockfile, unrelated catalog entries, root README/DEVELOPMENT, internal docs or release status metadata. Target/version metadata is local to the app and therefore included. If a root setting starts affecting docs build, its declaration must be updated in the same change.

Resolve the last successful deployment SHA from this repository's dedicated Pages environment/deployment records for this workflow; paginate/validate records instead of assuming the most recent attempt succeeded. Use GitHub API read permissions for deployment history as required by the endpoint. Fetch sufficient Git history, then compute both fingerprints from tracked data at the candidate and deployed SHA using the current trusted helper. Never execute historical repository scripts to compute a baseline. Changes to the helper itself are declared input changes. No successful deployment is the first-build state. API failures, invalid lockfile projection or unavailable baseline commits fail explicitly; a lost cache does not trigger publication. Logs show baseline/candidate SHAs, fingerprint comparison and changed input categories, not secrets.

“Changed” means changed effective documentation inputs; a content/style/build dependency change can legitimately republish even if it happens to produce identical HTML. This avoids a mandatory full rebuild on every unrelated CMS commit. Frozen install and documentation validation/build run only after a changed decision (or manual force); upload `apps/docs/dist` with official Pages actions. A comparison-only helper may use the already pinned Node runtime with its minimal declared parser dependencies; do not install the whole workspace merely to decide whether docs changed.

Alternative rejected: broad `paths` rules including the whole lockfile, which republish for unrelated CMS updates; cache-only baselines, which lose correctness on eviction; comparison only to the previous commit, which loses a failed docs publication on the next unrelated push; output hashing on every push, which requires unnecessary builds.

### 6. Trusted serialized deployment and recovery

Run the publication workflow in a single docs Pages concurrency group with running deployment cancellation disabled. Pending runs may be superseded; the next surviving main run still compares against durable successful state, so it includes unpublished documentation. Refresh the baseline and comparison inside this serialized path. Before deploying, verify that the candidate belongs to main and has not been superseded by a successfully deployed descendant: skip an older ancestor; allow an identical SHA only for manual force. Treat divergent history as a diagnostic failure rather than guessing after a force push. This protects against old run reruns even though GitHub concurrency alone does not promise ordering.

PRs never run deployment steps. Only the main build can provide the artifact to the deploy job. Scope `contents: read` and deployment-history read access as needed, and grant `pages: write` / `id-token: write` only to the deploy job. Use `github-pages` environment with main-only protection and official configure/upload/deploy actions; choose verified compatible pinned action revisions during apply, preserving the repo's explicit toolchain setup. No PAT or CMS/cloud secrets. Manual dispatch on a non-main ref stops before write authority; a main-only force option reruns the build even with equal fingerprints. Publication status/baseline comes from confirmed successful Pages deployment, not an earlier artifact upload or cached flag.

Record selected source SHA and Pages URL in workflow summaries. Tests inject API/history responses to verify absent history, failures, retries and stale candidates. Provider deployment is the external atomic hosting boundary; do not modify the last published site in separate per-file writes. Retain the previous successful deployment as recovery reference if a provider failure occurs. A failed build never reaches deployment.

### 7. Validation proportional to the new behavior

Verify catalog/routes/content coverage, generated local links/fragments/assets, forbidden internal-file inclusion, OpenAPI copy, and `/lace/` base behavior. Use a built-site browser smoke check for root entry, sidebar, keyboard/mobile navigation, theme and a Pagefind search result; dev-server-only tests cannot validate Pagefind's production index. Use targeted fixture builds for a second locale/version structural seam. Public external URLs are reviewed as links, not made a flaky mandatory network crawl. Add behavioral tests for fingerprint dependency closure and deployment-history/ordering decisions, including an unrelated lockfile update and a failed deployment followed by an unrelated commit.

Run the focused checks first, then root typecheck, lint, format check, test/build, existing OpenAPI freshness check and strict OpenSpec validation. Do not add ESLint/Prettier. Existing formatter ignores `docs/**` and `openspec/**`; the new app's Markdown/configuration still needs supported format checks without introducing wrappers or changing global format policy unnecessarily.

## Risks / Trade-offs

- Two maintained audiences can drift → keep an internal topic/source map and require audience review when behavior changes; never treat internal prose as automatically public.
- Starlight API/dependency compatibility → verify an exact stable release against catalog Astro before install; if incompatible, revise planning rather than downgrade engine dependencies silently.
- Fingerprint omissions or pnpm lockfile evolution → strict normalized closure parsing, representative fixtures, explicit failure on unsupported metadata and declared-input tests.
- Documentation on main can describe unreleased changes → label the target and main tracking; do not infer publication from `release/alpha.json.version`.
- Public URLs depend on Pages settings → use `/lace/` in production build smoke checks and document one-time Actions/environment setup. No claim of successful live hosting without an actual successful run.
- Main force-push can invalidate deployment ancestry → fail explicitly and document operator recovery via restoring accessible history or deliberately revising the deployment baseline policy; never silently deploy an older run.

## Migration Plan

1. During apply, document DOC1 and the private docs app boundary in backlog/architecture before code. This adds an application, not a CMS scope or content-model invariant change.
2. Add the app and public content, move contributor README guidance, retain internal documents and add ownership links. Validate locally and in PR CI.
3. Add the main-only publication workflow and operator instructions. Configure Pages Source = GitHub Actions and environment branch policy as a one-time repository operation when deploying; no settings are mutated during planning.
4. The first eligible main run publishes because no successful docs deployment exists. Confirm actual Pages URL, navigation/resources and search after it succeeds; report separately if settings/permissions block that external check.
5. To roll back public content, revert the relevant input commit on main and let the normal workflow build the new reverting commit. A retry can use manual force on main. Keep previous successful deployment records. No database migration or stored-content rollback is involved.

## References

- [Starlight localization](https://starlight.astro.build/guides/i18n/) and [configuration/search](https://starlight.astro.build/reference/configuration/).
- [Astro GitHub Pages deployment and base paths](https://docs.astro.build/en/guides/deploy/github/).
- [GitHub Pages custom workflows, artifacts and permissions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
