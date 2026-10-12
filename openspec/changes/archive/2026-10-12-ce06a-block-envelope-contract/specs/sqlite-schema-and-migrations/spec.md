## ADDED Requirements

### Requirement: Content blocks store the block envelope
`content_blocks` SHALL have the columns `anchor` (nullable text), `class_name`
(nullable text), `hidden` (integer, not null, default `0`, constrained to `0`
or `1`) and `settings_json` (text, not null, default `'{}'`). A partial unique
index SHALL make `(snapshot_id, anchor)` unique for rows whose `anchor` is not
`NULL`. Migration `0009` SHALL add the columns with additive
`ALTER TABLE … ADD` statements and create the index on Node SQLite and D1. It
SHALL not rebuild a table, backfill rows through the application or change any
existing foreign key. Existing blocks SHALL read as visible, without an anchor
or class name, with `{}` settings. The checked-in migration inventory SHALL
list the migration.

#### Scenario: Upgrade a populated database
- **WHEN** a database at migration `0008` holding drafts, published snapshots,
  blocks and media references is migrated to `0009` on Node SQLite or D1
- **THEN** every existing block keeps its key, type, position, version and
  data, has `anchor` and `class_name` `NULL`, `hidden` `0` and
  `settings_json` `'{}'`, and foreign keys still hold

#### Scenario: The database rejects a duplicate anchor
- **WHEN** two blocks of the same snapshot are written with the same anchor
  directly, bypassing validation
- **THEN** the write fails on the unique index, while the same anchor in a
  different snapshot is accepted

#### Scenario: The database rejects an invalid hidden value
- **WHEN** a block row is written with `hidden` `2`
- **THEN** the write fails on the column constraint
