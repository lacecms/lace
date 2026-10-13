# Alpha.5 preparation baseline

Audit: 2026-10-14 Europe/Rome, source `5522c44562b1383090571451dc4fe227b044cac7` (`doc: archive roadmaps`). These are baseline findings, not alpha.5 acceptance receipts. The owner selected `0.1.0-alpha.5` / `next`, superseding the earlier beta selection. No production source changes, publication or deployment were made by this audit.

## Blocking findings

| Check | Observed result | Required correction |
| --- | --- | --- |
| `pnpm release:check` / `pnpm release:plan` | Refuse already-published alpha.4 | Select unpublished alpha.5 coherently; preserve history |
| Template identity | Release definition says 0.20.0; generator is 0.28.0 | Advance managed template changes consistently to 0.29.0 |
| `pnpm test` | Failed: ten CLI upgrade tests expect 0.27.0 instead of current 0.28.0; Turbo reports 38 successful / 40 tasks | Repair current-target assertions and rerun the complete suite |
| `pnpm openapi:check` | Generated output differs by layout metadata | Regenerate and verify checked-in OpenAPI |
| Candidate artifact acceptance | No fresh alpha.5 inventory or exact-artifact acceptance | Prepare clean-source packages/images and verify exact saved artifacts |

The OpenAPI check writes generated output; its audit-only diff was saved temporarily and the tracked file restored. Existing `.release-artifacts/alpha-4` describes source `041f5fe8c49ea0b81bb63303c2fe40fedc9731d5` and template 0.18.0 and cannot establish readiness of CE1–CE9.

## Passing baseline checks

- Root tests run separately after the workspace suite failed: 27 files / 156 tests passed.
- Root typecheck, lint and formatting passed.
- Accepted OpenSpec strict validation: 72 specifications passed.
- Fresh dependency/license policy check passed: 851 locked license records, two explicitly dispositioned tooling advisories (one high, one moderate; braces and esbuild). This is not zero vulnerabilities. Existing restrictions apply; no new risk acceptance was granted.
- Docker/buildx is available and supports both target platforms; candidate images have not been built.
- Read-only npm metadata check at 2026-10-14 00:49 Europe/Rome (2026-10-13 22:49 UTC): all fifteen alpha.5 package version endpoints returned HTTP 404. Availability is not a reservation or proof of publishing rights. GHCR availability/rights still require checking.

## Remaining evidence

Source checks must be rerun after fixes. Record a reviewed clean source revision, a complete fifteen-package/two-image/two-platform inventory, independent artifact verification and exact-artifact consumer acceptance. Retain alpha.4 owner confirmations as historical evidence. Required alpha.5 VPS/Cloudflare upgrade, restore and other owner-operated checks remain separate and must not be silently marked complete. Public publication is a later explicit action using verified saved artifacts.

## Apply progress — 2026-10-14

Source blockers are being corrected for alpha.5/next, template 0.29.0.
Read-only registry checks at 00:59 Europe/Rome returned HTTP 404 for all fifteen
npm alpha.5 versions and both GHCR alpha.5 manifests. Local npm `whoami` and
access inspection returned E401: publishing permissions could not be verified.
This does not block credential-free local preparation; authenticated rights
checks remain an explicit owner prerequisite for publication. No credentials
were changed and no registry mutation was attempted.

### Source acceptance completed

- `pnpm release:check` and `pnpm release:plan`: pass for alpha.5/next.
- Focused CLI upgrade: 33 tests; generator: 64 tests; release tooling: 49 tests, all passed.
- `pnpm test`: all workspace tasks and 27 root files / 156 root tests passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm spec:validate`: passed (72 accepted specs plus this change).
- All six generator snapshot variants match repeated byte-stable generation; no file-tree changes.
- Fresh audit policy: passed, 851 locked license records; high 1, moderate 1, critical 0. Existing braces/esbuild dispositions remain unchanged.

A clean source commit, immutable package/image preparation and exact-artifact
consumer acceptance are the next gates. No publication or remote deployment
has occurred.

## Final preparation result — 2026-10-14

**Prepared and locally accepted; publication and real deployment approval remain separate.**

- Candidate: `0.1.0-alpha.5` / `next`, ownership template `0.29.0`.
- Artifact source: `1ab14e2b17c5ca32c7e481032c95360b7437c993` (clean, preview false).
- Source fingerprint: `3581e3ad47a16e1d77e2330cef22ccd13d607a4d50cc6544728c3e22f6d42206`.
- Inventory: `.release-artifacts/alpha-5/inventory.json`; SHA-256 `0698761857cf33fd1b149f3f3864cdd856b78f3e5ea7e643c0a57d46f8edf1b6`.
- Complete inventory: fifteen tarballs and API/builder images for both linux/amd64 and linux/arm64; every platform smoke passed.
- Independent `release:verify`: passed; saved archives were never rebuilt or replaced.
- `acceptance:release`: passed all fifteen journeys, including Node/browser, publication visibility, existing Astro, Cloudflare/Pages tracking, legacy template upgrades, block order, weak ETags, builder diagnostics, credentials and packed restore/rotation.
- Full consumer journey platform: `linux/arm64`. Both image platforms have preparation smoke coverage; this does not claim two-platform end-to-end coverage.
- Acceptance harness revision: `2ca8fbd0e0e0f75a6f14e65601435d5c8a9f852a`. After packaging, only the harness changed: Site/globals expectations, Gallery/Navigation test data, a CE9 dialog/Slug locator race, and a hook-attempt count assumption replaced with one durable build and same-build recovery assertions. No shipping package/image bytes changed.
- Final source regression: 40/40 workspace tasks passed (cached repetition of the successful complete run), plus 27 root files / 156 tests. Typecheck, lint, formatting, OpenAPI and 73 OpenSpec items passed.
- Portable receipt: [alpha-5-acceptance.json](../../../docs/alpha-5-acceptance.json). Full logs, audit/license inventory, registry checks and prior failed harness attempts are retained under `.release-artifacts/alpha-5/evidence/`.

The npm session returned E401 during read-only rights checks. Authenticated npm
and GHCR publishing rights must be checked by the owner before any live action.
Real alpha.5 VPS/Cloudflare delta checks remain pending; alpha.4 confirmations
are historical and were not relabeled. No npm publish, GHCR push, remote release
creation or real deployment was performed. This completes preparation and the
local acceptance handoff, not the separate owner release gate.
