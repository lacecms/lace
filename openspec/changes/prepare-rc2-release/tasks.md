## 1. Preparation toolchain gate

- [x] 1.1 Replace the exact Node check in `scripts/release.mjs` with an exported `preparationToolchainError` (Node major ≥ 24, malformed fails closed, pnpm exactly `12.3.4`) evaluated before `claimOutput`; add focused tests for `23.11.0`, `24.0.0`, `24.12.0`, `24.22.1`, `25.1.0`, malformed versions and wrong pnpm, and drop the `process.versions` override from the injected-failure test.
- [x] 1.2 Withdraw `openspec/changes/allow-supported-node-release-preparation` (folded into this change).

## 2. rc2 coordinates

- [x] 2.1 Set `release/alpha.json` to `0.1.0-rc2`/template `0.47.0` and append `0.1.0-rc1` to `publishedVersions`; update the sixteen public manifests, platform release-version modules, template manifests and `.env.example`, Dockerfile defaults, registry requirements and delivered guides; refresh the lockfile if needed; verify `pnpm release:check` and `pnpm release:plan`.
- [x] 2.2 Update version assertions in create-lace/CLI packaged tests, acceptance journeys and operations acceptance; refresh generated-project snapshots; run focused create-lace, CLI and release tests.

## 3. Release notes and guidance

- [x] 3.1 Add the `0.1.0-rc2` CHANGELOG entry (baseline/recreate, removed pre-rc1 paths, owner-check-9 contract changes) linked to the rc1 upgrade guide.
- [x] 3.2 Update `docs/compatibility.md`, `docs/alpha-release.md`, `docs/documentation-maintenance.md`, README and docs-app target to rc2 and the Node 24+ preparation rule; record the rc2 checkpoint and resolve owner checks 9 and 10 in the roadmap; run `pnpm docs:check`.

## 4. Gates

- [x] 4.1 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate` and `pnpm exec openspec validate prepare-rc2-release --type change --strict`.
