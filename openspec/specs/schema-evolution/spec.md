# schema-evolution Specification

## Purpose
Defines how configuration synchronization compares a model's stored structure
baseline with its configured structure, classifies every difference, decides
data-dependent changes from stored snapshot values, and backfills field
defaults into existing content.

## Requirements

### Requirement: Structural differences are derived from the stored baseline
The system SHALL derive a model's structural changes by comparing the stored
structure baseline with the configured canonical structure and the model's
temporary synchronization hints. It SHALL compare model fields by key, the
ordered block allowlist, the definitions of block types allowed by both
structures, and the fixed path or collection route. A field rename hint that
applies to the baseline SHALL pair the former field key with the new key so
that the pair is compared as one existing field instead of one removal and one
addition. It SHALL treat the model key and version as identity, not as
structural changes: a model rename is governed by the explicit model-level
`renamedFrom` rules and a structural change still requires a version
increase. Display metadata and hints alone SHALL never produce a structural
change. The diff SHALL be deterministic: changes are ordered by model key, then
by change target, then by change kind.

#### Scenario: Unchanged structure yields no changes
- **WHEN** the configured structure of a model equals its stored baseline
  except for its version
- **THEN** the diff reports no structural change and a version increase alone
  is a compatible version update

#### Scenario: Equivalent inputs give the same diff
- **WHEN** the same baseline and configuration are supplied with fields and
  blocks in different insertion orders where order has no meaning
- **THEN** the reported changes and their order are identical

#### Scenario: A renamed field is compared with its former definition
- **WHEN** the baseline has field `headline` with a `maxLength` of 100 and the
  configuration has field `title` declaring `renamedFrom: "headline"` with a
  `maxLength` of 80
- **THEN** the diff reports one `field-renamed` change for `title` naming
  `headline` and one `validated` change for `title` listing `maxLength`, and
  reports neither a removal of `headline` nor an addition of `title`

### Requirement: Every structural change has one class
The system SHALL assign exactly one class to every structural change:

- `compatible`: adding a field; relaxing a constraint (removing or lowering
  `minLength`, removing or raising `maxLength`, removing or lowering `min`,
  removing or raising `max`, `required` → optional, adding a `select` option);
  adding, changing or removing a field `defaultValue`; allowing a new block
  type.
- `display`: reordering `select` options or the block allowlist without adding
  or removing an entry.
- `validated`: tightening a constraint on an existing or renamed field (adding
  or raising `minLength`, adding or lowering `maxLength`, adding or raising
  `min`, adding or lowering `max`, removing a `select` option, optional →
  required).
- `destructive`: removing a field, renaming a field through a hint, or removing
  a block type from the allowlist. A removal that a matching hint declares
  SHALL be marked as hinted.
- `migration`: changing the definition of a block type that both structures
  allow, including its version, fields or default value.
- `breaking`: changing a field type, including across a rename, changing a
  fixed path or collection route, or any other field-definition difference the
  system does not recognise.

A single field change that both relaxes and tightens SHALL be reported as one
`validated` change listing every changed property.

#### Scenario: Compatible additions are classified
- **WHEN** a model adds an optional field, a required field without a default,
  a required field with a default, raises a `maxLength`, adds a `select`
  option and allows a new block type
- **THEN** each change is reported as `compatible` and the defaulted field is
  marked for backfill

#### Scenario: Tightening is classified as validated
- **WHEN** a model lowers a `maxLength`, removes a `select` option, or makes an
  optional field required
- **THEN** each change is reported as `validated`

#### Scenario: Type change is breaking
- **WHEN** a field keeps its key but changes from `text` to `number`, or a
  field renamed through a hint has a different type than its former field
- **THEN** the change is reported as `breaking`

#### Scenario: Hinted destructive changes are classified
- **WHEN** a model renames field `headline` to `title` through a hint, removes
  field `legacy` listed in `removedFields`, and disallows block type `quote`
  listed in `removedBlocks`
- **THEN** the rename is reported as one `destructive` `field-renamed` change
  and both removals are reported as hinted `destructive` changes

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

