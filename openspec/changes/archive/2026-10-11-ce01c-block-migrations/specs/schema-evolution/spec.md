## MODIFIED Requirements

### Requirement: Changes are applied according to class and stored data
When the model has no draft or published snapshot, the system SHALL apply
every classified change without scanning content. When the model has one or
more snapshots, the system SHALL decide each change as follows:

- `compatible` and `display` changes SHALL be applied.
- A `validated` change SHALL be applied only when every stored value, after
  hinted renames, removals and backfills are applied, satisfies the configured
  definition: a present value in any snapshot SHALL conform to the new field
  definition, and a published snapshot SHALL hold a value for a field that
  becomes required unless the field is backfilled. Otherwise synchronization
  SHALL be refused.
- A hinted `destructive` change SHALL be applied and SHALL move or prune the
  stored data as defined by the hinted destructive change requirement. A
  field rename SHALL be refused when any snapshot already holds a value under
  the new key.
- An unhinted `destructive` change SHALL be applied only when no snapshot holds
  a value for the removed field or a block of the removed type. Otherwise
  synchronization SHALL be refused and the diagnostic SHALL name the hint that
  would allow the change.
- A `migration` change SHALL be applied without rewriting content when no
  snapshot holds a block of that type at a schema version other than the
  configured version. When the configured block version equals the baseline
  block version and any snapshot holds a block of that type, synchronization
  SHALL be refused and the diagnostic SHALL tell the operator to increase the
  block version and declare migrations. Otherwise the change SHALL be decided
  and applied as defined by the block migration requirements.
- A `breaking` field change SHALL always be refused. A path or route change
  SHALL be refused while the model has a published snapshot.

A refusal SHALL name the model, the field key or block type, the class, the
total number of affected snapshots, and up to 20 affected snapshots by entry
ID, state (draft or published) and title. A refused change SHALL make the whole
plan invalid.

#### Scenario: Adding fields to a populated model succeeds
- **WHEN** a model with draft and published content adds an optional field and
  a required field without a default and increases its version
- **THEN** synchronization applies the new structure, existing drafts and
  published snapshots keep their stored values, and the required field is
  enforced at the next publication of each entry

#### Scenario: Failing tightening names the offending snapshots
- **WHEN** a model lowers a text field's `maxLength` below the length of a
  value stored in one draft and one published snapshot
- **THEN** synchronization is refused, the report names both snapshots with
  their entry ID, state and title and the total count, and no model, snapshot,
  public-state or outbox data changes

#### Scenario: Satisfied tightening is applied
- **WHEN** every stored value of a field already satisfies a tightened
  constraint
- **THEN** synchronization applies the change without rewriting any snapshot

#### Scenario: Unused field and block type can be removed
- **WHEN** a model removes a field that no snapshot holds and a block type that
  no snapshot uses, without hints
- **THEN** synchronization applies the removal without rewriting any snapshot

#### Scenario: Removal of stored data is refused
- **WHEN** a model removes a field that a snapshot holds or a block type that a
  snapshot uses, and the model declares no matching `removedFields`,
  `removedBlocks` or field `renamedFrom` hint
- **THEN** synchronization is refused with a `destructive` diagnostic that
  names the field or block type, the affected snapshots and their total, and
  the hint to declare, and no model, snapshot, media-reference, public-state
  or outbox data changes

#### Scenario: Rename onto stored data is refused
- **WHEN** a field rename hint applies to the baseline but a stored snapshot
  already holds a value under the new key
- **THEN** synchronization is refused and names the field and the affected
  snapshots

#### Scenario: Changed definition of a used block is refused
- **WHEN** the fields of a block type change, its version stays the same, and
  a snapshot of the model holds a block of that type
- **THEN** synchronization is refused with a `migration` diagnostic that tells
  the operator to increase the block version and declare migrations

#### Scenario: Version increase without stale blocks needs no rewrite
- **WHEN** a block type increases its version and every stored block of that
  type in the model already has the configured version
- **THEN** synchronization applies the change and rewrites no block

### Requirement: Stored content is scanned in bounded pages
The system SHALL read stored snapshot values for data-dependent decisions only
through repository read operations that return bounded pages:

- a snapshot page of at most 100 current draft or published snapshots of one
  model, ordered by snapshot ID with an opaque continuation cursor, where each
  item carries the entry ID, snapshot ID, state, revision, title, fields, and
  the key, type and schema version of each block;
