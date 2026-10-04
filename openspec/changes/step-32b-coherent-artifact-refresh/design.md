## Context

See `proposal.md`. Observed state on 2026-10-04 (branch `feat/step-32-feedback-regressions`, after 32A):

- `release/alpha.json` records `0.1.0-alpha.1` / template `0.4.0`, while `packages/create-lace/src/inventory.ts` is at template `0.13.0`; `pnpm release:check` fails with `Template identity mismatch`.
- All fifteen public manifests, generated root/site dependencies, `.env.example` image defaults, `apps/api` and `apps/builder` `ARG LACE_VERSION` defaults, the existing-site guide (`pnpm create lace@…`, `pnpm add @lacecms/…@…`), the operations guide and the existing-Astro test fixture name `0.1.0-alpha.1`.
- npm lists `0.1.0-alpha.1` for the twelve first-alpha scoped packages and `create-lace` (`next` and `latest` both at it); `@lacecms/astro` and `@lacecms/render` return 404. `docker manifest inspect ghcr.io/lacecms/{api,builder}:0.1.0-alpha.2` reports `manifest unknown`.
- `pnpm acceptance:release --artifacts` (25C) already runs the README-driven Node journey (env prepare, doctor, migrate, browser setup and tour) plus security, recovery, persistence and shipping scans from the inventory. The 32A suite (`phase all`) additionally runs Pages preview, publication visibility, existing-Astro, Cloudflare consumer and template upgrade, but with the workspace generator (`packages/create-lace/dist/bin.js`), workspace-packed tarballs, source-built images and workspace manifests for override computation. `build-site-acceptance.mjs` and `publication-visibility-acceptance.mjs` hardcode `lacecms-sdk-0.1.0-alpha.1.tgz`.

## Goals / Non-Goals

**Goals:** one reviewed revision defines a new, unused alpha; delivered artifacts, templates and guides agree; the full feedback suite passes against exactly those prepared artifacts; documentation states what is done and what remains.

**Non-Goals:** publishing or pushing, changing `0.1.0-alpha.1` artifacts or the `0.4.0` fixtures, real deployments, new product behavior, schema migrations, Step 33 work.

## Decisions

### 1. Version selection: `0.1.0-alpha.2`, template `0.14.0`

Increment the prerelease number; nothing in the changes since alpha.1 is a deliberate SemVer-breaking public API commitment worth a minor bump during the experimental `0.1.0` line, and every artifact (including the first-published `astro`/`render`) shares one version. The template moves to `0.14.0` because managed bytes change (root `package.json` dependency versions, `.env.example` image defaults, guides). Registry evidence above is recorded in the verification note with its date; the owner rechecks before publication.

### 2. Release definition records published versions

Add `publishedVersions: ["0.1.0-alpha.1"]` to `release/alpha.json`. The validator rejects a candidate version present in that list, and rejects a malformed list. Keeping the record in the definition (not a network lookup) keeps `release:check`/`plan` offline and deterministic; the live registry recheck stays in the owner guide. After the owner publishes alpha.2, the next refresh appends it.

### 3. Validate delivered coordinates, do not rewrite them

`readReleaseModel` additionally reads both Dockerfiles and the delivered guide texts (`templates/README.md`, `templates/docs/*.md`, `packages/create-lace/README.md`). Validation requires `ARG LACE_VERSION=<version>` in both Dockerfiles and that every versioned coordinate in those guides — `create lace@X`, `@lacecms/<name>@X`, `create-lace@X`, `ghcr.io/lacecms/<image>:X` — equals the candidate. The registry items' Lace package `requires` (exact ranges checked by `lace add block` with semver) are coordinates too: implementation found they still required `0.1.0-alpha.1`, so an `0.1.0-alpha.2` site would be reported as missing packages; validation therefore also requires every `@lacecms/*` range in `registry/**/item.json` to equal the candidate. Historical prose such as "published `0.1.0-alpha.1` artifacts predate …" is not a coordinate and remains allowed. Preparation still never rewrites files.

### 4. Template `0.14.0` and upgrade instructions

Bump `TEMPLATE_VERSION`, all template dependencies and image defaults, and replace the step-numbered artifact prerequisites in managed guides and the user-owned README template ("packages built from Step 27B or later …") with "`0.1.0-alpha.2` or a later compatible release", while noting what `0.1.0-alpha.1` lacks. Upgrade instructions gain a `0.14.0` entry: managed root `package.json`, `.env.example` and guides are replaced; the operator updates `LACE_API_IMAGE`/`LACE_BUILDER_IMAGE` in `.env` and, for starter projects, the user-owned `site/package.json` Lace dependencies (`pnpm --dir site add …@0.1.0-alpha.2`), then `pnpm install`; existing-site operators update their own site the same way. Earlier entries are kept so an upgrade from `0.4.0` still lists accumulated steps. Snapshots are regenerated with `acceptance:generated snapshots --update` and reviewed.

