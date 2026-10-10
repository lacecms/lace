## ADDED Requirements

### Requirement: Content models store a verifiable structure baseline
Migration `0005` SHALL add two nullable text columns to `content_models`:
`structure_json`, holding the canonical JSON structure of the model as of the
last successful synchronization, and `structure_json_hash`, holding the
structural hash that structure was written for. The migration SHALL be
additive, SHALL apply identically to Node SQLite and D1, and SHALL leave every
existing row with both columns `NULL`. A stored baseline SHALL be considered
valid only when `structure_json_hash` equals the row's `structure_hash`; the
configuration file remains the only authoritative definition.

#### Scenario: Migration applies to an alpha.4 database
- **WHEN** migration `0005` runs on a database migrated to `0004` that holds
  content models and entries
- **THEN** both columns exist and are `NULL` for every model, entries and
  snapshots are unchanged, and readiness reports the schema as current

#### Scenario: Identity write without baseline invalidates it
- **WHEN** a model row has a baseline and its `structure_hash` is later changed
  without updating `structure_json_hash`
- **THEN** reads of the synchronization state report that the model has no
  valid baseline
