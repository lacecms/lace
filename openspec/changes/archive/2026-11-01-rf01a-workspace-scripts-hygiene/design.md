## Context

See proposal.md for motivation. Facts that shape the approach (commit
`1494b039`):

- `scripts/generated-project-acceptance.mjs` (2,480 lines) composes the
  exact-artifact acceptance from journey modules it imports:
  `alpha-six-acceptance.mjs` (`alphaSixJourney`: SDK/HTTP contracts and media
  on Node), `alpha-seven-acceptance.mjs` (`alphaSevenGif`,
  `alphaSevenMediaJourney`, `verifyAlphaSevenImages`: GIF, proxy and image
  variant caching), `alpha-eight-acceptance.mjs` (`configureAlphaEight`,
  `alphaEightJourney`, `verifyAlphaEightStarter`, `alphaEightTlsProxy`: list
  settings, MCP, TLS edge) and `consumer-34b-security.mjs`
  (`consumer34bSecurity`: origin, cross-site and polyglot-upload denials).
  `cloudflare-consumer-acceptance.mjs` imports the same modules. The accepted
  specs require these journeys; only their names are release-bound.
- Stage names such as `alpha-six-node-contracts-media`,
  `34b-live-host-<script>`, `34c-packed-restore-rotation` and
  `template-0.4.0-and-0.14.0-upgrade` appear in receipts and CI summaries;
  no release script parses them.
- The three verification runners (`cross-runtime-verification.mjs`,
  `security-resilience-verification.mjs`, `operations-verification.mjs`)
  write `.lace-acceptance/step-34{a,b,c}-*` directories, print `34A`/`34B`/`34C`
  prefixes and pass `--config vitest.<name>.config.mjs` to Vitest. Each root
  config is an `include` list with serial execution and timeouts.
- `LACE_34B_*_IMAGE` are read by `compose-database-safety.mjs` and the
  security runner; `LACE_34C_EVIDENCE` and `LACE_34C_PACKED_ROOT` by
  `tests/operations.acceptance.mjs`, `tests/support/operational-platforms.mjs`
  and `tests/support/cross-runtime-fixture.mjs`.
- `tests/fixtures/template-{0.4.0,0.14.0,0.30.0,0.35.0}/{default,cloudflare}.json`
  are exact generated projects; `template-upgrade-acceptance.mjs` upgrades
  all four; only `0.4.0` and `0.14.0` have integrity tests.
- `tests/feedback-map.mjs` and two tests enforce the onboarding and alpha.2
  feedback maps under `docs/archive/step-32` and `step-33`;
  `tests/field-trial-acceptance.test.mjs` unit-tests helpers exported by
  `block-order-acceptance.mjs` and `weak-etag-acceptance.mjs`.
- Root `pnpm test` runs `vitest run tests` without an explicit config, so a
  root `vitest.config.mjs` would silently change what it runs.
- `openspec/changes/video-a-media-upload-delivery` validates today but has
  no completed task and its design was superseded by the embed-first video
  decision recorded in `backlog.md`.

## Goals / Non-Goals

**Goals:**

- Every script, stage, directory and variable name says what it verifies.
- One place lists what each root command does.
- An automated guard keeps `scripts/` free of orphans and `package.json`
  free of dangling targets from now on.
- Acceptance and verification behavior is unchanged except for the withdrawn
  template fixtures.

**Non-Goals:**

- Reworking journey assertions, runner phases, or the acceptance CI matrix.
- Reducing `generated-project-acceptance.mjs` size (a later refactoring
  session if ever; not on the roadmap).
- Replacing script-side command implementations with CLI calls (RF7B).

## Decisions

