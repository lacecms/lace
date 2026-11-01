## Why

The repository carries scripts, tests and fixtures named after the alpha
release or roadmap step that introduced them (`alpha-six-acceptance.mjs`,
`consumer-34b-security.mjs`, `verify:34a`, `template-0.4.0`), feedback
traceability maps for alpha.1 and alpha.2 field trials, a placeholder
`test:integration` command that only fails, five one-line Vitest configs and
an unapplied, superseded OpenSpec change. With one user and no non-alpha
release, these files cost reading time on every change and tell newcomers
nothing about what they verify. This is Session RF1A of
[`docs/refactoring-roadmap.md`](../../../../docs/refactoring-roadmap.md), the
first session of Step RF1 (workspace hygiene); it runs first because it
shrinks everything RF2 converts and RF1B re-indexes.

## What Changes

- **Journey modules are named by what they verify, not by release.**
  `scripts/alpha-six-acceptance.mjs`, `alpha-seven-acceptance.mjs`,
  `alpha-eight-acceptance.mjs` and `consumer-34b-security.mjs` move to
  `scripts/journeys/` under behavior names; acceptance stage names, receipt
  labels and log prefixes lose their alpha and step numbers. The journeys
  themselves, which the exact-artifact acceptance specs require, do not change.
- **Verification entrypoints lose roadmap step numbers.** `verify:34a`,
  `verify:34b`, `verify:34c` become `verify:cross-runtime`,
  `verify:security`, `verify:operations`; the three runners stop writing
  `step-34*` result directories and `34B`/`34C` log prefixes.
- **One verification Vitest config.** The five root
  `vitest.<name>.config.mjs` files become one
  `vitest.verification.config.mjs` with named projects that the runners
  select.
- **Template upgrade fixtures keep only the latest published template.**
  `tests/fixtures/template-0.4.0`, `template-0.14.0`, `template-0.30.0` and
  the two fixture tests are deleted; `template-0.35.0` (alpha.7) stays with a
  generic fixture-integrity test, and the upgrade journey and release
  acceptance upgrade from it alone. **BREAKING** for the accepted acceptance
  specs: the published alpha.1 and alpha.2 upgrade proofs are withdrawn
  (owner decision, 2026-11-01).
- **Feedback traceability maps are retired.** `tests/feedback-map.mjs`,
  `tests/onboarding-feedback-acceptance.test.mjs` and
  `tests/alpha-2-feedback-acceptance.test.mjs` are deleted together with the
  two requirements that mandate them. The regression journeys they pointed at
  remain in the acceptance suite, and `tests/field-trial-acceptance.test.mjs`
  (unit tests of the block-order and weak-ETag journey helpers) is renamed
  `acceptance-helpers.test.mjs`. The historical logs and maps under
  `docs/archive/step-32` and `step-33` are removed in RF1B.
- **Step-numbered environment variables are renamed.** `LACE_34B_API_IMAGE`,
  `LACE_34B_BUILDER_IMAGE`, `LACE_34B_MINIO_IMAGE`, `LACE_34C_EVIDENCE` and
  `LACE_34C_PACKED_ROOT` become `LACE_VERIFY_API_IMAGE`,
  `LACE_VERIFY_BUILDER_IMAGE`, `LACE_VERIFY_MINIO_IMAGE`,
  `LACE_VERIFY_EVIDENCE` and `LACE_VERIFY_PACKED_ROOT`.
- **Placeholder command removed.** `scripts/not-implemented.mjs` and the
  root `test:integration` script are deleted together with the governance
  requirement written for milestone 1.
- **Superseded change archived.** `openspec/changes/video-a-media-upload-delivery`
  (0 of 20 tasks; replaced by the embed-first video decision) moves to
  `openspec/changes/archive/2026-11-01-video-a-media-upload-delivery-superseded`
  with a note, without synchronizing its deltas.
- **Hygiene guards.** `.gitignore` covers the local Node database
  (`packages/platform-node/*.sqlite*`); a root test asserts that every root
  `package.json` script target exists and that every `scripts/*.mjs` file is
  referenced by a root script, another script, a workflow, a Dockerfile or a
  test; `DEVELOPMENT.md` gains a script catalog covering every root command.

Non-goals: changing any journey's assertions or the verification runners'
phases; merging the verification documents (RF1B); replacing
`scripts/cloudflare.mjs migrate` or `dev-stack.mjs sync` with CLI calls
(RF7B); converting package tests to source imports (RF2); a release.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generated-project-acceptance`: the upgrade proof starts from the latest
  published template (`0.35.0`) instead of the alpha.1 `0.4.0` fixtures; the
  `0.14.0` fixture clause of the scenario-link requirement is withdrawn; the
  onboarding-feedback and alpha.2 field-trial traceability-map requirements
  are removed.
- `prepublication-consumer-security`: release acceptance upgrades the
  `0.35.0` fixtures instead of `0.4.0`; the field-trial regression list drops
  its `0.14.0` upgrade item and its alpha.2 framing; receipts name journeys
  by behavior.
- `workspace-governance`: the milestone-1 "unavailable command" requirement
  is removed because no documented command remains unimplemented; a new
  requirement makes root scripts, script files and the `DEVELOPMENT.md`
  catalog reference each other completely and forbids prerelease or
  roadmap-step identifiers in script, stage, directory and variable names.

## Impact

- Architecture: §20 *Testing strategy* and §21 *Observability and
  operations* mention the verification commands by purpose only; no
  invariant changes. Section 25 keeps its references to the owner plan.
- Code and tooling: `scripts/` (four moves, three runner edits, one deleted
  file, one new `journeys/` directory), `tests/` (five deletions, two
  additions, fixture directories), root `package.json`, `.gitignore`, five
  Vitest configs replaced by one, `DEVELOPMENT.md`,
  `docs/local-operations-verification.md` and
  `docs/local-security-verification.md` (command names only; RF1B merges
  them), `openspec/changes/`.
- CI: `.github/workflows/generated-project-acceptance.yml` keeps calling
  `acceptance:*`; stage names in its summaries change.
- Dependencies: none added or removed.
- Downstream: release acceptance receipts and `.lace-acceptance/` result
  directory names change; historical receipts under archived changes stay as
  recorded.