### 5. Exact-artifact acceptance runs the whole suite

Extend the `release` phase rather than adding a new command, so the single owner-run acceptance is the publication gate. Changes in `scripts/generated-project-acceptance.mjs`:

- module-level `generatorBin` (workspace build by default; the extracted `create-lace` archive in release mode) used by `verifySnapshots`, `cloudflarePagesSmoke`, and passed as `generator` to the existing-site and Cloudflare consumer journeys and template upgrade;
- a `manifestFor(name)` lookup used by `installPackedConsumer` for override computation: workspace manifests by default, extracted archive manifests in release mode;
- after the existing 25C journeys, run snapshots, Pages smoke, publication visibility, existing-Astro, Cloudflare consumer, template upgrade and the captured-diagnostics secret scan, then print the receipt with the list of journeys;
- `sdkTarball` derived from the tarball map (`basename(tarballs.get("@lacecms/sdk"))`) and passed through `context` to the build-site and visibility helpers, replacing hardcoded names.

The existing-site and Cloudflare journeys keep reading test fixtures and Playwright from the workspace (test tooling, not shipped artifacts); generation and runtime packages come only from the inventory. Their bundle/lockfile checks already reject workspace references.

### 6. Prepare from a clean commit, then record evidence

Release-eligible preparation requires a clean committed revision. Sequence: implement and pass focused tests and root gates on the working tree (with a package-only `--preview` preparation as a cheap smoke); commit the implementation; run `pnpm release:prepare --output .release-artifacts/alpha-2` from that clean commit (both platforms); `pnpm release:verify`; `pnpm acceptance:release --artifacts .release-artifacts/alpha-2`; then write `docs/archive/step-32/step-32b-verification.md` and `step-32b-artifacts.json` from the inventory and receipt, reconcile docs, sync specs and archive, and commit the evidence. The evidence commit changes only documentation and OpenSpec files, so the inventory's source revision is the reviewed artifact source; this is stated in the note. If the owner later wants artifacts from a newer revision, they reprepare and rerun acceptance.

### 6a. Stale release tooling found during implementation

The package preview showed that release preparation had not run since Step 26B: the packed migration consumer smoke (`scripts/migration-consumer-smoke.mjs`) still expected the pre-26B generic CLI failure message. It now expects the actionable `db migrate` diagnostic (operation, reason, next action, no path). Any further stale preparation check found by the clean run is fixed in the implementation commit before evidence is recorded; product behavior is not changed to satisfy tooling.

### 7. Documentation reconciliation

- `docs/alpha-release.md`: generalize to the current candidate (`0.1.0-alpha.2`, template `0.14.0`), fifteen packages (`astro`/`render` first published with alpha.2), output directory `alpha-2`, the extended acceptance, and the published-version rule.
- Architecture §25 and roadmap 32B/step summary: candidate coordinates and completion evidence; stable status stays with Step 33.
- `docs/compatibility.md`: add the alpha line compatibility (published alpha.1 vs candidate alpha.2, template upgrade path, platforms).
- Root README: artifact pointer where it references releases/steps if stale.
- `docs/onboarding-feedback.md`: update each item's status line to the delivered state and the artifact version that carries it; `docs/onboarding-feedback-acceptance.md`: note the exact-artifact run.
- Remaining checks: real VPS and Cloudflare deployments (33C), Step 33A/B suites, registry publication and post-publication anonymous pulls.

## Risks / Trade-offs

- [Long preparation/acceptance (both platforms, emulated amd64)] → run in the background; failure on a platform fails preparation rather than narrowing the claim.
- [Upgrade journey compares against the packed generator] → the packed generator equals the reviewed source, so the 0.4.0 → 0.14.0 assertions are unchanged.
- [Registry state changes before publication] → evidence is dated; the guide's recheck and immutable-version recovery remain mandatory.
- [Two commits] → necessary because a clean revision must exist before eligible preparation; the evidence commit contains no shipped source.

## Migration Plan

No database migration. Existing projects upgrade 0.13.0 → 0.14.0 (or from earlier versions) with `lace upgrade`, plus the manual `.env`/site dependency steps. Rollback for an unpublished candidate is to discard the prepared directory; nothing remote is mutated.
