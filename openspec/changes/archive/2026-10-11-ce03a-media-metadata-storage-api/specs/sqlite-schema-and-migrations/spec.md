## ADDED Requirements

### Requirement: Media rows store constrained descriptive metadata
Migration `0006` SHALL add four nullable columns to `media`: `alt` and
`caption` as text, and `focal_x` and `focal_y` as reals. The database SHALL
enforce that `alt` has at most 1,000 characters, that `caption` has at most
2,000 characters, that `focal_x` and `focal_y` are each from 0 to 1 inclusive,
and that both focal coordinates are set or both are `NULL`. The migration SHALL
be additive, SHALL not rebuild the `media` table, SHALL apply identically to
Node SQLite and D1, and SHALL leave every existing row with all four columns
`NULL`. The `metadata_json` column SHALL remain reserved and unchanged.

#### Scenario: Migration applies to a database with media
- **WHEN** migration `0006` runs on a database migrated to `0005` that holds
  media referenced by drafts and publications
- **THEN** the four columns exist and are `NULL` for every row, media
  references and `metadata_json` are unchanged, and readiness reports the
  schema as current

#### Scenario: The database refuses an inconsistent focal point
- **WHEN** a statement sets `focal_x` to `0.5` while `focal_y` stays `NULL`,
  or sets `focal_y` to `1.5`
- **THEN** the statement fails with a check-constraint error and the row is
  unchanged

#### Scenario: The database refuses over-long text
- **WHEN** a statement stores an `alt` value of 1,001 characters
- **THEN** the statement fails with a check-constraint error
