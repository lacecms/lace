## Context

See proposal.md for motivation. The CE1A state that shapes this design:

- `@lacecms/config` normalizes models. The model-level `renamedFrom` is
  temporary metadata: `modelForHash`, `normalizedModelForHash` and
  `publicModel` strip it, so it never enters the structure, the hashes or the
  public projection.
- `@lacecms/application/configuration-evolution.ts` diffs the baseline
  structure against the configured structure (`diffContentModelStructures`) and
  folds bounded scan pages into `ModelSnapshotEvidence`.
  `configuration-sync.ts#decideEvolution` turns the changes plus the evidence
  into decided changes, diagnostics and planned backfills.
- Both adapters re-plan inside apply with the supplied evidence. They then run
  the identity update and one set-based `backfillFieldSql` statement per field.
  D1 appends `and <guard>` to every statement of its single batch.
- `content_media_references(snapshot_id, source_key, field_path, media_id)`
  holds one row per media-valued field. `source_key` is `$fields` for model
  fields or the block key. `field_path` is the top-level field key. Media usage
  and the deletion guard derive from these rows.
- Block positions only need to be positive and strictly increasing per
  snapshot. Gaps are valid.
- Draft status compares draft and published revisions
  (`ENTRY_STATUS_SQL`).

## Goals / Non-Goals

**Goals:**
- Hints that are plain configuration data and are excluded from identity, so
  adding or removing a hint never needs a version bump.
- One pure decision path. The diff applies hints and the planner decides. Both
  runtimes execute the same ordered write list.
- Set-based, revision-neutral rewrites with exact media-reference maintenance
  in the existing guarded mutation, on both runtimes.

**Non-Goals:**
- Per-snapshot guarded rewrites, draft revision bumps and block-data
  transformation (CE1C).
- Hints for fields inside blocks.
- Reporting inert hints.

## Decisions

### 1. Field hint is a builder option, extracted into a runtime-only model map

`@lacecms/content` accepts `renamedFrom` in every `field.*` builder through the
common options. It validates the value with the field-key pattern and keeps it
on the returned definition. `defineBlock#normalizeBlockFields` rejects a field
that carries it.

`@lacecms/config#normalizeFields` removes `renamedFrom` from each field
definition and collects it into `renamedFields: { [newKey]: formerKey }` on the
normalized model. Field definitions, validators, `FieldMetadata` and the admin
projection therefore keep their exact CE1A shape. `normalizeCommonModel` also
normalizes `removedFields` and `removedBlocks` into sorted, frozen arrays, and
it performs the static checks from the content-model-configuration delta.
`modelForHash`, `normalizedModelForHash` and `publicModel` strip all three
properties, as they strip the model-level `renamedFrom`. The properties appear
on the runtime model only when they are non-empty.

*Alternatives:*
- (a) A model-level `renamedFields` map in user configuration. It is less local
  than the roadmap's field-level option, and the user would have to repeat the
  new key. Rejected.
- (b) Keep `renamedFrom` inside runtime field definitions and strip it at every
  consumer: the structure, both hashes, the projection and admin metadata.
  Rejected: every consumer would need to know about the hint, and the risk of
  leaking it into a hash is high.

### 2. The diff applies hints; hint validation is a separate pure check

`diffContentModelStructures(baseline, target, hints?)` takes
`{renamedFields, removedFields, removedBlocks}`.

**Rename resolution.** For each `new → former` pair where `former` is in the
baseline fields and `new` is not, the diff:
- emits `{class: "destructive", kind: "field-renamed", target: new, from: former}`;
- compares `baseline[former]` with `target[new]` through the existing
  `compareField`, so a type change is `breaking` and a tightened constraint is
  `validated` on `new`;
- excludes `former` from removals and `new` from additions.

**Removals.** A `field-removed` change whose key is in `removedFields`, and a
`block-type-removed` change whose type is in `removedBlocks`, gain
`hinted: true`.

**Inert hints.** Every other hint produces nothing.

**Hint validation.** `validateStructureHints(baseline, hints)` returns the
rename pairs with both keys in the baseline (`FIELD_RENAME_TARGET_EXISTS`) or
neither key in the baseline (`FIELD_RENAME_SOURCE_MISSING`). The planner calls
it only on the diff path: structure changed, a baseline exists, and the
configured model has a structure. It emits the diagnostics whether or not the
model has snapshots, so a configuration error does not depend on data. A model
rename passes the former model's stored baseline, so field hints resolve
against the former structure.

*Alternative:* encode hint errors as `breaking` changes. Rejected: they are
configuration mistakes, not structural differences. Mixing them into the change
list would also make empty models silently accept them.

### 3. Evidence: transformed values and named holders

`ModelSnapshotEvidence.fieldHolders` and `blockHolders` keep their counts and
gain `snapshots` (up to 20 references). Holder keys are:
- for fields: removed keys, rename sources (counted as moved) and rename
  targets (any holder is a conflict);
- for blocks: non-compatible block changes, as in CE1A.

For each scanned snapshot, the accumulator builds the transformed field record
in apply order:
1. move rename sources to their targets;
2. delete removed keys;
3. add backfilled defaults.

It then validates `validated` changes against the transformed record and
checks the size limit whenever a rename or backfill touched the record.
Removals only shrink a record, so they cannot trigger the limit.

`ConfigurationSyncChange.affected` stays counts-only. Named snapshots go into
diagnostics.

### 4. Planner decisions and evolution writes

`decideEvolution` handles the CE1B cases as follows:
- `field-renamed` refuses with `FIELD_RENAME_TARGET_HAS_DATA` when the target
  has holders. Otherwise its `affected` is the moved counts, and the rename is
  planned when moved > 0.
