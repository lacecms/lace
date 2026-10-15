## 1. Release source coherence and upgrade guidance

- [x] 1.1 Update architecture release references and alpha release/compatibility/real-application guidance for alpha.6; add alpha.6 notes covering formatVersion, pagination, coordinated upgrades, media detachment and backup/rollback boundaries. Verify notes against accepted contracts and confirm the migration inventory relative to alpha.5 without relabeling historical evidence.
- [x] 1.2 Select `0.1.0-alpha.6`/`next` in release metadata, fifteen public manifests, runtime versions, generated dependencies, image defaults, Dockerfiles, registry requirements and delivered guides; refresh the lockfile and verify `pnpm release:check` and `pnpm release:plan`, preserving published history and private workspaces.
- [x] 1.3 Advance generator ownership and upgrade metadata to `0.30.0`, update current-coordinate assertions/snapshots selectively, and verify focused generator/CLI upgrade tests, historical upgrade fixtures and repeat generation remain valid.

## 2. Source and release-specific acceptance coverage

- [x] 2.1 Run focused release tooling tests and relevant contracts/SDK/loader/media/server/SQLite/D1 regressions; verify pagination, version conflicts, tolerant safety, authorization, published-use refusal and guarded partial detachment coverage without changing accepted behavior.
- [x] 2.2 Extend exact-artifact journeys only where coverage is missing to force multi-page assembly, stale-cursor refusal and draft-media detachment/published-use refusal on Node and local Cloudflare; verify harness scenarios use saved package/image runtime bytes and report source-only concurrency checks separately.
- [x] 2.3 Run full `pnpm test`, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm spec:validate`, plus `pnpm exec openspec validate prepare-alpha-six-release --type change --strict`; resolve failures and record passing commands before freezing shipping source.
- [x] 2.4 Refresh the existing dependency/license audit and verify its policy passes; record actual findings and existing dispositions without granting new implicit exceptions or claiming zero vulnerabilities.

## 3. Immutable artifact preparation and handoff

- [x] 3.1 Record dated read-only npm/GHCR alpha.6 availability/rights checks and any established alpha.5 publication evidence; preserve known published history, leave unverified facts explicit, and capture a reviewed authorized clean source commit. Verify Git cleanliness/revision and frozen installation before preparation.
- [x] 3.2 Run `pnpm release:prepare --output .release-artifacts/alpha-6` or a documented unique retry destination; verify complete publication-eligible inventory, fifteen archives, API/builder images on both Linux platforms and successful platform smoke checks.
- [x] 3.3 Independently run `release:verify` and `acceptance:release` against the exact saved inventory; verify checksums/source/image identifiers and all existing plus release-specific journeys, preserving diagnostics and explicitly recording actual runtime/platform coverage.
- [x] 3.4 Write readiness.md and a portable alpha.6 acceptance receipt with inventory path/SHA-256, source/fingerprint, artifact identifiers, commands/results and harness revision; verify documentation links and strict change validation, distinguish local acceptance from remaining authenticated publication and real deployment prerequisites, and confirm no remote publication/deployment occurred.
