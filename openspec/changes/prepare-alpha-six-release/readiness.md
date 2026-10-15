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
