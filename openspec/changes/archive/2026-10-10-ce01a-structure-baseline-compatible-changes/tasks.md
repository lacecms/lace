## 1. Architecture and decision record

- [x] 1.1 Update `docs/mvp-architecture.md` sections 4.7, 8 *Configuration projection*, 9.1 and 9.3 for the baseline columns, the change classification, sync-applied backfill of published snapshots with published-version advancement, and definition-scoped display stripping; verify the text matches the schema-evolution and configuration-synchronization deltas
- [x] 1.2 Add `docs/adr/0007-schema-evolution-during-sync.md` recording the baseline, the classification, the fingerprint guard and revision-neutral backfill with rejected alternatives; verify it is linked from section 24 of the architecture

## 2. Canonical model structure (`@lacecms/config`)

- [x] 2.1 Add `contentModelStructure(model, registry)` with definition-scoped `label`/`description` stripping, expose `structure` and (when different) `legacyStructureHash` on runtime models, compute `structureHash` from the new structure, and strip both from the public projection; verify with config tests that hashes are unchanged for the existing projection fixture
- [x] 2.2 Add config tests for fields and block fields named `description`/`label` (structural, legacy hash present), for the absence of `structure`/`legacyStructureHash` in the JSON public projection, and for deep freezing; verify `pnpm --filter @lacecms/config test` passes

## 3. Structure diff and classification (`@lacecms/application`)

- [x] 3.1 Implement the pure structure diff and classifier (fields, allowlist, block definitions, path/route; key and version excluded) with deterministic ordering per design decision 5; verify with unit tests for every class in the schema-evolution classification requirement
- [x] 3.2 Implement scan requests and the pure page evaluator producing `ConfigurationSyncEvidence` (holder counts, backfill counts, post-backfill validation, required-on-published presence, oversize backfills, violations capped at 20 with totals, fingerprint); verify with unit tests over multi-page inputs
- [x] 3.3 Extend stored state (`structure`, `snapshotFingerprint`), add `readConfigurationSyncSnapshots` to the read port, add `record-baseline`, `evolution`, the new diagnostic codes and the legacy-hash upgrade path to `planConfigurationSynchronization`, and keep strict fallback for missing baselines or missing `structure`; verify existing planner tests still pass and new tests cover baseline recording, legacy hash, strict fallback guidance and every refusal code
- [x] 3.4 Make `prepareConfigurationSynchronization` scan through the port and carry evidence; pass evidence through `applyPreparedConfigurationSynchronization` into `ApplyConfigurationSynchronizationInput`; extend text and JSON reports with change classes, counts, planned writes and named snapshots; verify with report snapshot tests and a determinism test across insertion orders

## 4. Schema and shared SQL (`@lacecms/db`)

- [x] 4.1 Add `structure_json` and `structure_json_hash` to the Drizzle schema and generate migration `0005` with `pnpm db:generate`; verify the SQL is additive and the journal/snapshot update
- [x] 4.2 Extend `STORED_MODEL_STATE_SQL`, `STORED_MODEL_STATE_JSON_SQL`, row mapping and `sameStoredModelStates` with the valid-baseline projection and snapshot fingerprint, and add shared scan and backfill SQL; verify `pnpm --filter @lacecms/db test` passes and a migration test shows existing rows keep `NULL` baselines

## 5. Runtime adapters

- [x] 5.1 Node: implement `readConfigurationSyncSnapshots` (bounded pages, block summaries), baseline writes for all identity operations and `record-baseline`, set-based backfills after identity updates, and skip `bumpPublicState` for baseline-only applies, all inside the existing transaction; verify Node repository contract runs pass
- [x] 5.2 D1: implement the same scan within bound-parameter limits and add baseline, record-baseline and backfill statements to the guarded synchronization batch with the same baseline-only public-state rule; verify the D1 Miniflare contract run passes

## 6. Contract and integration tests

- [x] 6.1 Add repository contract cases (Node file, Node memory, D1) for: compatible additions with draft and published content including default backfill and relaxed constraint and newly allowed block type; failing tightening naming snapshots with no writes; satisfied tightening; unused field/block-type removal; refused removal of stored data and changed definition of a used block; check-only preparation writing nothing; stale plan after a draft save; baseline-only apply without public-state change; upgrade from `NULL` baselines including the restore-sync-apply sequence and legacy-hash acceptance; verify all runtimes pass
- [x] 6.2 Update `apps/api` content-sync tests and CLI command tests for the new report lines, the `record-baseline` first run and refusal output; verify `pnpm --filter @lacecms/cli test` and the api content-sync tests pass

## 7. Documentation and roadmap

- [x] 7.1 Update `docs/configuration-synchronization.md` (classes, baseline, upgrade steps, diagnostics, backfill semantics) and `docs/database-migrations.md` (migration `0005`); verify links resolve
- [x] 7.2 Mark CE1 `in progress` and add the CE1A session-log row in `docs/content-editor-roadmap.md`; verify the table renders

## 8. Verification

- [x] 8.1 Run the narrowest affected package tests, then root typecheck, Oxlint, Oxfmt check and `pnpm exec openspec validate ce01a-structure-baseline-compatible-changes --type change --strict`; verify all pass
