# Step 34A verification

## Contract-freeze decision

Retain the current v1 public entry DTO for compatibility. Its `draft` mirrors the
published snapshot; successful public entries contain `published` even though
the shared content-entry schema makes it optional. A later editorial draft must
never appear in public reads or exports. `createPublishedSiteLoader` supplies the
immutable published-only site view without draft properties or editorial metadata.
This agrees with `rest-contracts`, `public-sdk` and `published-site-loader`.
Contract, SDK and render public types are unchanged; no database or consumer
migration is required. A dedicated public wire schema requires a separately
reviewed contract migration.

## Execution

Implementation and local verification are in progress on branch
`codex/step-34-local-mvp-verification`. No completed Step 34A result is claimed.

Verified before final acceptance:

- Shared repository contract suites: 258 tests across eight files, no skipped cases.
- Both real runtime API and Astro diagnostic journeys passed using the common
  fixture and expected manifest; Node uses SQLite/MinIO, Worker uses local D1/R2.
- SDK/render/site suites: 299 tests across fourteen files.
- Release/generator/CLI/runner focused suites: 319 tests across nineteen files.
- All six generated-project snapshots regenerated twice with byte-stable output.
- Root typecheck and Oxlint passed. Final formatting and strict validation will
  be repeated after implementation.

The opened Builds failure explanation exposed a 3.98:1 contrast failure. The
approved foreground-token correction passes the source browser axe check and
is included in exact-candidate diagnostics. Alpha.3's npm publication receipt
is preserved. Registry metadata checked on 2026-10-07 returned 404 for all fifteen
alpha.4 npm packages and both versioned image manifests; this is availability
evidence, not a reservation. The selected replacement is `0.1.0-alpha.4` with
ownership template `0.18.0`; preparation and acceptance are still pending.

The combined API/Astro/browser suite passed both Node and Worker compositions
(47.72 seconds). Browser coverage includes editing, keyboard block ordering,
media reuse, publication followed by controlled terminal build failure,
editor/viewer permissions, stale-draft recovery and backend-invalidated session
recovery. Save, Publish and Reload draft now feed the existing session recovery
hook; query cache clearing waits until sign-in navigation completes so the dirty
editor's leave-or-stay dialog remains mounted. Focused editor/router/Builds
regressions passed: 65 tests across three files, including all mutation errors
and retaining local authoring after Stay.

## Reproduction

Use Node 24.12.0, pnpm 12.3.4, a running Docker daemon, local MinIO image access,
and Playwright Chromium installed for `apps/admin`. No account or registry
publishing credentials are required. From the engine checkout run:

```sh
pnpm verify:34a --artifacts .release-artifacts/alpha-4 --baseline docs/archive/step-34/step-34a-artifacts.json
```

The explicit artifact directory must match the reviewed inventory. The command
runs prerequisite and checksum checks, workspace builds, repository contracts,
real-backend API/browser/Astro scenarios, SDK/render/site tests, then the full
exact-candidate release acceptance. It writes phase and test JSON under ignored
`.lace-acceptance/step-34a-*`, prints the report path and fails on required skipped
or failed tests. Controlled orchestration tests cover a failed intermediate
phase, missing prerequisites and skipped/zero/todo test reports. Fixtures own
temporary SQLite/D1/R2 state, a uniquely named MinIO container and ephemeral
ports; cleanup runs on setup error, test failure, success and interruption.

Candidate preparation, aggregate acceptance, archive and final evidence are
pending. Sessions 34B/34C and owner real-deployment acceptance remain open.
