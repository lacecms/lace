## 1. Block migration DSL (`@lacecms/content`)

- [x] 1.1 Add the `migrations` option to `BlockDefinitionInput`/`BlockDefinition` with static validation (canonical integer keys, contiguous range ending at `version`, start ≥ 2, function values, none for version 1) and keep it out of `toBlockMetadata`; verify with content unit tests for valid chains, each malformed map naming the offending key, and unchanged metadata.
- [x] 1.2 Implement `migrateBlockData` and `BlockMigrationError` (`missing_step`, `version_ahead`, `migration_failed`, `invalid_result`), passing deep-frozen normalized copies between steps; verify with unit tests for the 1 → 3 chain, unreachable stored version, a throwing step, array/promise/function/NaN results, and an untouched input.
- [x] 1.3 Extend `index.type-test.ts` for the typed `migrations` option and verify `pnpm --filter @lacecms/content typecheck` (type tests included) passes.

## 2. Configuration pass-through (`@lacecms/config`)

- [x] 2.1 Verify that migrations survive `defineConfig` on `runtime.blocks` and that structure, structural hash and projection hash are identical with and without migrations; add a config test covering it.

## 3. Planning: evidence, decisions and reports (`@lacecms/application`)

- [x] 3.1 Add the migration port and value types (`ConfigurationSyncMigrationEntry`, migration page input/output, `EntryMigrationUnit`, write input/result) and the optional `blockKey`/`schemaVersion`/`path`/`reason` on snapshot references; verify with typecheck.
- [x] 3.2 Implement the pure `planEntryMigration` (stale selection, composition, publish/draft validation, size limit, media-subset and reference-limit checks, revision rule with published-first ordering and `draftGuard`); verify with unit tests for in-sync, changed and draft-only entries, draft-mode leniency, invalid publish result, foreign media, and the reference limit.
- [x] 3.3 Add registry input to `prepareConfigurationSynchronization`/`planConfigurationSyncScans` (fail early on a missing block type), migration scan requests for version-increased `block-definition-changed` changes, and the migration evidence accumulator bound to the fingerprint; verify with evolution unit tests over multi-page fakes.
- [x] 3.4 Decide migration changes in `decideEvolution`: same-version refusal with the new message, `BLOCK_MIGRATION_MISSING`, `BLOCK_VERSION_AHEAD`, `BLOCK_MIGRATION_FAILED`, `BLOCK_MIGRATION_INVALID`, and planned `evolution.migrations`/`change.migration`; verify with planner unit tests, including that re-planning from evidence alone gives the same JSON.
- [x] 3.5 Render migration change details, `planned block migrations` lines and block references in diagnostics, keeping CE1A/CE1B JSON byte-identical without migrations; verify with report snapshot tests.
- [x] 3.6 Implement two-phase `applyPreparedConfigurationSynchronization` (registry input, migration phase, re-prepare with plan comparison excluding migrations, final mutation, `migrated` counts, stale errors); verify with application tests using an in-memory fake port, including interruption and resume.

## 4. Shared SQL (`@lacecms/db`)

- [x] 4.1 Add the migration entry-page SQL (stale-type filter through `json_each`, entry-ID cursor, target-only block data, snapshot media IDs) and a page mapper; verify through the repository contract cases in group 6.
- [x] 4.2 Add per-snapshot guard condition and write statement builders (chunked `update … from (values …)`, reference delete and active-only insert, snapshot revision update) within 100 bound parameters; verify with unit tests on parameter counts for 200 blocks and 200 references.

## 5. Adapters

- [x] 5.1 Node: implement `readConfigurationSyncMigrationEntries` and `applyConfigurationSyncBlockMigrations` (one transaction per unit, stale error on a failed guard, earlier units kept); verify with the Node contract run.
- [x] 5.2 D1: implement the same read and greedy batch packing ≤ 40 statements with all-guards conditions, published-then-draft split for oversized units, and guard-count checking; verify with the D1 contract run and the D1 budget acceptance suite.
- [x] 5.3 Wire the registry into `runLocalContentSync`, `apps/api/src/content-sync-cli.ts`, `apps/api/src/cloudflare-local.ts` and `packages/cli/src/commands.ts` (`config.runtime.blocks`, migrated-count message and JSON `migrated`); verify with CLI and API sync tests.

## 6. Cross-runtime contract tests (`@lacecms/test-utils`)

- [x] 6.1 Contract case: block 1 → 3 with two steps on draft-only, in-sync published and changed entries; assert migrated data and versions, revisions and statuses, `system:content-sync` draft actor, unchanged other blocks and fields, one published-version bump, one pending build, a no-op rerun, and that published blocks validate with the v3 definition in publish mode with an exact-version check (render-core rule); verify on Node and D1.
- [x] 6.2 Contract case: a throwing migration and an invalid published result each refuse the plan and leave `syncEvidenceState` unchanged; verify on Node and D1.
- [x] 6.3 Contract case: interruption after the first unit (injected failure) leaves model and baseline unchanged, and a rerun completes with a result equal to an uninterrupted run; verify on Node and D1.
- [x] 6.4 Contract case: an editor save with the pre-migration revision fails with a revision conflict, and a draft save between scan and write stops the sync as stale; verify on Node and D1.
- [x] 6.5 Contract case: a migration moving a media ID between block fields keeps media usage per snapshot under the new field path; a foreign media ID refuses the plan; verify on Node and D1.
- [x] 6.6 Contract case: an entry with 200 migrated blocks in both snapshots migrates within D1 batch budgets with the published batch first, equal to Node; verify on Node and D1.
- [x] 6.7 Update the existing "changed definition of a used block" case to the same-version refusal message and add the missing-step and version-ahead refusals; verify on Node and D1.

## 7. Architecture and documentation

- [x] 7.1 Update `docs/mvp-architecture.md` sections 4.7, 8 (migration row and paragraph), 11 and 22, and add the CE1C addendum to ADR 0007; verify by review against design decisions 5 and 6.
- [x] 7.2 Add "Block migrations (CE1C)" to `docs/configuration-synchronization.md` (DSL, chain rules, dry run, revision rule, resumability, public window, operator steps); verify by review.
- [x] 7.3 Document versioned blocks in `packages/cli/README.md` (`lace add block` version mismatch and ownership) and in the starter template `docs/lace-operations.md` with a `defineBlock` migration example; verify with `tests/consumer-guides.test.mjs` and template fixture tests.
- [x] 7.4 Mark CE1C done and CE1 complete in the roadmap session log in `docs/content-editor-roadmap.md`; verify by review.

## 8. Verification

- [x] 8.1 Run the narrow package tests (content, config, application, db, platform-node, platform-cloudflare, test-utils, cli, api), then root typecheck, Oxlint, Oxfmt check, and `pnpm exec openspec validate ce01c-block-migrations --type change --strict`; all pass.