- for block migrations, an entry page of at most 50 entries of one model,
  ordered by entry ID with an opaque continuation cursor, that contains only
  entries whose current draft or published snapshot holds a block of one of
  the requested types at a schema version other than the requested version.
  Each entry SHALL carry its entry ID and its current draft and published
  snapshots. Each snapshot SHALL carry its snapshot ID, state, revision, title
  and the media IDs it references. It SHALL also carry every block's key,
  type, position and schema version, and the stored data of each block of a
  requested type.

The system SHALL scan only models with snapshots whose diff contains a
data-dependent change, a backfill or a block migration, and SHALL NOT write
during the scan. Scan results SHALL be derived for the exact stored snapshot
fingerprint read before the scan; apply SHALL reject the plan when that
fingerprint changed.

#### Scenario: Scan pages cover every snapshot
- **WHEN** a model has more snapshots than one page holds
- **THEN** the scan follows continuation cursors until every current draft and
  published snapshot of the model has been evaluated exactly once

#### Scenario: Migration pages cover every entry with stale blocks
- **WHEN** more entries of a model hold stale blocks of a migrated type than
  one entry page holds, and other entries hold only current blocks
- **THEN** the migration scan follows continuation cursors, returns every entry
  with a stale block exactly once with both of its current snapshots, and
  returns no entry whose blocks are all current

#### Scenario: Content written after the scan makes the plan stale
- **WHEN** an editor saves or publishes an entry of a scanned model after the
  plan was prepared and before it is applied
- **THEN** apply rejects the plan as stale and writes nothing

## ADDED Requirements

### Requirement: Stale blocks are migrated and validated before any write
When a model with snapshots has a `migration` change whose configured block
version is greater than its baseline block version, the system SHALL find every
block of that type in the model's current drafts and published snapshots whose
stored schema version differs from the configured version, and decide the
change during planning without writing:

- A stored version greater than the configured version SHALL refuse the plan
  (`BLOCK_VERSION_AHEAD`).
- A stored version that the configured migrations cannot reach SHALL refuse
  the plan (`BLOCK_MIGRATION_MISSING`).
- For every other stale block, the system SHALL execute the composed
  migrations in memory. A migration that fails SHALL refuse the plan
  (`BLOCK_MIGRATION_FAILED`).
- It SHALL validate each result against the configured block definition, in
  publish mode for a published snapshot and in draft mode for a draft. The
  validation SHALL apply the block's default data and the per-block JSON size
  limit. A result that fails validation SHALL refuse the plan
  (`BLOCK_MIGRATION_INVALID`).
- A media ID in a media field of a migrated result that the same snapshot did
  not reference before migration SHALL refuse the plan
  (`BLOCK_MIGRATION_INVALID`).
- A snapshot whose media references would exceed the per-entry limit after
  migration SHALL refuse the plan (`BLOCK_MIGRATION_INVALID`).

A refusal SHALL name the model, the block type, the configured version, and
up to 20 affected blocks. Each named block SHALL carry its entry ID, state,
title, block key and stored version. For a failed validation, the refusal
SHALL also carry the validation path and code of the first failure. A refused
migration SHALL make the whole plan invalid, and no model, snapshot, block,
media-reference, public-state or outbox data SHALL change. A valid plan SHALL
report, per migrated block type, the configured version, the distinct stored
versions, and the number of drafts, published snapshots and blocks that the
apply migrates.

#### Scenario: Two-step migration is planned
- **WHEN** a populated model allows a block type whose definition moves from
  version 1 to version 3 with migrations for versions 2 and 3, and a draft-only
  entry and a published entry hold version 1 blocks of that type
- **THEN** the plan is valid and reports a planned migration from version 1
  to version 3 with the affected draft, published and block counts, and check
  mode writes nothing

#### Scenario: Throwing migration refuses the plan
- **WHEN** a declared migration throws for one stored block
- **THEN** the plan is invalid with `BLOCK_MIGRATION_FAILED` naming the model,
  entry, state, block key, stored and configured versions, and the database is
  unchanged

#### Scenario: Invalid migration result refuses the plan
- **WHEN** a migration returns data that omits a field required by the new
  definition for a block of a published snapshot
