## MODIFIED Requirements

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

## ADDED Requirements

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
