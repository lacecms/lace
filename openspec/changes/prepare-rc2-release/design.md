## Context

See proposal.md. On 2026-11-08, npm `next` points to `0.1.0-rc1`, and GitHub has prerelease `v0.1.0-rc1`. `release/alpha.json` still selects rc1, does not list rc1 in `publishedVersions` and names template `0.46.0`. RF8X already moved the source template to `0.47.0` with rc1-only upgrade instructions. `validateReleaseModel` (`scripts/release-model.mjs`) checks every guarded coordinate and never rewrites files. `prepareUnlocked` (`scripts/release.mjs`) compares `process.versions.node` with `"24.12.0"` exactly. The local machine runs Node 24.22.1. The pending `allow-supported-node-release-preparation` change planned a semver minimum of `24.12.0` plus a `toolchain.json` sidecar (0/6 tasks). The owner now chose a simpler rule: major version 24 or later.

## Goals / Non-Goals

**Goals:** a coherent rc2 source that passes `release:check`/`release:plan`; a preparation gate the owner can pass on their installed Node; concise release notes and guidance precise enough for the owner to run the release themselves.

**Non-Goals:** running preparation, acceptance or publication; changing runtime behavior, schema, CI/Docker pins or engine minimums; new upgrade fixtures.

## Decisions

1. **Version gate is a pure exported predicate.** `preparationToolchainError(node, pnpm)` returns a message or `undefined`. The Node check parses the leading `major.minor.patch` digits and requires major ≥ 24. Malformed input fails closed. pnpm must equal `12.3.4`. `prepareUnlocked` calls it first, before reading the release model and before `claimOutput`, so a rejected run leaves no output. A pure function is testable without mutating `process.versions`. The existing injected-failure test no longer needs to fake the Node version, so the override is removed. A semver minimum of `24.12.0` (the withdrawn change) was rejected because the owner asked for "24 or later". The `toolchain.json` sidecar was dropped as unrequested scope. The tested baseline stays recorded in CI/Docker pins, and the documentation says eligibility is not tested compatibility.
2. **Coordinates move together; validation stays read-only.** Every file that `release:check` guards is updated to `0.1.0-rc2`. `templateVersion` becomes `0.47.0`, and `0.1.0-rc1` is appended to `publishedVersions`. Test assertions and acceptance journeys that expect the installed engine version (`consumer-security-probes`, Node/Cloudflare browser acceptance, operations acceptance, create-lace/CLI packaged tests) name rc2. Historical samples stay as they are: release-model format cases, release-artifacts inventory samples and the `template-0.46.0` fixtures produced by the real rc1 generator. Generated-project snapshots are refreshed with the existing `snapshots --update` command because template bytes change. The lockfile is refreshed if workspace versions appear in it.
3. **Release notes reuse the existing upgrade guide.** The CHANGELOG gets a `0.1.0-rc2` entry with 3–6 bullets: the baseline/recreate requirement, removed pre-rc1 compatibility paths and the owner-check-9 contract changes. It links to `docs/compatibility.md#upgrading-from-rc1`, which RF8X already wrote. Compatibility lists rc2/template `0.47.0` as the current candidate, and its pin table separates preparation eligibility from the tested Node. `docs/alpha-release.md` uses `.release-artifacts/rc2` in its examples and states the Node 24+ prerequisite. The roadmap records the rc2 checkpoint and resolves owner checks 9 and 10.
4. **The stale Node change is withdrawn by deletion.** Its directory is removed in the same commit; git history and this design keep the record. Archiving it would add a requirement that is never implemented.

## Risks / Trade-offs

- [A Node 24 minor below `24.12.0` passes the gate although the packages declare `>=24.12.0`] → owner decision; documentation tells the owner to prepare on a Node that also satisfies the engine minimum. The frozen install and acceptance still run on the actual interpreter.
- [Missed coordinate] → `release:check`, `release:plan` and the focused generator/CLI tests fail on any stale value.
- [rc2 published while the roadmap continues] → rc3 follows the same procedure. rc1 stays the oldest supported release until a later decision.

## Migration Plan

Operators upgrade from rc1 using the existing "Upgrading from rc1" guide: back up, upgrade all packages and images together, recreate the database, sync, bootstrap and restore content. Rollback means restoring the rc1 backups together.
