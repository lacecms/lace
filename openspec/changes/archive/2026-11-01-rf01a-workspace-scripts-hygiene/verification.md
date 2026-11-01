# RF1A verification — 2026-11-01

Applied in the existing `docs/refactoring-roadmap` branch. The RF1A change was archived on 2026-11-01 after synchronizing all three
capability deltas into the accepted specifications.

## Verification-plan correction

The owner approved separate starter and upgrade source-mode runs, with release
receipt names inspected in code. `acceptance:starter` has no upgrade phase and
creates no receipt. Tasks 3.3 and 7.3 now use the existing `upgrade` mode and do
not claim full exact-artifact release acceptance.

## Before/after verification runners

All phases passed in both runs and their ordered phase-name lists are identical.
The original baseline runners used Node 24.22.1; final checks used the release-pinned
Node 24.12.0 and pnpm 12.3.4. Local Docker/OrbStack and Playwright Chromium were
available. The explicit security fixture images were the cached alpha.8 arm64
API/builder images and `quay.io/minio/minio:RELEASE.2025-02-07T23-21-09Z`.

| Runner | Baseline report | Final report |
| --- | --- | --- |
| Operations | `.lace-acceptance/step-34c-results-NmtF0A/results.json` | `.lace-acceptance/verify-operations-zLoHLM/results.json` |
| Security | `.lace-acceptance/step-34b-QJpLl0/result.json` | `.lace-acceptance/verify-security-TG0f1i/result.json` |

Operations phases: local-prerequisites, workspace-build, harness-and-guides,
generated-node-setup, generated-cloudflare-setup, health-restore-rotation,
forward-migration-upgrade. The operations named project ran the same 28 tests.

Security phases: local-prerequisites, workspace-build, security, repositories,
provider, compose-host-safety, storage-and-admin-recovery, static-secret-exclusion,
d1-http-budgets, dependency-audit. Test counts before/after were identical:
284 security, 352 repositories, 74 provider, 4 resilience, 1 static-secret exclusion
and 4 D1 budgets. The audit retained 992 license records and one explicitly
dispositioned tooling advisory.

The `d1-budgets` project lists only `tests/d1-http-budgets.acceptance.mjs`.
Cross-runtime/operations usage names the new commands; the security runner keeps
its existing no-argument interface. The artifact-dependent full cross-runtime
runner was not executed. Its shared configuration was checked by project discovery,
and the operations/security projects ran against actual local compositions.

## Focused acceptance and guards

- `pnpm acceptance:starter`: passed packed installation, typecheck, browser,
  rendered built-in blocks/envelopes/navigation, image variants and warm cache,
  and offline sample import validation.
- `pnpm exec node scripts/generated-project-acceptance.mjs upgrade`: passed for
  both retained template variants. Infrastructure and documentation conflicts,
  newly added guide-path collisions, refused-apply byte preservation, current
  managed files, protected user files and repeat no-op plans were verified.
  Independent negative scenarios clear only their generated conflict-review
  metadata before proceeding to the next scenario.
- The five requested receipt labels (`template-upgrade`, `node-contracts-media`,
  `gif-proxy-cache`, `list-settings-mcp-proxy`, `consumer-security-probes`) are
  present in the actual release receipt construction; legacy alpha/step stage
  labels are absent. No full exact-artifact release receipt was produced.
- Fixture integrity: both variants passed; an altered managed byte in a
  temporary fixture copy is rejected. Original generated file bytes and manifest
  hashes were preserved. Missing `provenance.sourceRevision` metadata was added
  from the archived alpha.7 readiness handoff's shipping source,
  `665bd3499b49180a0873881bd9a93bb2722f556a`.
- Script guard: 51 files, zero orphans, including `make-api-runtime.mjs` through
  its Dockerfile. Workspace package build scripts are included as references
  because root Turbo commands reach the Admin notices writer through its build
  script. Temporary repositories prove failures for dangling targets, orphaned
  files, missing catalog rows and forbidden script/file/environment identifiers.
- All 54 root commands have exactly one catalog row; the removed integration
  placeholder reports an unknown command. SQLite and WAL paths are ignored.
- Legacy journey/command/environment names are absent from executable scripts
  and tests. Planning artifacts and archived evidence retain historical names;
  the cross-runtime baseline still reads its existing archived inventory until
  RF1B replaces verification-document references.

## Final gates

Passed `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`,
`pnpm openapi:check`, `pnpm spec:validate`, and
`pnpm exec openspec validate rf01a-workspace-scripts-hygiene --type change --strict`.
Oxlint also checked the new tests, journey modules, verification config and
updated upgrade runner directly. `git diff --check` passed.

Root baseline: 34 test files / 225 cases. Final: 32 files / 225 cases.
The exact arithmetic is four deleted test files (two feedback-map tests and two
fixture tests), each with two cases, plus two new files with eight cases total.
The helper test rename changes neither file nor case count. The plan's shorthand
“minus three deleted tests” does not describe the actual file inventory.
All 44 Turbo test/build tasks passed; strict OpenSpec validation passed all
86 active capability/change items. Logs and ignored local reports remain local
verification evidence, not published-release or real-deployment certification.

## Archive verification

All 21 tasks were complete. Every added/modified requirement matched its delta
after synchronization, every removed requirement was absent, and unrelated
requirements/scenarios were preserved. Strict validation of all 84 accepted
capabilities passed before archiving. The archive is
`openspec/changes/archive/2026-11-01-rf01a-workspace-scripts-hygiene`.
