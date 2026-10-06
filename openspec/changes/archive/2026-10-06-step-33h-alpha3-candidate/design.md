## Context

See `proposal.md`. Observed state on 2026-10-06 (branch `codex/step-33-alpha2-field-trial-fixes`, after 33G `e94fd3f`):

- `release/alpha.json` names candidate `0.1.0-alpha.2`, template `0.16.0`, `publishedVersions: ["0.1.0-alpha.1"]`. npm lists `0.1.0-alpha.2` for all fifteen packages (`next`), GHCR has both `0.1.0-alpha.2` images; no `0.1.0-alpha.3` exists in either registry.
- 51 tracked files name `0.1.0-alpha.2` as a coordinate (manifests, templates, guides, Dockerfiles, registry items, fixtures, tests); `release:check` enforces them.
- Migration `0003_site_build_outcomes` (33D) is absent from alpha.2 engines; the current upgrade instructions list `database: []`.
- `pnpm acceptance:release --artifacts` already runs the 25C journeys and the onboarding suite against the inventory, including the template `0.14.0` upgrade (receipt still labelled `template-0.4.0-upgrade`). Field-trial proof otherwise lives in workspace-only tests: `apps/admin/e2e/block-order.e2e.ts` (33A), gzip-proxy loader tests (33B), `builder-diagnostics` phase with source-built images (33C), Worker unit tests with a Pages stub (33E), `credentials` phase with workspace tarballs (33F), static ordered checks of the production/Cloudflare guides (33G).
- `prepareCompose` keeps one module-level Compose project; `finally` tears down only the last one.

## Goals / Non-Goals

**Goals:** a coherent `0.1.0-alpha.3` candidate; every field-trial fix proven against its exact artifacts; feedback documents archived with guarded traceability.

**Non-Goals:** publishing; real-account or real-server runs; new product behavior; changing published sets or historical fixtures; amd64 end-to-end consumer runs.

## Decisions

### 1. Version `0.1.0-alpha.3`, template `0.17.0`

Increment the prerelease as in 32B: no intentional public API break justifies leaving the `0.1.0` experimental line. Template advances because managed bytes change (dependency/image coordinates, guide prerequisites). `publishedVersions` becomes `["0.1.0-alpha.1", "0.1.0-alpha.2"]`. Registry evidence is dated, not a reservation.

### 2. Upgrade instructions carry the alpha.2 → alpha.3 database step