- **THEN** the plan is invalid with `BLOCK_MIGRATION_INVALID` naming the
  published snapshot, block key and the failing field path, and the database
  is unchanged

#### Scenario: Draft results are validated in draft mode
- **WHEN** a migration result omits a required field for a block that only a
  draft holds
- **THEN** the plan stays valid because draft validation permits the missing
  required field

#### Scenario: Missing step refuses the plan
- **WHEN** stored blocks have version 1 and the configured version 3 block
  declares only the migration to version 3
- **THEN** the plan is invalid with `BLOCK_MIGRATION_MISSING` naming the block
  type, the stored and configured versions and the affected blocks

#### Scenario: Stored block ahead of the configuration is refused
- **WHEN** a stored block has a schema version greater than the configured
  block version
- **THEN** the plan is invalid with `BLOCK_VERSION_AHEAD` naming the block

#### Scenario: Migration cannot introduce media references
- **WHEN** a migration returns a media ID that the snapshot did not reference
  before migration
- **THEN** the plan is invalid with `BLOCK_MIGRATION_INVALID` naming the block

### Requirement: Stale blocks are rewritten in guarded resumable units
When a valid plan contains block migrations, the system SHALL rewrite the stale
blocks before the final synchronization mutation, in independent units of one
entry. It SHALL re-read the entries through the migration scan and re-execute
the migrations for each unit. For each migrated snapshot of the unit, the
system SHALL:

- replace the data and schema version of each migrated block in place, keeping
  its key, type and position, and SHALL NOT change any other block, the
  snapshot's fields, title or slug, or any other snapshot;
- replace the media references held by each migrated block with the
  references of its migrated data;
- for a draft, increment the revision by one, set the audit actor to
  `system:content-sync`, and set the update time to the migration time;
- for a published snapshot, set the revision to the draft's new revision when
  its revision equalled the draft's revision before the unit, and otherwise
  keep its revision; set the update time to the migration time and keep its
  publisher and publication time.

A unit SHALL be guarded on the following conditions:

- each snapshot's revision as read;
- each snapshot still being the entry's current draft or published snapshot;
- each migrated block still having its stored schema version;
- the draft's revision as read, when a published snapshot takes the draft's
  revision.

A unit whose guard fails SHALL change nothing. Synchronization SHALL then stop
as stale before its final mutation, and the operator SHALL rerun it. Each
snapshot write SHALL be atomic. When an entry's two snapshots are written
separately, the published snapshot SHALL be written before the draft. A
committed unit SHALL remain committed when a later unit or the final mutation
fails. A rerun SHALL migrate only blocks that are still stale. Entry status
(draft, published or changed) SHALL be the same after a completed migration as
before it.

#### Scenario: Drafts and published snapshots are upgraded
- **WHEN** a valid plan migrates a block type from version 1 to version 3 for
  a draft-only entry and a published entry whose draft equals its published
  snapshot
- **THEN** every block of that type in both drafts and in the published
  snapshot has schema version 3 and the migrated data, each draft revision
  increased by one with audit actor `system:content-sync`, the published
  entry's published revision equals its draft revision, and the entries keep
  their status

#### Scenario: Changed entry keeps its status
- **WHEN** a published entry has a newer draft and both snapshots hold stale
  blocks
- **THEN** the draft revision increases by one, the published revision is
  unchanged, and the entry stays changed

#### Scenario: Open editor receives a revision conflict
- **WHEN** an editor loaded a draft before synchronization migrated its blocks
  and then saves with the loaded revision
- **THEN** the save is rejected as a revision conflict and the migrated draft
  is unchanged

#### Scenario: Migrated media references follow the data
- **WHEN** a migration moves a media ID from one block field to another
- **THEN** after migration the media item keeps one usage per snapshot,
  attributed to the block and the new field path

#### Scenario: Interrupted synchronization resumes
- **WHEN** synchronization stops after some units committed and before the
  final mutation, and synchronization runs again
- **THEN** the second run migrates only the remaining stale blocks, completes
  the final mutation, and the result equals an uninterrupted run

#### Scenario: Concurrent draft save stops synchronization
- **WHEN** an editor saves a draft of an entry after the migration scan read
  it and before its unit is written
- **THEN** that unit changes nothing, synchronization stops as stale without
  its final mutation, and a rerun migrates the saved draft if it still holds
  stale blocks