### Requirement: Field defaults are backfilled into existing snapshots
When a model with snapshots adds a field that declares a `defaultValue`, or an
existing field newly declares or changes its `defaultValue`, the system SHALL
write that default into every draft and published snapshot of the model whose
stored fields lack the key. It SHALL NOT overwrite a stored value. The backfill
SHALL happen in the same guarded atomic mutation that records the new model
state and SHALL advance the published-state version and coalesce one build
request when any published snapshot is written. Backfill SHALL NOT change a
snapshot's revision, audit actor, timestamps, slug, title or blocks. A
`defaultValue` on a `media` field SHALL NOT be backfilled; such a change on a
model with snapshots lacking the key SHALL be refused. A backfill that would
push a snapshot's fields above the content size limit SHALL be refused and name
the snapshot.

#### Scenario: Required field with a default is backfilled
- **WHEN** a model with one draft-only entry and one published entry adds a
  required text field with a default
- **THEN** both drafts and the published snapshot contain the default after
  synchronization, revisions are unchanged, the published-state version
  advances once and exactly one build request is pending

#### Scenario: Stored values are never overwritten
- **WHEN** an existing field gains a default and some snapshots already hold a
  value for it
- **THEN** only the snapshots lacking the key receive the default

#### Scenario: Media default is refused on populated models
- **WHEN** a model with snapshots adds a media field with a default
- **THEN** synchronization is refused and names the field

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

### Requirement: Synchronization hints are validated against the baseline
The system SHALL evaluate a model's field rename, removed-field and
removed-block hints only when the model's structure changed and a valid
baseline exists; otherwise the hints SHALL have no effect. A field rename hint
from former key `A` to configured key `B` SHALL apply when `A` is a field of
the baseline and `B` is not. It SHALL be inert when `B` is a field of the
baseline and `A` is not, because the rename was already applied. It SHALL make
the plan invalid when both keys are fields of the baseline
(`FIELD_RENAME_TARGET_EXISTS`) or neither is (`FIELD_RENAME_SOURCE_MISSING`),
regardless of stored content. A removed-field or removed-block hint SHALL apply
when the named field or block type is in the baseline and SHALL be inert
otherwise. Hints SHALL never be inferred from a matching removal and addition.

#### Scenario: Already-applied hints are inert
- **WHEN** an environment already synchronized a rename from `headline` to
  `title` and a removal of field `legacy`, and later synchronizes another
  structural change while the hints are still configured
- **THEN** the hints produce no change, no write and no diagnostic

#### Scenario: Rename onto an existing baseline field is refused
- **WHEN** the baseline holds both `headline` and `title` and the
  configuration renames `title` from `headline`
- **THEN** the plan is invalid with `FIELD_RENAME_TARGET_EXISTS` naming both
  keys and nothing is written

#### Scenario: Rename from an unknown field is refused
- **WHEN** neither the former key nor the new key of a rename hint is a field
  of the baseline
- **THEN** the plan is invalid with `FIELD_RENAME_SOURCE_MISSING` naming both
  keys

#### Scenario: Same field names without a hint are not a rename
- **WHEN** a model removes populated field `headline` and adds field `title`
  of the same type without a rename hint
- **THEN** synchronization reports one removal and one addition and refuses
  the removal of stored data

### Requirement: Hinted destructive changes move or prune stored data
When a plan applies a hinted destructive change to a model with snapshots, the
system SHALL rewrite every draft and published snapshot of the model in the
same guarded atomic mutation that records the new model state:

- a field rename SHALL move each stored value from the former key to the new
  key without changing it, and SHALL move the snapshot's media reference for
  that field to the new key;
- a field removal SHALL delete the stored value and the snapshot's media
  reference for that field;
- a block-type removal SHALL delete every stored block of that type and every
  media reference held by those blocks, keeping the order of the remaining
  blocks.

Renames SHALL be applied before default backfills, so a renamed field keeps
its moved values and only snapshots lacking the field receive the default. A
rewrite SHALL NOT change a snapshot's revision, audit actor, timestamps, slug,
title, other fields, or other blocks, and SHALL NOT change any snapshot of
another model. When any published snapshot is rewritten, the mutation SHALL
advance the published-state version and coalesce one build request. A rename
whose moved fields would exceed the content size limit SHALL be refused and
name the snapshot.

#### Scenario: Renaming a field keeps its values
- **WHEN** a populated model renames field `headline` to `title` through a
  hint, with one draft-only and one published entry holding values
- **THEN** after synchronization every draft and the published snapshot hold
  the former value under `title` and no value under `headline`, revisions are
  unchanged, the published-state version advances once and exactly one build
  request is pending

#### Scenario: Removing a field prunes its values
- **WHEN** a populated model removes field `legacy` and lists it in
  `removedFields`
