## Why

`lace content sync` refuses every structural change to a model that has a draft or published snapshot (`STRUCTURE_CHANGE_HAS_SNAPSHOTS`). On a live site an operator therefore cannot add an optional field, relax a limit or allow a new block type without manual database work. Sync cannot do better today because it stores only a structural hash, so it cannot tell which part of a model changed.

This change implements roadmap step **CE1 — Schema evolution and block migrations**, session unit **CE1A — Structure baseline and compatible changes** ([content and editor roadmap](../../../docs/content-editor-roadmap.md), section 5). CE1B (field rename and removal hints) and CE1C (block migrations) build on the baseline and the classification introduced here and are proposed separately.

## What Changes

- **Structure baseline.** `content_models` gains `structure_json` (the canonical structure of the last successful sync) and `structure_json_hash` (the structural hash the baseline was written with), in one forward migration shared by Node SQLite and D1. A baseline is used only while `structure_json_hash` equals the stored `structure_hash`. The configuration file stays the only source of truth. The baseline is non-authoritative synchronization metadata.
- **Precise structural identity.** Today the structural hash drops every object key named `label` or `description` at any depth. This also drops model fields, block fields and block default values that happen to use those keys, for example the common `description: field.textarea()`. The structure now strips display metadata only from model, field and block definitions. The structural hash of a configuration that uses none of those keys is unchanged. Runtime models expose their canonical structure, plus the pre-change hash when it differs, so that the first sync after an upgrade can recognise an unchanged model. Both values are excluded from the public projection.
- **Upgrade path.** On the first sync after the upgrade, each model whose stored hash matches the configured hash (or its pre-change hash) gets a `record-baseline` operation. Recording baselines alone does not advance the published-state version and does not request a build. If the hashes differ and no baseline exists, sync keeps today's strict refusal. The diagnostic tells the operator to restore the previous definition, sync, and then apply the change.
- **Structural diff and classification.** For each model, sync compares the baseline with the configured structure for fields, the block allowlist, the allowed block definitions and the path or route. Each difference gets one of the classes `compatible`, `display`, `validated`, `destructive`, `breaking` or `migration`, following the roadmap's classification table. The model key and version are identity, not structure. A structural change still requires a version increase.
- **Data-aware decisions.** When a model has snapshots, sync scans their stored values in bounded pages through a new repository read operation. It does this only for changes whose outcome depends on data:
  - **Validated changes** (tightened limits, removed `select` options, optional → required) are applied only when every stored value satisfies them. Otherwise sync refuses and names up to 20 offending snapshots plus the total.
  - **Removals** of a field, an allowed block type or a changed block definition are applied only when no snapshot holds that data. Otherwise sync refuses with a destructive or migration diagnostic. Hints arrive in CE1B and migrations in CE1C.
  - **Breaking changes** are refused as before: field type changes always, and path or route changes while the model has published entries.
- **Default backfill.** A field that is added with a `defaultValue`, or that newly gains one, is written into every draft and published snapshot of the model that lacks the field. This happens in the same guarded mutation that records the new model state. The mutation advances `published_state.version` and coalesces one build request. Backfill does not change snapshot revisions, audit columns or timestamps. Media-field defaults cannot be backfilled and are refused.
- **Snapshot fingerprint guard.** The stored model summary gains a per-model snapshot fingerprint (count, revision sum, update-time sum and maximum). A draft save, publication or deletion between planning and apply therefore makes the plan stale on both runtimes.
- **Reports.** The text and JSON reports and `--check` list, per model, each change with its class, the affected draft and published counts and the planned writes (baseline, backfills). They list new diagnostics with stable codes. `--check` still never writes.
- **Architecture.** Section 4.7 (sync may rewrite the stored representation of published snapshots, bumping the published version and requesting a build atomically), section 8 *Configuration projection* (classification replaces the blanket refusal), section 9.1 (new columns) and section 9.3. ADR 0007 records the decision.

Non-goals: field-level `renamedFrom`, `removedFields` and `removedBlocks` hints and data pruning (CE1B); block data migrations, `defineBlock({ migrations })`, draft revision bumps and media-reference rebuilding (CE1C); route changes; admin UI changes; a general content-migration runner.

## Capabilities

### New Capabilities
- `schema-evolution`: structural diff between the stored baseline and the configured model, change classes, data-dependent validation through bounded snapshot scans, and default backfill semantics.

### Modified Capabilities
- `configuration-synchronization`: the planner classifies structural changes instead of refusing every change while snapshots exist, adds the `record-baseline` operation, the baseline upgrade path, the snapshot fingerprint in stored state and the extended reports. Publication-version advancement excludes baseline-only applies.
- `content-model-configuration`: the structural identity strips display metadata only at definition level, and runtime models carry their canonical structure and pre-change hash.
- `sqlite-schema-and-migrations`: `content_models` stores the structure baseline and the hash it was written with.
- `node-content-repositories`: the Node adapter provides the bounded snapshot scan, writes baselines and backfills in its synchronization transaction, and guards on snapshot fingerprints.
- `d1-content-repositories`: the D1 adapter provides the same scan and performs baselines and backfills inside its single guarded synchronization batch.
- `operational-cli`: `lace content sync` and `--check` report change classes, affected counts and planned writes. The first run after the upgrade reports pending baselines.

## Impact

- **Packages.**
  - `@lacecms/config`: canonical model structure, precise display stripping, `structure` and `legacyStructureHash` on runtime models.
  - `@lacecms/application`: structure diff and classification, scan evaluation, extended plan, report and ports.
  - `@lacecms/db`: schema, migration `0005`, stored-state SQL with the baseline and fingerprint.
  - `@lacecms/platform-node` and `@lacecms/platform-cloudflare`: snapshot scan, baseline and backfill writes.
  - `@lacecms/test-utils`: repository contract cases.
  - `@lacecms/cli`: report output.
- **Database.** Additive migration `0005`: two nullable columns on `content_models`. Older engines ignore them. A baseline written before an older engine changes the hash becomes invalid by construction, not stale.
- **Operations.** After upgrading, the first `lace content sync --check` reports pending `record-baseline` operations. Running `lace content sync` once records them without triggering a build. Models whose fields were named `label` or `description` get a new structural hash that the upgrade path accepts automatically.
- **APIs.** No REST or public contract change. The JSON sync report gains fields; existing fields keep their meaning.
