## Context

The local rc4 tag resolves to `1988e36d7a9793a58c8cd106fec5178865c65b4b` and selects template `0.49.0`. Current source selects rc4 but already advances the unreleased template to `0.50.0` for the ingress changes. The retained `template-0.49.0` fixtures record the rc4 generator, source revision and registry digests. The compatibility table and changelog currently conflate the published rc4 template with the later working-tree template.

## Goals / Non-Goals

**Goals:** Keep immutable release history accurate, make the current shipping source internally consistent, and give the owner a reproducible handoff with explicit remaining gates.

**Non-Goals:** Change runtime contracts or the support floor; prepare or publish release artifacts; claim exact-artifact acceptance or real-deployment verification.

## Decisions

- Verify the sixteen rc4 npm versions, both image indexes and GitHub tag/release, and check rc5 coordinates for collisions. Record date and actual outcomes; add rc4 to immutable history only on evidence of complete publication. A local tag alone cannot prove the whole release. Publishing authorization remains an owner check.
- Use template `0.50.0` for rc5 if the verified published rc4 generator is `0.49.0` and the current upgrade assets are coherent. This version was already advanced for the post-rc4 managed Compose changes; advancing again without a new published template would obscure the actual upgrade baseline. Correct historical rc4 references accordingly.
- Retain the existing published rc4 fixtures after checking their digests, source and generated content against the actual immutable package. Do not replace them with working-tree output or make rc5 the fixture source before publication. Preserve generic upgrade and conflict checks.
- Derive release notes and upgrade steps from the entire diff since the rc4 tag and accepted change records, including additive migration `0001`, backup and rollback, production proxy and host-port changes, and authentication status changes. Check actual commands and affected configurations rather than assuming every source change is user-facing.
- Update every coordinate validated by `release:check`, generated snapshots and tests as a coherent set. Record source-only checks separately from the owner's clean-commit, both-platform preparation, exact-artifact acceptance, publication and real-infrastructure checks.
- Align the Better Auth OAuth provider and its related peer dependencies with the selected Better Auth release, regenerate the lockfile and verify the real plugin composition and Node/Worker OAuth journeys. Do not suppress the type error or weaken the compatibility contract. Add the existing MCP gate to CI and rerun the dependency/license audit and relevant release checks after the lockfile change.

## Risks / Trade-offs

- [Remote state is unavailable or inconsistent] → Record failures and preserve dependent historical claims until evidence is available; never infer availability from network errors.
- [Ingress changes disrupt an existing deployment] → Describe proxy transition, managed-file conflicts, effective bindings and recovery using backups and matching old files.
- [Template provenance is confused with the current source version] → Distinguish published rc4 `0.49.0` from candidate `0.50.0` after verification, and verify fixture hashes and source.
- [Source gates are mistaken for publication readiness] → State precisely what ran and leave inventory and acceptance evidence to the owner.