- **THEN** no draft or published snapshot of the model holds `legacy` after
  synchronization and every other field value is unchanged

#### Scenario: Removing a media field releases its media usage
- **WHEN** a populated model removes a media field listed in `removedFields`
  whose values reference a media item used nowhere else
- **THEN** after synchronization the media item has no usage and the media
  deletion guard allows its deletion

#### Scenario: Renaming a media field keeps its media usage
- **WHEN** a populated model renames a media field through a hint
- **THEN** each referenced media item keeps one usage per snapshot, now
  attributed to the new field key

#### Scenario: Removing an allowed block type drops its stored blocks
- **WHEN** a populated model disallows block type `quote`, lists it in
  `removedBlocks`, and stored drafts and published snapshots hold `quote`
  blocks between other blocks, one of which references media
- **THEN** after synchronization no snapshot of the model holds a `quote`
  block, the remaining blocks keep their keys, data and order, and the media
  references of the dropped blocks are deleted

#### Scenario: Failed rewrite leaves the database unchanged
- **WHEN** a hinted change is planned and the apply is rejected as stale or
  fails on a statement
- **THEN** no model, baseline, snapshot, block, media-reference, public-state
  or outbox row changes

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
  migrations in memory over the block's stored data and settings. A migration
  that fails SHALL refuse the plan (`BLOCK_MIGRATION_FAILED`).
- It SHALL validate each result against the configured block definition: the
  data in publish mode for a visible block of a published snapshot, and in
  draft mode for a draft or a hidden block; the settings against the declared
  settings with their defaults applied. The validation SHALL apply the block's
  default data and the per-block JSON size limit. A result that fails
  validation SHALL refuse the plan (`BLOCK_MIGRATION_INVALID`).
- A media ID in a media field of a migrated result that the same snapshot did
  not reference before migration SHALL refuse the plan
  (`BLOCK_MIGRATION_INVALID`).
- A snapshot whose media references would exceed the per-entry limit after
  migration SHALL refuse the plan (`BLOCK_MIGRATION_INVALID`).

A refusal SHALL name the model, the block type, the configured version, and
up to 20 affected blocks. Each named block SHALL carry its entry ID, state,
title, block key and stored version. For a failed validation, the refusal
SHALL also carry the validation path (under `data` or `settings`) and code of
the first failure. A refused migration SHALL make the whole plan invalid, and
no model, snapshot, block, media-reference, public-state or outbox data SHALL
change. A valid plan SHALL report, per migrated block type, the configured
version, the distinct stored versions, and the number of drafts, published
snapshots and blocks that the apply migrates.

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
  definition for a visible block of a published snapshot
- **THEN** the plan is invalid with `BLOCK_MIGRATION_INVALID` naming the
  published snapshot, block key and the failing field path, and the database
  is unchanged

#### Scenario: Draft results are validated in draft mode
- **WHEN** a migration result omits a required field for a block that only a
  draft holds
- **THEN** the plan stays valid because draft validation permits the missing
  required field

#### Scenario: Hidden published blocks are validated in draft mode
- **WHEN** a migration result omits a required field for a hidden block of a
  published snapshot
- **THEN** the plan stays valid

#### Scenario: Invalid migrated settings refuse the plan
- **WHEN** a migration returns settings with a key the new definition does not
  declare
- **THEN** the plan is invalid with `BLOCK_MIGRATION_INVALID` whose path names
  that key under `settings`

#### Scenario: New settings receive their defaults
- **WHEN** version 2 of a block adds an `align` setting with default `left`
  and its migration returns the stored version 1 envelope unchanged
- **THEN** the plan is valid and the migrated blocks carry settings
  `{align: "left"}`

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

### Requirement: Block migration rewrites keep the envelope
When a guarded migration unit rewrites a migrated block, it SHALL replace the
block's settings with the validated migrated settings together with its data
and schema version, and SHALL keep the block's anchor, class name and hidden
flag. The unit guard, revision and audit rules SHALL be unchanged.

#### Scenario: A rewrite migrates settings and keeps presentation values
- **WHEN** sync migrates a hidden block with anchor `pricing`, class name
  `wide` and settings `{tone: "dark"}` through a migration that renames the
  setting to `theme`
- **THEN** the stored block has the new schema version, settings
  `{theme: "dark"}`, anchor `pricing`, class name `wide` and `hidden: true`
