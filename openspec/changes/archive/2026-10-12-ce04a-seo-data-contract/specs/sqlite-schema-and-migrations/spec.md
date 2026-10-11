## ADDED Requirements

### Requirement: Content snapshots store an optional SEO group
`content_snapshots` SHALL have a nullable `seo_json` column that holds the
normalized SEO group as a JSON object, or `NULL` when the snapshot has none.
Migration `0008` SHALL add the column with one additive `ALTER TABLE … ADD`
on Node SQLite and D1. The migration SHALL not rebuild a table, backfill rows
or change any existing row, index or foreign key. The checked-in migration
inventory SHALL list the migration.

#### Scenario: Upgrade a populated database
- **WHEN** a database at migration `0007` holding pages, collection entries,
  published snapshots, blocks and media references is migrated to `0008` on
  Node SQLite or D1
- **THEN** every existing row is unchanged, every existing snapshot has
  `seo_json` `NULL`, and foreign keys still hold

#### Scenario: Store a snapshot with an SEO group
- **WHEN** a snapshot is inserted with an SEO group after the migration
- **THEN** reading it back returns the same group