- A hinted `field-removed` or `block-type-removed` is planned when its holder
  count is greater than 0.
- An unhinted removal with data is refused with the CE1A codes. The diagnostic
  now carries named snapshots, and its message names the hint to declare
  (`removedFields: ["x"]` or `renamedFrom` on the replacement field, or
  `removedBlocks: ["t"]`).
- The oversize refusal (`BACKFILL_EXCEEDS_LIMIT`) keeps its code and now also
  covers renames. Its message says "rewrite" instead of "backfill".

`ConfigurationSyncEvolution` gains optional `renames: [{from, to}]`,
`fieldRemovals: string[]` and `blockRemovals: string[]`. Each property is
present only when it is non-empty. CE1A plan JSON therefore stays byte-identical
for plans without hints, and `backfills` stays always-present. Decided changes
carry `from` and `hinted` when set.

`configurationSyncContentWrites(operation, model)` returns the ordered write
list:
1. renames, sorted by target;
2. field removals;
3. block removals;
4. backfills.

`configurationSyncBackfills` stays, as the backfill subset.

### 5. Shared SQL in `@lacecms/db`; every statement ends in a `where` clause

`configurationSyncWriteStatements(write, modelKey)` returns
`{sql, params}[]`. Every statement ends with a `where` clause, so D1 can append
`and <guard>`. The statements by write:

- **rename(from, to)**
  - `update content_snapshots set fields_json = json_remove(json_set(fields_json, '$.to', json(fields_json -> '$.from')), '$.from') where entry_id in (<model entries>) and json_type(fields_json, '$.from') is not null`
  - `update content_media_references set field_path = ? where source_key = '$fields' and field_path = ? and snapshot_id in (<model snapshots>)`
- **remove-field(key)**
  - `update content_snapshots set fields_json = json_remove(fields_json, '$.key') where … and json_type(…) is not null`
  - `delete from content_media_references where source_key = '$fields' and field_path = ? and snapshot_id in (<model snapshots>)`
- **remove-block-type(type)**
  - `delete from content_media_references where snapshot_id in (<model snapshots>) and exists (select 1 from content_blocks b where b.snapshot_id = content_media_references.snapshot_id and b.block_key = content_media_references.source_key and b.block_type = ?)`
  - `delete from content_blocks where block_type = ? and snapshot_id in (<model snapshots>)`
- **backfill(key, json)**: the existing `backfillFieldSql`.

Field keys in JSON paths are checked against the field-key pattern
(`^[A-Za-z][A-Za-z0-9]*$`) before interpolation. Block types and model keys are
bound parameters.

The rename uses `->` because it returns the JSON representation of any value.
`json_extract` would turn `true` into `1` and would insert strings as
unmarked text. The `->` operator needs SQLite 3.38. Node bundles 3.53, and D1
and workerd ship newer versions.

The rename's `json_set` overwrites the target. The planner refuses targets
that hold data, so nothing is lost. Statements cover all snapshots of the
model's entries, as the backfill does. Removing a block leaves a gap in the
positions, which stays valid because order is preserved.

*Alternatives:*
- Rebuild media references per snapshot from recomputed values. This needs
  per-snapshot statements, which are unbounded on D1. The targeted updates give
  the same rows because references are keyed by source and field path.
- Renumber block positions. This is unnecessary, and a self-referencing
  `update` is fragile.

### 6. Revision-neutral rewrites

Renames, removals and block drops do not change revisions, `updated_at` or
`updated_by`. Bumping only draft revisions would mark every unchanged
published entry as `changed`. Bumping published revisions as well can create a
false `published` status when the draft and published revisions differ by
one. CE1C, which really transforms block data, owns the revision policy for
migrations. Because the evidence fingerprint excludes content written by sync,
a repeated sync is a no-op after the baseline moves.

### 7. Reports

Change lines print `from <key>` and `hinted`, for example
`destructive field-renamed field title (from headline; affected: draft=2, published=1)`.
Each evolution prints the lines that apply:
- `planned renames: headline -> title`
- `planned field removals: legacy`
- `planned block removals: quote`

Each line is followed by the existing `planned backfills` line. Diagnostics
already render named snapshots.

### 8. Package boundaries

- `content`: the option and the block rejection.
- `config`: normalization and validation.
- `application`: diff, evidence, planner, write list and reports.
- `db`: SQL.
- Adapters: execution only.

No new dependency edges.

## Risks / Trade-offs

- [An editor whose admin loaded the new configuration before sync, while the
  draft still had the old key, can save an empty new field over the moved
  value after sync] → Revision-neutral writes cannot detect this. The
  documented operation order is to deploy and then sync immediately. During the
  deploy-to-sync window, the API already validates saves against the new
  configuration, so this window exists for every CE1A change too. CE1C
  revisits revision policy.
- [A stale or mistaken removal hint deletes data] → Hints are explicit and
  reviewed. `--check` lists every planned removal with counts before apply.
  Pruning happens only when the key is in the baseline.
- [Hints left in configuration forever] → They are inert once applied and are
  documented as temporary. They never affect hashes.
- [A large model on D1] → Two statements per hinted write, independent of
  snapshot count. The guard keeps the batch atomic.

## Migration Plan

No schema migration. Deploy the engine. Existing configurations without hints
produce identical plans and hashes. To rename or remove a populated field or
block type:
1. Edit the configuration, add the hint and bump the model version.
2. Run `lace content sync --check` and review the planned writes.
3. Run `lace content sync` in every environment.
4. Remove the hint once every environment has synchronized. This needs no
   version bump.

Rollback: an older engine's field builders reject the unknown `renamedFrom`
option, so field rename hints must be removed before downgrading the engine.
Data already moved or pruned stays as written. The older engine sees a valid
baseline for the new structure and keeps working.
