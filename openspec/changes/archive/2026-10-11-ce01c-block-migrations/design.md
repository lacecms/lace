## Context

See proposal.md for the motivation. These parts of the CE1A/CE1B state shape the design:

- **Block definitions.** `@lacecms/content#defineBlock` returns a frozen definition with `validate`. `toBlockMetadata` projects it to JSON-safe metadata. `@lacecms/config#contentModelStructure` embeds that metadata (`blockDefinitions`) in every model structure that allows the type. A block change therefore changes the structure hash of every allowing model, and each such model needs a version bump.
- **Diff and evidence.** `diffContentModelStructures` reports `migration`/`block-definition-changed` for a shared type whose definition differs. `decideEvolution` refuses it when `blockHolders` count any snapshot holding the type (`BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`).
- **Snapshot scan.** `readConfigurationSyncSnapshots` returns block summaries without data, ordered by snapshot ID.
- **Apply.** `applyPreparedConfigurationSynchronization` calls `applyConfigurationSynchronization` once. Each adapter re-plans from the supplied evidence and compares plan JSON. It then runs one guarded transaction (Node) or one guarded batch (D1). That covers the identity, the baseline, the CE1B write list, the published-state bump and build coalescing. Every `version-update` advances public state.
- **Snapshot rows.** A published snapshot is its own row, copied from the draft with the same `revision`. Entry status is `published` when `p.revision = d.revision`, else `changed`. Draft saves increment the revision and replace blocks and references. Published rows change only through republication (a new row) or sync.
- **Media references.** `content_media_references(snapshot_id, source_key, field_path, media_id)`, where `source_key` is the block key for block fields. On D1 they are inserted through `select … from media where status = 'active'`, so a missing or inactive media ID fails the batch.
- **D1 limits.** `D1_MAX_BATCH_STATEMENTS = 40` and `D1_MAX_BOUND_PARAMETERS = 100`. Each bound value may hold up to one block's data (at most 1,000,000 bytes).
- **CLI configuration.** `lace content sync` (`packages/cli/src/commands.ts`), `pnpm content:sync` (`apps/api/src/content-sync-cli.ts` → `runLocalContentSync`) and the local Cloudflare preparation (`apps/api/src/cloudflare-local.ts`) pass only `config.runtime.content`. The executable registry lives in `config.runtime.blocks`.

## Goals / Non-Goals

**Goals:**
- One pure function computes the migrated form of an entry. The dry run uses it to build evidence, and apply uses it to build the writes, so `--check` and apply cannot disagree on deterministic migrations.
- Plan decisions stay derivable from evidence alone, so adapters re-plan without executables.
- Resumable writes whose guards make a repeated or concurrent unit a no-op.
- Identical row results on Node and D1.

**Non-Goals:**
- Atomicity of the whole migration with the final mutation (see decision 6).
- Validating intermediate versions.
- Migrating archived or orphaned snapshots that no entry references. Only current drafts and published snapshots exist in the schema.

## Decisions

### 1. DSL: `migrations` on `defineBlock`, composition in `@lacecms/content`

`BlockDefinitionInput` gains:

```ts
migrations?: Readonly<Record<number, (data: JsonObject) => JsonObject>>
```

`defineBlock` validates the map:
- keys are canonical decimal integers;
- the keys form a contiguous range `[k … version]` with `k ≥ 2`;
- each value is a function;
- a version 1 block declares no migrations.

It keeps a frozen copy on the runtime `BlockDefinition` as `migrations`. `toBlockMetadata` already lists properties explicitly, so migrations never reach metadata, structure, hashes or the admin and public projections.

`migrateBlockData(definition, data, fromVersion)` returns the data at `definition.version`, or throws `BlockMigrationError` with one of these codes:
- `missing_step` (`fromVersion + 1 < k`);
- `version_ahead`;
- `migration_failed` (a throw);
- `invalid_result` (not a plain JSON object, a promise, or a non-JSON value).

The error carries `fromVersion`, `toVersion` and the failing `step`. Each step receives a deep-frozen, normalized copy of its input, and each result passes through the existing JSON normalization. Validation against the final definition stays the caller's job (`validateBlockData`).

The render core keeps its strict version check and gains nothing.

*Alternatives:*
- Keep previous definitions so intermediate results can be validated. Rejected: it makes users carry every historical schema.
- Async migrations. Rejected: owner decision and D1 batch design.

### 2. Planning input gains the registry; evidence gains migration findings