1. **Rename journeys, do not merge them.** `scripts/journeys/node-contracts-media.mjs`,
   `scripts/journeys/image-delivery.mjs`, `scripts/journeys/list-settings-mcp-proxy.mjs`
   and `scripts/journeys/consumer-security-probes.mjs`, with exported
   function names matching (`nodeContractsMediaJourney`, `gifFixtureFrames`,
   `imageDeliveryJourney`, `verifyImageDelivery`, `configureListSettings`,
   `listSettingsMcpProxyJourney`, `verifyListSettingsStarter`, `tlsEdgeProxy`,
   `consumerSecurityProbes`). The roadmap text suggested folding them into
   one `release-acceptance.mjs`; rejected because the modules are already
   cohesive by behavior and the accepted specs name their journeys
   separately in receipts. A subdirectory keeps `scripts/` listable.
2. **One verification Vitest config with projects, not a root config.**
   `vitest.verification.config.mjs` declares projects `cross-runtime`,
   `operations`, `resilience`, `security-static` and `d1-budgets`, each
   carrying the former file's `include`, serial settings and timeouts. Runners
   pass `--config vitest.verification.config.mjs --project <name>`. A root
   `vitest.config.mjs` was rejected because `pnpm test` would pick it up and
   run acceptance projects in the unit run.
3. **Fixture retention is a policy, not a list.** Only
   `tests/fixtures/template-0.35.0` stays (owner decision, 2026-11-01: the
   latest published template). `tests/template-fixture.test.mjs` discovers
   every `tests/fixtures/template-*/` directory and verifies provenance,
   manifest version and managed digests, so the next release replaces the
   directory without touching the test. `template-upgrade-acceptance.mjs`
   derives its variant list from the same directories. The stage name becomes
   `template-upgrade`.
4. **Traceability maps go, helper tests stay.** The two map tests and
   `feedback-map.mjs` are deleted with their requirements;
   `field-trial-acceptance.test.mjs` is renamed `acceptance-helpers.test.mjs`
   because it tests current helper code.
5. **Orphan guard as a root test.** `tests/root-scripts.test.mjs` reads root
   `package.json`, `.github/workflows/*.yml`, `apps/*/Dockerfile*`,
   `scripts/**/*.mjs` and `tests/**/*.mjs`, builds the reference graph by
   literal file name, and asserts both directions plus the catalog rows in
   `DEVELOPMENT.md` (one Markdown table row per root script name). It also
   asserts that no root script name, `scripts/` file name or `LACE_*`
   variable read by a script matches `/(alpha-(one|two|…|eight)|\b3[0-9][abc]\b|step-3[0-9])/`.
   Chosen over extending `check-boundaries.mjs` because this is repository
   hygiene, not package architecture.
6. **Superseded change is moved, not archived through the CLI.**
   `openspec archive` would synchronize its deltas into main specs. The
   directory moves to
   `openspec/changes/archive/2026-11-01-video-a-media-upload-delivery-superseded/`
   with a `SUPERSEDED.md` stating the embed-first decision and that no task
   was applied. Strict validation of `--all` covers active changes only.
7. **Environment variables renamed with a short deprecation shim: none.**
   The variables are read by repository scripts only; no generated project
   or published package reads them. Renamed in place.
8. **`.gitignore` pattern** `packages/platform-node/*.sqlite*` (covers WAL
   and SHM files) instead of a single file name.

## Risks / Trade-offs

- [Receipts change shape] Stage names in new receipts differ from archived
  ones → archived receipts stay as recorded; `release-evidence.mjs` imports
  receipts without matching stage names (verified by grep in tasks).
- [Lost upgrade coverage] Projects generated by alpha.1–alpha.6 templates are
  no longer proven to upgrade → owner accepted; `docs/compatibility.md`
  states that supported upgrades start from the latest published template.
- [Rename misses a consumer] A script or doc still names `verify:34c` or
  `LACE_34C_*` → the root test's forbidden-name assertion and a final
  repository grep in tasks.
- [Vitest projects semantics] Project-level `testTimeout`/`fileParallelism`
  must behave as the former per-file configs → each runner's phase is
  executed once in the change against the new config and the phase result
  JSON compared with a pre-change run.

## Migration Plan

Single commit on a branch; no data or deployment migration. Rollback is a
revert. Historical `.lace-acceptance/step-34*` directories on contributor
machines are ignored by git and may be deleted manually.
