# Alpha.6 preparation evidence

Baseline: 2026-10-16 Europe/Rome, source `99a2f99` on main. Alpha.5 release
validation passed. Node 24.12.0, pnpm 12.3.4 and Docker 29.8.2 are available.
No migration files changed relative to alpha.5 artifact source `1ab14e2`.
Source/artifact acceptance and registry checks are pending. Publication and real
VPS/Cloudflare deployment are separate owner actions.

## Source progress

- Release coordinate check and plan passed for alpha.6/template 0.30.0.
- Generator: 64 tests passed; focused CLI upgrade/block commands: 54 passed.
- All six snapshot variants match two byte-stable regenerations.
- Dependency/license policy passed: 851 locked license records, two existing
  explicitly dispositioned tooling advisories (braces/esbuild).
- Typecheck, lint, formatting, OpenAPI consistency and all strict OpenSpec
  validation passed. Complete source tests and artifact checks remain pending.

## Read-only registry evidence — 2026-10-16 00:32 Europe/Rome

All fifteen alpha.5 npm versions returned 200, as did API/builder GHCR manifests.
Alpha.5 is recorded as published and immutable. All alpha.6 coordinates returned
404 (fifteen npm versions/two images). This does not reserve names or establish
rights. npm whoami returned E401; authenticated npm/GHCR rights remain a later
publication prerequisite. Redacted results: `.release-artifacts/alpha-6-evidence/registry.json`.
No registry mutations occurred.

Focused source regression passed: 49 release-tool tests and 25/25 dependency-ordered
workspace tasks for contracts, SDK, server and both runtimes, including SQLite/D1
concurrency and partial media-detachment coverage. New exact-consumer probes
import SDK bytes only from the generated consumer installation and use real
HTTP against the selected image/local Worker. Both release journeys invoke
them; execution against the saved alpha.6 set remains the artifact gate.

## Source acceptance completed

- Full pnpm test: 40/40 workspace tasks plus 27 root files / 156 tests passed.
- Root typecheck, lint, formatting, OpenAPI check and 74 strict OpenSpec items passed.
- Published-version regression now checks alpha.5 is immutable too.
- Frozen-lockfile install passed without a lockfile change (workspace versions
  are not encoded as registry dependencies in the lockfile).
- Audit: high 1, moderate 1, critical 0; existing braces/esbuild dispositions only.
- Read-only availability check passed; npm rights unavailable (E401), GHCR write
  rights not established by public pull access. No credentials were changed.

Shipping source has been reviewed for coherent current coordinates, retained
historical upgrade instructions/receipts, private workspaces and consumer-only
SDK imports in the new artifact probes. Clean-source preparation follows.

## Frozen artifact source

Preparation uses clean source `782df0947c7497d8ce7f0e4d5a4ff4bb7afae563`,
fingerprint `f949d797c2199a5a660be9938021ac6e4210707f548b5d143edc45a2b9aba276`,
preview false. Exclusive output: `.release-artifacts/alpha-6`. Subsequent
task/evidence updates do not change this shipping source identity.

## Preparation and independent verification passed

Inventory: `.release-artifacts/alpha-6/inventory.json`, SHA-256
`f4dc0e5b536ae04a43d37d7de4e9c0069a7758945a8005e1c3782cd44a73ca0e`.
Complete and publicationEligible are both true; fifteen package archives and
four API/builder platform images were saved, each with passing smoke checks.
Independent release:verify recomputed saved checksums successfully. This flag
establishes source/artifact integrity, not consumer or real-deployment acceptance.
Exact-artifact consumer acceptance is running on linux/arm64.

## Final local acceptance — 2026-10-16 Europe/Rome

**Prepared and locally accepted; publication and real deployment approval remain separate.**

- Candidate `0.1.0-alpha.6` / next, ownership template `0.30.0`.
- Clean artifact source `782df0947c7497d8ce7f0e4d5a4ff4bb7afae563`; fingerprint
  `f949d797c2199a5a660be9938021ac6e4210707f548b5d143edc45a2b9aba276`.
- Inventory `.release-artifacts/alpha-6/inventory.json`, SHA-256
  `f4dc0e5b536ae04a43d37d7de4e9c0069a7758945a8005e1c3782cd44a73ca0e`.
- Fifteen package tarballs, four API/builder platform images, passing smoke on
  linux/amd64 and linux/arm64; independent saved-checksum verification passed.
- Exact-artifact acceptance passed 16 journeys on linux/arm64, including
  Node/browser, Compose recovery/persistence, existing Astro, Cloudflare/local
  Worker and Pages tracking, historical template upgrades, block order, weak
  ETags, builder diagnostics, credentials and packed restore/rotation.
- New pagination, tolerant safety, stale-cursor and draft-media detachment probes
  passed against both the actual Node image and local Cloudflare Worker.
  Concurrency/partial-progress fault injection remains explicitly source-tested.
- Harness revision `122c047ba38b487b805d8540f33373f255db19cc`. After packaging,
  only the test helper changed: resolve SDK from the generated site's workspace
  and correct a 27-character fixture key to a valid 26-character block key.
  No shipping package/image bytes were changed or rebuilt.
- Portable receipt: [alpha-6-acceptance.json](../../../docs/alpha-6-acceptance.json).
  Logs, audit, registry evidence and interrupted/failed harness attempts are
  retained under `.release-artifacts/alpha-6-evidence/`.

The initial run was stopped after discovering the SDK path error; its temporary
Compose environment was explicitly removed. The next run correctly rejected an
invalid test block key; diagnostics were retained and the fixture was corrected.
The final full run exited successfully and cleaned up its temporary services.
These were test-harness corrections, not product fixes or exceptions to acceptance.

Both platforms have image smoke coverage; full consumer journeys ran only on
linux/arm64. Local image IDs are not remote manifest digests. npm authentication
returned E401, and public GHCR pull access does not prove write rights. The owner
must authenticate/check publication rights and separately record alpha.6 real
VPS/Cloudflare upgrade, restore, deployment and recovery evidence. Historical
confirmations were not relabeled. No npm publish, GHCR push, remote release
creation or real deployment was performed.

Final receipt/inventory digest and documentation links verified. Strict change
validation and root formatting passed; OpenSpec reports all 11/11 tasks done.
The final independent release:verify still reports complete/publicationEligible
with the original artifact source and fingerprint. No archive/synchronization
was performed without an explicit request.
