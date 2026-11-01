## ADDED Requirements

### Requirement: Media tags are stored in an indexed join table
Migration `0014` SHALL create `media_tags` with non-null text columns
`media_id` and `tag`, a composite primary key `(media_id, tag)`, a foreign key
from `media_id` to `media.id` with `ON DELETE CASCADE`, an index on
`(tag, media_id)`, and checks that `tag` has 1 to 40 characters and contains only ASCII `a-z`, `0-9` and `-`. The migration SHALL be additive, SHALL not rebuild `media`, SHALL apply
identically to Node SQLite and D1, and SHALL leave every existing media item
without tags. Readiness SHALL report the schema as current only after `0014`.

#### Scenario: Migration applies to a database with media
- **WHEN** migration `0014` runs on a database migrated to `0013` that holds media, references and publications
- **THEN** `media_tags` exists and is empty, existing media, references, published state and build work are unchanged, and readiness reports the schema as current

#### Scenario: The database refuses invalid tag rows
- **WHEN** a statement inserts a duplicate `(media_id, tag)` pair, a tag of 41 characters, a tag with a comma, uppercase letter, space or non-ASCII character, or a row for a missing media item
- **THEN** the statement fails with a constraint error and no row is stored
