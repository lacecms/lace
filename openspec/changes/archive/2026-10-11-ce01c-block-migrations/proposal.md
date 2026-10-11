## Why

After CE1A and CE1B, `lace content sync` can add, tighten, rename and remove model fields and block types on a populated site. It still refuses every change to the definition of a block type that stored drafts or published snapshots use (`BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`). The render core rejects a block whose stored `schemaVersion` differs from the site's definition. A project therefore cannot evolve a block, for example by renaming a block field or splitting one field into two, without manual database work. The architecture already lists "optional data migration functions" in the block registry (section 11) but nothing implements them.

This change implements roadmap step **CE1 — Schema evolution and block migrations**, session unit **CE1C — Block migrations** ([content and editor roadmap](../../../docs/content-editor-roadmap.md), section 5, owner decision 1). It builds on the CE1A baseline, classification and bounded scan and on the CE1B write list. It completes step CE1.

## What Changes

- **Block migrations in the DSL.** `defineBlock({ version, migrations })` accepts `migrations`, a map from each target version to a pure, synchronous function. Each function receives the data of the previous version and returns the data of its target version. Static rules:
  - keys must form one contiguous range that ends at `version`;
  - a version 1 block declares no migrations;
  - each value must be a function.

  Migrations are runtime-only executable values, like `validate`. They are excluded from block metadata, the canonical structure, both hashes and the public projection.
- **Chain composition and missing steps.** For each stored block, sync composes the chain from its stored `schemaVersion` to the configured version. A stored version that the declared range does not reach is a configuration error (`BLOCK_MIGRATION_MISSING`). A stored version above the configured version is refused (`BLOCK_VERSION_AHEAD`). A definition change without a version increase on a used block type is still refused (`BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`). Its message now tells the operator to increase the version and declare migrations.
- **Dry run with validation.** Planning executes every needed migration in memory over every stale block of the model, in bounded entry pages.
  - Each result is validated against the configured definition: publish mode for published snapshots and draft mode for drafts. The checks also cover the block size limit and the snapshot's media-reference limit.
  - A migration may reference only media that the same snapshot already referenced.
  - A throw, a non-JSON or non-object result, or a failed validation refuses the whole plan (`BLOCK_MIGRATION_FAILED`, `BLOCK_MIGRATION_INVALID`). The diagnostic names the model, entry, state, block key and versions. Nothing is written.
  - `--check` runs this dry run and reports planned block migrations with counts.
- **Resumable migration phase.** Apply first migrates stale blocks in units of one entry. Each unit:
  - updates only the migrated blocks in place;
  - rebuilds those blocks' `content_media_references`;
  - increments the draft revision with the actor `system:content-sync`, so an open editor gets a revision conflict.

  A published snapshot that was in sync with its draft takes the same new revision, so entry status never changes. Other published snapshots keep their revision. Each snapshot write is guarded on:
  - the snapshot's revision;
  - the snapshot still being the entry's current draft or published snapshot;
  - each migrated block's stored `schema_version`.

  When the published revision follows the draft revision, the guard also checks the draft revision. A repeated or interrupted sync migrates only the blocks still stale, so it is resumable.
- **Final mutation.** After the migration phase, sync prepares the plan again from fresh state. It applies the plan only when the fresh plan is valid, has no stale blocks left, and equals the reviewed plan apart from the planned migrations. The final mutation runs through the existing guarded atomic apply. It records the new identity and baseline and performs the CE1B writes. Because the plan contains a version update, it bumps `published_state.version` and coalesces one build request.
- **Ports.**
  - A read operation returns bounded entry pages of a model that hold blocks of given types at a stale version. Each page includes the stored block data and the snapshot media references.
  - A write operation applies the guarded per-entry migration writes. Node commits each entry in one transaction. D1 packs whole entries into guarded batches within its statement and parameter budgets, and it splits an oversized entry into a published batch followed by a draft batch.
- **Reports and CLI.** The text and JSON reports and `--check` add the following for each migrated block type:
  - the configured version and the stored versions;
  - the snapshot and block counts per state;
  - a `planned block migrations` line.

  `lace content sync`, `pnpm content:sync` and the local Cloudflare preparation load the configured block registry. They print the migrated counts after apply.
- **Architecture and docs.**
  - Architecture sections 4.7, 8, 11 and 22.
  - A CE1C addendum to ADR 0007.
  - `docs/configuration-synchronization.md`.
  - The `lace add block` and starter-block documentation: how a versioned block ships migrations and why registry components target one block version.
  - The roadmap session log.

Non-goals:
- Lazy migration at read or render time. The render core stays strict.
- Asynchronous migrations.
- Migrations that read other entries or media.
- Relaxing the rule that a model version bump is required when an allowed block definition changes.
- Migrating fields inside blocks through CE1B hints.
- Keeping historical block definitions to validate intermediate versions.
- Admin UI changes.
- Changing the registry's block components.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `block-registry`: block definitions accept, validate and expose runtime-only migrations.
- `schema-evolution`:
  - a `migration` change is applied through a block version increase and a complete migration chain;
  - a new requirement covers the dry run, validation, refusals and the guarded resumable rewrite of stale blocks;
  - the bounded-scan requirement adds the entry-oriented migration scan.
- `configuration-synchronization`:
  - apply runs the migration phase before the final guarded mutation;
  - plans and reports carry planned block migrations;
  - planning needs the executable block registry.
- `node-content-repositories`: the migration page read and guarded per-entry migration transactions.
- `d1-content-repositories`: the migration page read and guarded, budget-chunked migration batches.
- `operational-cli`: `lace content sync` loads the block registry, runs block migrations, reports migrated counts and can be rerun after an interruption.

## Impact

- **Packages.**
  - `@lacecms/content`:
    - the `migrations` option and its validation;
    - `migrateBlockData`;
    - exclusion of migrations from metadata.
  - `@lacecms/config`: carries migrations through the runtime registry unchanged; the structure and hashes are unaffected.
  - `@lacecms/application`:
    - the migration accumulator and planner decisions;
    - the new diagnostics and the report lines;
    - the two-phase apply orchestration and the new port types.
  - `@lacecms/db`: shared SQL for the migration page read and guarded block, reference and revision writes.
  - `@lacecms/platform-node` and `@lacecms/platform-cloudflare`: the new port operations, plus registry wiring in `runLocalContentSync`.
  - `@lacecms/cli` and `apps/api`: registry loading and output.
  - `@lacecms/test-utils`: contract cases on both runtimes.
- **Database.** No schema migration. Writes use existing columns. JSON functions require SQLite 3.38 or later, which CE1B already requires.
- **Operations.** Changing a used block becomes:
  1. bump the block version and add migrations;
  2. bump the version of every model that allows the block;
  3. run `lace content sync --check`;
  4. run `lace content sync` immediately after deploying.

  An interrupted sync is rerun. Between the migration phase and the final mutation, public reads can see migrated published blocks under the previous published version. The window ends with the final mutation.
- **APIs.** No REST or public contract change. The sync JSON report gains optional fields. `ConfigurationSyncStateReadPort` gains a read operation, and the apply target gains a write operation; both are implemented by the two repositories.
