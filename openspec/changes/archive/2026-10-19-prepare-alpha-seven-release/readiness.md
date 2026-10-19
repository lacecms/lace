# Alpha.7 preparation evidence

Alpha.7 is locally accepted for a separate publication decision. Source gates,
complete two-platform preparation, independent verification and all exact-artifact
consumer journeys passed. No remote publication or deployment was performed.
The durable acceptance receipt was written only after temporary-environment cleanup.

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
Linux amd64 and arm64. Execution smokes were pending at this initial check;
final passing results are recorded below. There were no changes under
`packages/db` between tag `v0.1.0-alpha.6` and the initial main revision
`715820b`; comparison of the final shipping source with alpha.6 changes only
`packages/db/package.json`, confirming no new migration files.

## Planning correction

The owner approved the coordinate requirement correction: the delta now replaces
the former alpha.6 current-candidate requirement with alpha.7/template 0.35.0,
preserving confirmed publication history and all validation scenarios.

## Baseline checks

Release model, lifecycle and image tooling: 3 files / 39 tests passed before
implementation. Full source and exact-artifact gates were pending at that
baseline; final passing results are recorded below.

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
it does not substitute for the separately recorded immutable alpha.7 acceptance.

Published alpha.6 npm generator bytes produced immutable template 0.30.0 fixtures
with tarball integrity and SHA-256 provenance. Both Node/Cloudflare upgrade
journeys, existing 0.4.0/0.14.0 baselines, conflicts, user-source preservation and
repeat-plan idempotence passed against the source-built CLI/generator. Saved
artifact execution is recorded below.

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
empty before this preflight record. The preparation inventory records final source commit
`665bd3499b49180a0873881bd9a93bb2722f556a`, including this preflight record.
The artifacts are not a preview.

## Saved artifact identity

- Directory: `.release-artifacts/alpha-7` (complete, publication eligible, non-preview).
- Shipping source: `665bd3499b49180a0873881bd9a93bb2722f556a`.
- Source fingerprint: `fdb6c82cceec4480ac2dd8c317924f483ef7a329b923f8f21f15961e0624832f`.
- Inventory SHA-256: `0de1f9dbed0c831a79774b943165a6441d331af712532542d021a37bc380d556`.
- Corrected acceptance harness: `a503960f75d187151cb02fd9de70ccb254387a1c`.
- All fifteen package archive paths and SHA-256 values are recorded in the immutable inventory.
- Independent `pnpm release:verify --output .release-artifacts/alpha-7` passed.

| Image | Platform | Local immutable image ID |
| --- | --- | --- |
| api | linux/amd64 | `sha256:823736efeac6b9c8cfe73305cafc9a3657afeb6f379f1e84004b0287849e76f1` |
| builder | linux/amd64 | `sha256:b112eafd85c8b69719732c9fcaddfd8c73cb1207936fc905286e978821bd14d6` |
| api | linux/arm64 | `sha256:d6eb79273c834e89289b436492266674f12ee817ccf1b4f53e5f3f88556aabdf` |
| builder | linux/arm64 | `sha256:9d994924bde3e279f16c7223f33043242daf3cf2e9795386868b8cca21b1fbec` |

Both-platform image smokes passed; these local image identifiers are not registry
manifest digests. No registry upload has been performed. The source-to-harness
commit diff changes only the call connecting the existing starter image journey
to full saved-inventory acceptance. Package archives, images and inventory remain
unchanged. The initial acceptance attempt is superseded: the final harness-identity
guard refused success after the harness changed, and no success receipt was
written. Its diagnostics are retained as `acceptance-superseded-harness.log`.

The final run passed against the same saved inventory with the corrected committed
harness, including WebP/GIF/placeholder/lightbox/link and warm-cache checks on
installed archive bytes before the normal Compose journey. All journeys and
temporary-environment cleanup completed successfully.

## Final exact-artifact acceptance — 2026-10-19

- Receipt: `.release-artifacts/alpha-7/acceptance.json` (portable public JSON).
- Recorded at `2026-10-19T17:35:54.615Z` (19:35 Europe/Rome).
- Receipt SHA-256: `7a58d1065bcb7ef6119fa82805163211f6d1869bc480e59ebcc32a9fb755547f`.
- Inventory SHA-256: `0de1f9dbed0c831a79774b943165a6441d331af712532542d021a37bc380d556`.
- Harness revision: `a503960f75d187151cb02fd9de70ccb254387a1c`.
- Result: **passed**, 20 journey groups, cleanup successful.
- Full consumer platform: `linux/arm64`. Both `linux/amd64` and
  `linux/arm64` API/builder preparation smokes passed; the single consumer run
  does not claim two-platform end-to-end coverage.

Commands that passed:

```sh
pnpm release:prepare --output .release-artifacts/alpha-7
pnpm release:verify --output .release-artifacts/alpha-7
pnpm acceptance:release --artifacts .release-artifacts/alpha-7
```

The final run covers saved-package WebP variants, three distinct GIF frames,
placeholder eligibility, image/gallery links versus lightbox and stable warm-cache
HTML. Node and local Worker/R2 cover unchanged GIF originals and ETag/304 behavior;
Node additionally covers a valid image above 1 MiB through the actual saved-image
VPS proxy and successful hashed-asset/HTML/missing-asset cache rules.

The existing browser/editor, export, authorization, draft isolation, Compose
failure/retry/persistence, existing-site, credential, restore/rotation and historic
upgrade journeys all passed, including the new published-alpha.6/template-0.30.0
baseline. Saved Node/Worker consumers also retain alpha.6 pagination, tolerant
contract safety, stale-cursor and guarded draft-detachment coverage.

Cloudflare checks use local Worker/D1/R2 simulation and a controlled Pages API;
Pages preview/workflow/header verification is not a hosted Pages deployment.
Concurrency/fault cases supplied by source tests remain source evidence, not
additional saved-platform runs.

Final diagnostics: `.release-artifacts/alpha-7-evidence/acceptance-final.log`.
Post-harness-correction `pnpm test`, typecheck, lint, format and strict change
validation passed again; root tests remain 31 files / 193 passing tests.
The original inventory and all saved archive/image checksums remain unchanged.

## Remaining owner prerequisites

Authenticate and recheck npm/GHCR publishing rights and remote availability before
any publication. Publish only the reviewed saved bytes, use npm `next`, and verify
the complete public set independently. Make shipping revision
`665bd3499b49180a0873881bd9a93bb2722f556a` reachable in the source repository before
GitHub finalization; the local source branch has not been pushed by this work.
Do not tag the later handoff-only documentation commit as the artifact source.

Actual VPS/Cloudflare deployment, restoration and rotation still require separate
owner evidence. Earlier real-application confirmations are not alpha.7 deployment
verification. No npm publish, GHCR push, GitHub release creation, remote deployment,
release cleanup or OpenSpec archive was performed.
