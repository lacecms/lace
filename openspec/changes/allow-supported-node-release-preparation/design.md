## Context

See proposal.md. `prepareUnlocked` in `scripts/release.mjs` validates the release model, checks `process.versions.node` for exact equality and runs `pnpm --version`, then claims the output before snapshotting. A normal source test invokes the real preparation gate, so it currently fails on Node 24.22.1. Existing `inventory.json` version 1 and `source` identity have downstream consumers, including exact-key and equality checks in `release-github.mjs` and `release-evidence.mjs`; extending the identity would break them. The selected minimum is the existing `ENGINE_MINIMUMS.node` (`>=24.12.0`), not `>=24.0.0`.

## Goals / Non-Goals

**Goals:** Accept the declared Node minimum for local preparation, keep actual versions auditable, and retain existing release identity and recovery behavior.

**Non-Goals:** Change CI or Docker Node pins, pnpm's exact preparation pin, package engine declarations, release coordinates, historical alpha requirements, artifact format or tested-compatibility claims. No claim is made that every eligible Node version has been tested.

## Decisions

1. Compare the running Node version to `24.12.0` as a semantic version (major, minor and patch, including prerelease precedence); do not compare strings lexicographically or check just the major. Source the minimum from the existing `ENGINE_MINIMUMS.node` and fail closed for malformed values. Keep exact pnpm `12.3.4`, and check both before `claimOutput`. A small pure version predicate permits boundary tests without modifying `process.versions` or pretending a subprocess ran under another Node. Check an end-to-end preparation under an actually installed newer Node as well. Rejecting all newer majors would contradict the owner-confirmed minimum-only range.
2. After claiming output, write a separate `toolchain.json` with the actual Node and pnpm version strings in the existing guarded preparation try block, before snapshot/packing. Treat write failure as a preparation failure. This is preparation evidence, not a verified compatibility claim; do not insert fields into `inventory.source`, `source.json`, existing inventory schema, publication payloads or historical artifacts. The existing clean-up treats unrecognized files as removable payload; cover cleanup and failure recovery for the sidecar. A mere console message would be lost, and changing inventory/source identity would break strict consumers.
3. Update current release and compatibility documentation to distinguish the preparation minimum from the pinned tested CI/Docker baseline, and retain pnpm's exact preparation requirement. Keep verification's prescribed test toolchain pinned: eligibility is not a replacement for established test evidence. Existing alpha.8 wording is a historical candidate requirement, not a promise to rewrite its evidence.

## Risks / Trade-offs

- [Eligible Node release differs from the tested baseline or changes produced bytes] → retain CI/Docker pins, record actual toolchain, require existing checks and exact-artifact verification; never claim byte reproducibility or compatibility from eligibility alone.
- [A boundary or prerelease comparison incorrectly accepts an unsupported version] → test below/equal/above minimum, later majors, malformed inputs and prerelease ordering.
- [New evidence disrupts publication, cleanup or old artifacts] → keep it separate from strict inventory/source identities, exercise cleanup, failures and old inventory verification.

## Migration Plan

Apply the gate, evidence and tests, then update current guidance and run the required checks. Old inventories and evidence remain untouched. Rollback restores the exact Node check; existing sidecars remain informational and do not affect artifact verification.
