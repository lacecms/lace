## Why

After CE1A, `lace content sync` can evolve a populated model, but it still refuses to remove a field or a block type while any draft or published snapshot holds that data, and it cannot rename a field at all: a key change is one removal plus one addition, so the removal is refused and the stored values would be lost anyway. Operators therefore still need manual database work to rename or drop a field on a live site. The architecture forbids guessing, so sync needs an explicit, reviewable declaration for each destructive change.

This change implements roadmap step **CE1 — Schema evolution and block migrations**, session unit **CE1B — Field rename and removal hints** ([content and editor roadmap](../../../docs/content-editor-roadmap.md), section 5, owner decision 2). It builds on the CE1A baseline, classification and snapshot scan. CE1C (block migrations) follows separately.

## What Changes

- **Field rename hint.** Every `field.*` builder accepts `renamedFrom: "<former key>"`. It is valid only on model fields. `defineBlock` rejects it, because block data changes use block migrations (CE1C). Model normalization moves the hints into a runtime-only `renamedFields` map (current key → former key) and removes them from the field definitions, so field metadata, validators and the admin projection are unchanged.
- **Removal hints.** `definePage` and `defineCollection` accept `removedFields: string[]` and `removedBlocks: string[]`.
- **Static validation.** Configuration normalization rejects hints that are malformed or contradict the configuration itself:
  - a field renamed from its own key, from another configured field, or from a former key that two fields share;
  - a removed field that is still configured or is also a rename source;
  - a removed block type that is still allowed, or a duplicated entry.
- **Hints are temporary metadata.** Like the model-level `renamedFrom`, the hints are excluded from the canonical structure, the structural and projection hashes and the public projection. Adding or removing a hint alone is therefore never a structural change and never needs a version bump. Hints are documented as temporary: they are removed after all environments have synchronized.
- **Baseline validation.** Hints are evaluated only when a model's structure changed and a valid baseline exists.
  - A rename applies when the former key is in the baseline and the new key is not.
  - A rename whose new key is already in the baseline and whose former key is not was already applied, so it is inert.
  - A rename where both keys are in the baseline is refused (`FIELD_RENAME_TARGET_EXISTS`).
  - A rename where neither key is in the baseline is refused (`FIELD_RENAME_SOURCE_MISSING`).
  - A removal hint for a key or block type absent from the baseline is inert.
- **Classification.** A hinted rename becomes one `destructive` `field-renamed` change on the new key, naming its former key. The former and new definitions are compared like any existing field, so a type change on rename is still `breaking` and a tightened constraint is still `validated` against the moved values. Hinted removals keep their CE1A kinds and are marked as hinted.
- **Data movement.** In the same guarded atomic mutation that records the new model state, sync:
  - moves a renamed field's value in every draft and published snapshot of the model;
  - prunes hinted removed fields;
  - drops stored blocks of hinted removed block types;
  - maintains `content_media_references` for every rewritten snapshot. Media references move with a renamed field, and they are deleted with a pruned media field or a dropped block, so media usage and the deletion guard stay correct.

  Writes are set-based and revision-neutral, like the CE1A backfill. Backfills run after renames, so a renamed field that gains a default keeps its moved values.
- **Refusals without hints.** Removing a field or a block type that stored data uses is still refused. The diagnostic now names up to 20 affected snapshots and the total, and tells the operator which hint to declare. A rename whose new key already holds data in a stored snapshot is refused (`FIELD_RENAME_TARGET_HAS_DATA`).
- **Reports.** The text and JSON reports and `--check` show renames with their former key and moved counts, plus the planned renames, field removals and block removals next to the planned backfills.
- **Architecture and docs.** Architecture section 8 *Configuration projection* (hints and the destructive rows of the classification table), `docs/configuration-synchronization.md` and the roadmap session log are updated.

Non-goals: block data migrations, `defineBlock({ migrations })` and draft revision bumps (CE1C); renaming or removing fields inside blocks; route changes; admin UI changes; inferring renames.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `schema-evolution`:
  - classification of hinted renames and removals;
  - validation of hints against the baseline;
  - data movement and pruning with media-reference maintenance;
  - refusals that name snapshots and the missing hint.
- `configuration-synchronization`: field renames and removals are never inferred, and reports list planned renames and removals.
- `content-model-configuration`:
  - the `removedFields` and `removedBlocks` model options and static validation of all hints;
  - hints are excluded from structure, hashes and the public projection and are kept on runtime models.
- `field-descriptors`: field builders accept and normalize the `renamedFrom` option.
- `block-registry`: block definitions reject fields that declare `renamedFrom`.
- `node-content-repositories`: the synchronization transaction performs renames, prunes, block removals and media-reference maintenance.
- `d1-content-repositories`: the guarded synchronization batch performs the same writes as guarded set-based statements.

## Impact

- **Packages.**
  - `@lacecms/content`: the `renamedFrom` field option, and its rejection in block fields.
  - `@lacecms/config`: hint options, validation, the runtime `renamedFields`/`removedFields`/`removedBlocks`, and stripping from hashes and the projection.
  - `@lacecms/application`: hint-aware diff and hint validation, evidence with named holders and transformed values, planner decisions, write list and reports.
  - `@lacecms/db`: shared set-based rename, prune and block-removal SQL with media-reference maintenance.
  - `@lacecms/platform-node` and `@lacecms/platform-cloudflare`: apply writes.
  - `@lacecms/test-utils`: repository contract cases on both runtimes.
- **Database.** No migration. Existing columns are rewritten through JSON functions available on SQLite 3.38+ (Node's bundled SQLite and D1).
- **Operations.** Renaming or removing a populated field or block type becomes a reviewed configuration change followed by `lace content sync`. Hints stay in configuration until every environment has synchronized.
- **APIs.** No REST or public contract change. The sync JSON report gains optional fields; existing fields keep their meaning.