`prepareConfigurationSynchronization({ models, blocks, state })` and `applyPreparedConfigurationSynchronization` take the `BlockRegistry`. `blocks` stays optional for callers that never migrate; a migration scan without it fails with a configuration error. When it is supplied, preparation fails before any read when a configured model allows a type absent from the registry.

The diff adds `version: { from, to }` (baseline and configured block versions) to each `block-definition-changed` change; decided changes do not repeat it. For each populated model whose `block-definition-changed` change has a configured `version` greater than the baseline `version`, a **migration request** `{ modelKey, types: [{ type, version }] }` is added next to the existing scan request.

The migration scan pages entries (decision 4). For every page it runs `planEntryMigration` (decision 3) and folds the results into `ModelSnapshotEvidence.migrations[type]`:

```ts
{
  toVersion: number;
  fromVersions: number[];                      // sorted, distinct
  blocks: number;
  snapshots: SnapshotStateCounts;
  failed: BlockFindings;                       // BLOCK_MIGRATION_FAILED
  invalid: BlockFindings;                      // BLOCK_MIGRATION_INVALID
  missing: BlockFindings;                      // BLOCK_MIGRATION_MISSING
  ahead: BlockFindings;                        // BLOCK_VERSION_AHEAD
}
```

`BlockFindings` hold a count and up to 20 references. A reference is `ConfigurationSyncSnapshotReference` extended with optional `blockKey`, `schemaVersion` and, for invalid results, `path` and `reason`.

Both scans are bound to the same fingerprint. `decideEvolution` decides `block-definition-changed` as follows:
- **Same version, any holder:** refuse with `BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`. The new message says "increase the block version and declare migrations".
- A decreased version is scanned like an increase; blocks above the configured version are reported as `ahead`.
- **Version increased or decreased:** every non-empty finding group (missing, ahead, failed, invalid) refuses with its own diagnostic. When no finding refuses and `blocks > 0`, push `{ blockType, toVersion, fromVersions, draft, published, blocks }` to `evolution.migrations` (sorted by type, present only when non-empty). Decided changes carry `migration: { from: fromVersions, to }`.

The adapters' re-plan reads only evidence, so it needs no registry.

### 3. One pure unit planner: `planEntryMigration`