The `0.17.0` entry names the coordinates, the manual `.env`/site dependency updates, and a `database` list (first non-empty one): back up, stop `api`/`dispatcher` (Compose) or dispatch, run `pnpm db:migrate` (Compose's `migrate` service also applies it on start) or `pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env` before deploying the new Worker; downgrade = restore the backup, because older engines reject the new statuses. Proof for the migration itself remains the 33D Node/D1 seeded-row migration tests; acceptance asserts the instruction text in the upgrade plan. Rejected: running a published alpha.2 image in acceptance to create real pre-0003 data — it would make acceptance depend on registry pulls.

Guides drop the "needs a compatible CLI that supports them … published alpha.2 packages do not contain them" phrasing in favour of "`0.1.0-alpha.3` or later; published `0.1.0-alpha.2` lacks …".

### 3. Field-trial journeys run after the onboarding journeys in `release`

Order after `feedbackJourneys` (main Compose stack still up and baseline published):

1. **block-order** (`scripts/block-order-acceptance.mjs`): HTTP creates a post `block-order` with one Hero; the packed admin (workspace Playwright only as harness, like `nodeBrowserJourney`) adds Hero blocks and performs pointer drag, keyboard move, middle insert, duplicate, remove and remove+undo. After each step: Save (submitted positions `1000·n`), reload (same keys/values), Publish, build export order via build token, wait for that version's Compose build to succeed and require the served `/blog/block-order/` HTML `data-lace-block-key` order. A rejection step intercepts one PUT and rewrites positions to equal values, so the real packed server rejects it; the page must show the block-order reason, keep edits and offer Copy my JSON, and a retry saves. An HTTP check sends descending positions: `422 CONTENT_INVALID_STATE`, "Block at index", `x-request-id`, revision and export unchanged. Waiting for each build instead of only the last avoids stale-version builds failing and retrying with backoff ahead of the final one. Rejected: an HTTP-only check — it would not prove the admin's resequencing, which was the defect.
2. **weak-etag** (`scripts/weak-etag-acceptance.mjs`): a local Node proxy in front of the Compose API gzips build-export responses and rewrites `ETag: "N"` to `W/"N"`, recording `If-None-Match`. In the packed consumer's `site/`, `pnpm build` (static) runs through the proxy without any custom fetch, and a small script importing the packed `@lacecms/astro` `createAstroSiteLoader` in dev mode reads twice (expects a weak validator sent back and a `304`), publishes a title change through the API, and reads again (new content). Rejected: enabling gzip in the generated nginx — that changes shipped deployment behavior.
3. Main stack `down --volumes`, then **builder-diagnostics** with `prepareCompose(..., artifacts)` reusing the existing-site project already created by `feedbackJourneys` (no second `existingJourney`), so it runs on the loaded images.
4. **credentials**: the `credentials` phase body is extracted into a function taking the generator and tarball map, and runs on a fresh packed `--cloudflare` consumer.
5. **Pages tracking**: inside `cloudflareConsumerJourney` (already in `feedbackJourneys`) after the untracked hook ends `accepted`, the Worker restart (already part of the journey) adds `LACE_PAGES_ACCOUNT_ID`, `LACE_PAGES_PROJECT_NAME`, `LACE_PAGES_API_TOKEN` and the development-only `LACE_PAGES_API_BASE_URL` pointing at a local stub. One publication's deployment is reported `deploy/success` → `succeeded` with stage; a second `build/failure` → `failed` with the tracked reason. The scheduled handler is triggered via `/__scheduled`; the stub answers terminally on first read to stay within one tracker interval. The Pages token is added to secret values and scanned.
6. **Guides**: `consumer-guides.mjs` gains a generic section-command reader and drift check. The packed consumer's production guide (`Install and prepare the environment`, `Initialize the CMS`, `Start the full stack`) and Cloudflare guide (`Run the Worker locally`) are compared with reviewed sequences; `productionSmoke` starts the stack with the guide's `pnpm prod:start` and then waits for readiness, and the Cloudflare journey's local command list is the guide's sequence. Exact section names and sequences are taken from the generated guides during implementation; a guide lacking a fenced sequence gets one only through a template change in this session.
   Implementation found that the production guide's "Start the full stack" ran `lace doctor --stage ready` against the running stack. The API opens SQLite in WAL mode and doctor deliberately reports WAL databases as `DATABASE_UNAVAILABLE`, so that documented step always failed. Template `0.17.0` replaces it with `docker compose ps` plus the `/health/ready` check and explains when doctor's ready stage applies; the static guide test forbids the old step and the upgrade entry names the change. Rejected: teaching doctor to read WAL databases — a product change to read-only diagnostics outside this session.
7. **Upgrade**: receipt entry renamed `template-0.4.0-and-0.14.0-upgrade`; the journey also asserts the `0.17.0` plan includes the database instruction.

`feedbackJourneys` keeps serving the workspace `all` phase; the field-trial journeys are added to `all` too where they need no prepared images (the workspace phase builds images itself), so the suites stay the same shape.

### 4. Traceability map and archive

New `docs/archive/step-33/alpha-2-feedback-acceptance.md` uses the onboarding map's table shape (`| § | Feedback | Status | Evidence |`) for §1–§6 plus a row `7` for the general diagnostics requirement (the log's unnumbered section is given number 7 in the map only; the log itself is unchanged except its status header). `tests/alpha-2-feedback-acceptance.test.mjs` reuses the onboarding test's parsers (exported helpers moved into a shared module) and additionally requires every `stage:` to be one emitted by the release phase or its journey modules, and rows §3–§5 to name the owner real-account check. Moved files: `docs/onboarding-feedback{,-acceptance}.md` → `docs/archive/step-32/`; `docs/lace-alpha-2-feedback.md` and `docs/step-33{a,b,c}-*-acceptance.md` → `docs/archive/step-33/`. Relative links inside them and the roadmap/other references are updated; the tests read archived paths.

### 5. Clean preparation, then evidence (as 32B)

Implement and pass focused tests, root gates and a package-only `--preview`; commit; `pnpm release:prepare --output .release-artifacts/alpha-3` from that clean commit (both platforms) and `pnpm release:verify`; `pnpm acceptance:release --artifacts .release-artifacts/alpha-3`; record evidence; reconcile docs; sync specs and archive; commit evidence. If acceptance exposes an artifact defect, fix, commit and reprepare into a new directory (`alpha-3b`), recording the superseded set. Acceptance-tooling-only fixes may land with the evidence commit.

## Risks / Trade-offs

- [Suite runtime grows (≈ +25–40 min: seven Compose builds, builder fault loop, Worker scheduling)] → acceptable for a publication gate; journeys stop at the first failing stage.
- [Playwright drag flakiness in the packed admin] → same selectors and step strategy as the passing e2e; keyboard path independently covers reorder.
- [Tracker interval 30 s] → stub answers terminally on first read and the journey triggers `/__scheduled`, bounded waits name the stage.
- [Second Compose project] → tear down the main stack before builder-diagnostics; `finally` cleans the active one.
- [Docs moved break links] → grep for old paths; tests read new paths; `format:check`.

## Migration Plan

Consumers upgrading from alpha.2: `lace upgrade` to template `0.17.0`, update `.env` image tags and site package versions, back up and run migration `0003` before starting the new engine (Node and D1); rollback by restoring the backup and previous images/packages. Nothing remote is changed by this session.
