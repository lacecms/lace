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