`planEntryMigration(entry, targets, registry, migratedAt)` lives in `@lacecms/application` and works on one migration-scan entry. For each current snapshot it:
1. selects blocks of a target type whose `schemaVersion !== toVersion`;
2. runs `migrateBlockData`;
3. validates with `validateBlockData(definition, result, state === "published" ? "publish" : "draft")` and checks `canonicalJsonByteLength ≤ MAX_JSON_BYTES`;
4. collects the media references of the migrated blocks' media fields;
5. checks that every collected media ID is in the snapshot's prior media IDs and that `prior references − migrated blocks' prior references + new references ≤ 200`.

It returns either findings or an `EntryMigrationUnit`:

```ts
{
  entryId;
  snapshots: [{                                // published first
    snapshotId; state;
    expectedRevision; revision;
    draftGuard?: { snapshotId; revision };     // published following the draft
    blocks: [{ key; expectedSchemaVersion; schemaVersion; data }];
    references: [{ sourceKey; fieldPath; mediaId }];
    updatedAt; updatedBy?;                     // drafts only
  }];
}
```

**Revision rule.** The draft gets `revision = d + 1` and `updatedBy = system:content-sync`. The published snapshot gets `revision = d + 1` with a `draftGuard` when `p = d`; otherwise it keeps `p`. A snapshot without stale blocks is not in the unit. When `p = d` the two snapshots hold identical blocks, so both are in the unit.

**Why published first.** If a D1 split commits the published half and stops, the state is `p = d + 1` and the draft is still stale at `d`. The rerun gives the draft `d + 1` and status returns to `published`. In the opposite order, an interruption would leave `d + 1 > p` with no stale published blocks, and the status would wrongly stay `changed`.

### 4. Ports and shared SQL

`ConfigurationSyncStateReadPort` gains:

```ts
readConfigurationSyncMigrationEntries({ modelKey, types: [{ type, version }], after?, limit ≤ 50 })
```

It returns `{ items: ConfigurationSyncMigrationEntry[], next? }`. `ConfigurationSyncApplyPort` gains:

```ts
applyConfigurationSyncBlockMigrations({ migratedAt, modelKey, units })
```

It returns `{ status: "applied", drafts, published, blocks }` or throws the stale error.

The shared SQL lives in `@lacecms/db` (`sql-content.ts`).

**Entry page.** The page query selects `content_entries` of the model with `id > ?`. It requires `exists` a block in the entry's current draft or published snapshot whose `(block_type, schema_version)` mismatches a target from `json_each(?)` (one JSON parameter `[[type, version], …]`). Rows are ordered by `id` with `limit ?`. Snapshots, blocks and references then load with the existing chunked `in (…)` reads. Block data is selected only for target types: `case when block_type in (select …) then data_json end`.

**Unit guard condition.** This is one SQL condition per snapshot:
- `exists (select 1 from content_snapshots s join content_entries e on e.id = s.entry_id where s.id = ? and s.revision = ? and (e.draft_snapshot_id = s.id or e.published_snapshot_id = s.id))`;
- the count of blocks matching `json_each(?)` `[key, expectedVersion]` pairs equals `?`;
- an optional draft revision check for `draftGuard`.

**Writes per snapshot.** Each list is order-preserving and every statement ends in a `where` clause:
- `update content_blocks set schema_version = v.column2, data_json = v.column3, updated_at = ? from (values (?, ?, ?, ?), …) v where content_blocks.snapshot_id = ? and content_blocks.block_key = v.column1 and content_blocks.schema_version = v.column4`, chunked to stay within 100 parameters;
- `delete from content_media_references where snapshot_id = ? and source_key in (select value ->> 0 from json_each(?))`;
- reference inserts through `select … (select m.id from media m where m.id = ? and m.status = 'active')`, so an inactive ID fails the unit;
- the snapshot `update` of revision, update time and, for drafts, `updated_by`.

`UPDATE … FROM` needs SQLite 3.33 and `->>` needs 3.38. Both are already required by CE1B.

**Node** runs, per unit, `transaction(() => { assert guard select returns 1 for every snapshot; run statements })`. A failed guard throws the stale error, which rolls back that unit only.

**D1** builds batches greedily from whole units while the batch stays within 40 statements. A unit that cannot fit alone is split into a published-snapshot part followed by a draft part, each in its own batch. Each batch is laid out in three groups:
1. it opens with one `insert into mutation_guards … where <condition>` per unit part;
2. every write statement follows, each ending in `and (select count(*) from mutation_guards where token in (…)) = <n>`, so one false guard disables every write of the batch;
3. it closes with unconditional guard releases.

After the batch, the adapter checks every guard insert's `changes`. If any is 0, it throws the stale error and does not send later batches. A combined condition was chosen over per-unit conditions because a stale unit must stop the sync, not be skipped while its neighbours commit.

### 5. Two-phase orchestration

`applyPreparedConfigurationSynchronization({ clock, ids, models, blocks, prepared, target })` runs in this order:
1. Reject an invalid plan.
2. **Migration phase.** For each operation whose evolution has `migrations`, keyed by the stored (former) model key, page through `readConfigurationSyncMigrationEntries`. For each entry it calls `planEntryMigration`. Any finding throws `CONTENT_INVALID_STATE`, "Block migration result changed since planning; rerun synchronization". Committed units stay. The units are sent page by page to `applyConfigurationSyncBlockMigrations`, and the counts are summed.
3. **Re-prepare.** Call `prepareConfigurationSynchronization` again. It must be valid and contain no `migrations`. Its JSON with `migrations` removed must equal the reviewed plan's JSON with `migrations` removed. Otherwise the phase throws the stale error. Counts in `affected` and `snapshots` are unaffected by migration, because holders count every version and revisions are not part of evidence counts.
4. **Final mutation.** Call `applyConfigurationSynchronization` with the fresh plan and evidence. The result gains `migrated?: { drafts, published, blocks }`.

When the plan has no migrations, steps 2 and 3 are skipped. CE1A/CE1B behaviour is then byte-identical.

**Interruption.** The final mutation is reached only after every stale block has been migrated, and it is the only step that writes the baseline. A rerun therefore sees the same `block-definition-changed` diff, migrates the remainder, and applies the identical final mutation. The final mutation is a `version-update`, so it advances public state and coalesces one build. This happens even when the migration phase ran in an earlier, interrupted run.

### 6. Migration writes precede the final mutation (not atomic with it)

The roadmap requires resumable, chunked D1 writes. A single D1 batch cannot rewrite an unbounded number of snapshots. Node could do everything in one transaction, but parity and one tested failure model matter more. Both runtimes therefore use the same phases.

**Consequence.** Between the migration phase and the final mutation, public reads may return migrated published blocks while `published_state.version` is unchanged. Architecture section 4.7 and ADR 0007 record this exception. The window ends with the final mutation of the same run, or of the rerun after an interruption. Site code deployed with the new definitions already cannot render the old blocks, so the window does not make public output worse.

*Alternative:* migrate inside the final mutation on Node and in chunks on D1. Rejected: the runtimes would diverge in failure behavior and in tests.

### 7. Reports and CLI

- **Change line.** Example: `migration block-definition-changed block hero (version 1 -> 3; affected: draft=2, published=1)`.
- **Evolution line.** Example: `planned block migrations: hero 1 -> 3 (draft=2, published=1, blocks=5)`. Multiple source versions are listed as `1,2 -> 3`.
- **Diagnostics.** They list block references as `draft <entryId> "<title>" block <key> v<stored>`, followed by ` at <path>: <reason>` for invalid results.
- **JSON.** `evolution.migrations` and `change.migration` are present only when set, so CE1A/CE1B JSON is unchanged.

`lace content sync` loads `config.runtime.blocks` next to `config.runtime.content` (`projectModels` → `projectConfiguration`). It passes the registry to prepare and apply, and appends `Migrated blocks: N (drafts=…, published=…).` when N > 0. The JSON `data` gains `migrated`. `runLocalContentSync` and `cloudflare-local.ts` receive `blocks`. A stale error during migration keeps the existing "Sync plan is stale. Rerun …" path.

### 8. Documentation of versioned blocks

The documentation is updated in these places:
- **`docs/configuration-synchronization.md`:** a new "Block migrations (CE1C)" section covering the DSL, the chain rules, the dry run, the revision rule, resumability, the public window and the operator steps.
- **Architecture:**
  - section 4.7, the exception;
  - section 8, the migration table row and paragraph;
  - section 11, the "optional data migration functions" contract;
  - section 22, `schema_version` migrations through sync only.
- **ADR 0007:** a CE1C addendum.
- **`packages/cli/README.md` (`lace add block`):** a registry component targets one `blockVersion`. A project that versions a built-in or custom block owns its component, so it writes the component itself or scaffolds the custom block, and ships migrations in `lace.config.ts`.
- **Starter template `docs/lace-operations.md`** ("Configuration, routes, renderers and styling"): a worked `defineBlock` example with `version: 2` and `migrations: { 2: … }`, and the bump-sync-build order.
- **Roadmap session log:** CE1C marked done and CE1 complete.

### 9. Package boundaries

- `content`: the DSL and `migrateBlockData`.
- `config`: no change apart from passing migrations through.
- `application`: the planner, the units, orchestration and reports.
- `db`: SQL.
- Adapters: execution.
- `cli`/`apps/api`: wiring.

No new dependency edges. `application` already depends on `content` and `config`.

## Risks / Trade-offs

- [A non-deterministic migration differs between the dry run and apply] → Apply re-validates every unit with the same function before writing and stops on any finding. Units committed earlier are valid results. The docs require pure functions.
- [An interrupted sync leaves migrated published blocks under the old published version] → Rerun guidance in the CLI message and docs. The window is short and documented (decision 6).
- [Editors who had the admin open lose unsaved edits] → They get a revision conflict instead of overwriting migrated data. This is the intended outcome. The docs say to deploy and sync in a quiet window.
- [A deploy-to-sync window in which drafts with old blocks cannot be saved (`stale_block_version`)] → This is existing behaviour for every block change. The docs order is deploy, then sync immediately.
- [A large D1 sync is slow] → Bounded pages of 50 entries and greedy batching. The CLI runs outside the Worker query budget.
- [Every allowing model must bump its version for one block change] → This keeps the existing identity rule (non-goal). The diagnostic `STRUCTURE_CHANGE_NEEDS_VERSION_BUMP` already names each model.
- [Restricting migrations to already-referenced media] → Migrations cannot introduce new assets. Such a change is an editorial action, not a schema migration, and the rule avoids a media read port.

## Migration Plan

No schema migration. Deploy the engine. Configurations without `migrations` behave exactly as in CE1B.

To change a used block:
1. Bump the block `version`, add `migrations`, update the site component, and bump the version of every model that allows the block.
2. Run `lace content sync --check` and review the planned migrations.
3. Deploy, then run `lace content sync` in each environment. If it stops, rerun it.
4. Keep the migrations for as long as any environment may still hold older blocks. Removing them is safe only after every environment has synchronized.

**Rollback.** An older engine rejects the unknown `migrations` option, so remove migrations before downgrading. Migrated rows stay at the new version.
