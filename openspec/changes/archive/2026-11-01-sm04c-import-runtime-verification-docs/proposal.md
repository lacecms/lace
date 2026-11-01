## Why

`lace import` (SM4B) has been tested only against an in-process Node API with a
stub image inspector, in-memory object storage and no rate limiter. Nobody has
run it against a real Node installation with MinIO or a local Worker with D1
and R2, and users have no guide to the package format or to writing a
converter. This session closes step SM4 so a real site (first: tatianae.com)
can be moved with a documented, verified command.

## Roadmap unit

Session **SM4C** of step SM4 in
[`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md).
Depends on SM4A (`sm04a-import-credentials`) and SM4B (`sm04b-cli-import`),
both archived on 2026-11-01. It completes step SM4.

Owner decisions (2026-11-01):

1. **Two verification tiers.** A full scenario matrix runs in the workspace
   cross-runtime suite against Node (SQLite and MinIO) and the local Worker
   composition (D1 and R2), driving the built CLI as a real process. A short
   smoke of the packed CLI runs in the existing generated-project journeys: the
   Node Compose journey and the Cloudflare consumer journey (`wrangler dev`).
2. **Public guide.** The user guide (format reference, sample package,
   converter guide) is a public documentation page. `docs/content-import.md` is
   the internal maintainer note: journeys, coverage, invariants and a link to
   the public page. This refines the roadmap wording, which put the whole guide
   in `docs/content-import.md`.
3. **Guidance only in the generated project.** The operations guide, README
   and a Template 0.44.0 note mention the command. No new package script: the
   token is set in the shell session and never stored in `.env`.

## What Changes

- **Sample package.** A small committed package for the starter configuration
  (two original images, the `settings` global, the Home page, two linked posts,
  media tags, a focal point, an SEO image and entry links) published with the
  documentation site so readers can download it. It is the single sample that
  the guide shows, the tests validate and both tiers import.
- **Workspace runtime journey** (`tests/content-import.acceptance.mjs`, in the
  cross-runtime suite). On each runtime: an administrator issues import tokens
  through the admin REST API; offline validation; a dry run that writes
  nothing; a first `--publish` run whose media bytes, hashes, tags, metadata,
  links and publication order are checked through the API and the published
  export; reruns with and without the state file that write nothing and request
  no build; an admin edit that becomes a conflict, then `--overwrite`; a token
  without publishing refused for `--publish`; a revoked token refused without
  revealing it. Canonical published results are equal on both runtimes.
- **Packed smoke.** The CI starter phase validates the sample offline with the
  packed CLI. The Node Compose journey and the Cloudflare consumer journey issue
  an import token, import the sample with `--publish` from the generated
  project root, require the posts in the published export, and require a rerun
  to report every item unchanged.
- **Documentation.** New public page *Import content* (token, validate, dry
  run, import, rerun and conflicts, format reference, sample, writing a
  converter, limits); CLI reference and environment table rows for
  `lace import` and `LACE_IMPORT_TOKEN`; internal `docs/content-import.md`;
  topic map row in `docs/documentation-maintenance.md`; CLI README links to the
  guide.
- **Generated project.** Operations guide section *Import content* (Node and
  local Worker origins, token handling, rerun), README command mention,
  Template 0.44.0 configuration note; snapshots refreshed. No migration.
- Defects found by the journeys are fixed in this change and recorded in its
  verification record.

## Scope, Dependencies and Non-goals

Tests, acceptance scripts, documentation, the sample package and template
guidance. Non-goals: new import features or format changes; real Cloudflare
account or VPS runs (release gate); importing against a remote Worker; a
converter for any specific CMS (Framer included); `lace export`; making the
cross-runtime suite part of CI; a package script for import; REST, OpenAPI,
database or migration changes.

Architecture: no invariant changes. §12 already records import as an admin
REST client (ADR 0017); §14 covers the import token (ADR 0016).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cross-runtime-product-verification`: the local verification includes a
  content import journey run through the CLI process against both runtimes.
- `generated-project-acceptance`: the starter phase validates the sample
  package with the packed CLI; the Node and Cloudflare consumer journeys import
  it and require an unchanged rerun.
- `public-documentation`: maintained guidance includes content import, backed
  by a downloadable sample package that tests keep valid.
- `generated-project-onboarding`: the operations guide documents content
  import for Node and the local Worker.

## Impact

- Tests and scripts: `tests/content-import.acceptance.mjs`,
  `tests/support/cross-runtime-fixture.mjs` (configuration option),
  `vitest.cross-runtime.config.mjs`, `scripts/generated-project-acceptance.mjs`,
  `scripts/cloudflare-consumer-acceptance.mjs`, a shared import-smoke helper,
  a sample-package test in the root suite.
- Docs: `apps/docs` new page and public sample files, CLI reference;
  `docs/content-import.md`, `docs/documentation-maintenance.md`,
  `packages/cli/README.md`, roadmap progress log and SM4 status.
- Template: `packages/create-lace/templates/docs/lace-operations.md`,
  `README.md`, `.lace/upgrade-instructions.json`, `TEMPLATE_VERSION` 0.44.0,
  generated-project snapshot fixtures.
- CLI or server code only if a journey exposes a defect.
