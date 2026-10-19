# Alpha.7 preparation evidence

Preparation is in progress. No alpha.7 artifact inventory or acceptance receipt
exists yet; this record does not establish publication readiness.

## Registry checks — 2026-10-19

Anonymous reads at 16:55 UTC (18:55 Europe/Rome) returned HTTP 200 for all fifteen
`0.1.0-alpha.6` npm version endpoints and both GHCR manifests. Each image index
contains Linux amd64 and arm64. GitHub also lists prerelease
`v0.1.0-alpha.6`, published 2026-10-16 at 11:12:01 UTC.

All fifteen alpha.7 npm version endpoints and both GHCR manifest endpoints
returned HTTP 404. These are availability checks, not reservations or proof of
publishing rights. No remote mutation was performed.

Raw public results: `.release-artifacts/alpha-7-evidence/registry.json`.
Alpha.6 public image index digests:

- API: `sha256:90728f18009e5a6f4afbd28fac4b9888f514a0661b28432a842ee5276ed85093`
- Builder: `sha256:547169a179b1f391ed3cd0fa7f95d4c70dca81d5b65f61dfad586094e9bed9b5`

## Initial local prerequisites

Node is `24.12.0`, pnpm is `12.3.4`, Docker server is `29.8.2`; buildx advertises
Linux amd64 and arm64. Execution smokes remain pending. There are no changes under
`packages/db` between tag `v0.1.0-alpha.6` and the initial main revision
`715820b`; migration inventory will be checked again before source freeze.

## Planning correction

The owner approved the coordinate requirement correction: the delta now replaces
the former alpha.6 current-candidate requirement with alpha.7/template 0.35.0,
preserving confirmed publication history and all validation scenarios.

## Baseline checks

Release model, lifecycle and image tooling: 3 files / 39 tests passed before
implementation. Full source and exact-artifact gates remain pending.

## Documentation and audit

Public English/latest targets alpha.7. Docs validation/build checked 19 pages,
local links/fragments/resources and OpenAPI; the additional locale/fixed-version
fixture passed. A real browser confirmed the root redirect, alpha.7 identity,
Astro deep navigation, image instructions and Pagefind results for lightbox.
Browser evidence is retained under `.release-artifacts/alpha-7-evidence/browser-docs`.

The owner approved the targeted `postcss-selector-parser: 7.1.6` override for
GHSA-rj75-hqrm-r3gf. The final audit passes with 967 locked license records and
the same two existing tooling advisory dispositions (esbuild and braces).
The type-fest SPDX expression `(MIT OR CC0-1.0)` is recognized explicitly; both
alternatives were already allowed. No new advisory exemption was added.
Raw initial/fixed/final reports remain in `.release-artifacts/alpha-7-evidence`.

## Consumer source verification

The starter packed from current source passes optimized WebP, three distinct GIF
frames, opaque/transparent placeholder behavior, image/gallery link precedence,
lightbox and stable warm-cache HTML checks. A constant source URL is used across
builds so the same cache keys are exercised. This is source preparation coverage;
it is not yet acceptance of the future immutable alpha.7 inventory.

Published alpha.6 npm generator bytes produced immutable template 0.30.0 fixtures
with tarball integrity and SHA-256 provenance. Both Node/Cloudflare upgrade
journeys, existing 0.4.0/0.14.0 baselines, conflicts, user-source preservation and
repeat-plan idempotence passed against the source-built CLI/generator. Saved
artifact execution remains pending.

## Source gates before freeze

- `pnpm test`: all 42 workspace tasks successful; 31 root test files / 193 tests passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: passed.
- `pnpm openapi:check`, `pnpm spec:validate` (77 items), strict validation of this change: passed.
- `pnpm docs:check`, docs build and locale/version fixture after the security fix: passed.
- Focused release/harness/audit tests and source-built CLI upgrades: passed after updating candidate-version assertions.
- Source-packed starter and local Cloudflare consumer journeys: passed, including added image cases.
- Final dependency/license audit: passed; 967 records and two existing advisory dispositions.
- Frozen dependency installation on pinned Node/pnpm: passed.
- `docker run --rm --platform linux/amd64` and `linux/arm64` with Node 24.12.0: passed (x64/arm64).

Source/test diagnostics are local under `.release-artifacts/alpha-7-evidence/logs`.
Initial failing attempts remain there for traceability; only final passing results
establish these gates. Workspace tests emit existing React/SQLite development
warnings; no test exceptions or production behavior changes were introduced.

## Clean-source preflight

Reviewed shipping changes were committed as
`3238c65c70e4084bb7c90ef35b6b86b35b275637` on
`codex/prepare-alpha-seven-release`. Frozen install passed and Git status was
empty before this preflight record. The preparation inventory will record the
final source commit including this record; no preview will establish eligibility.
