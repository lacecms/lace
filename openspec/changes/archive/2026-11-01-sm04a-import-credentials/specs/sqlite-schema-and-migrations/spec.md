## ADDED Requirements

### Requirement: Import credentials and media hashes are stored additively
Migration `0015` SHALL add nullable integer `api_tokens.expires_at`, nullable
text `api_tokens.created_by`, nullable text `media.sha256` with a check that a
non-null value has 64 characters from `0-9a-f`, and a non-unique index on
`media.sha256`. It SHALL be additive, SHALL rebuild no table, SHALL apply
identically to Node SQLite and D1 and SHALL leave every existing build token
without expiry or creator and every existing media item without a hash.
Readiness SHALL report the schema as current only after `0015`.

#### Scenario: Migration applies to a populated database
- **WHEN** migration `0015` runs on a database migrated to `0014` that holds build tokens, media, tags, references and publications
- **THEN** existing build tokens still authenticate build export, existing media carry no hash, published state and build work are unchanged, and readiness reports the schema as current

#### Scenario: The database refuses a malformed hash
- **WHEN** a statement stores a `media.sha256` value of 63 characters or with an uppercase letter
- **THEN** the statement fails with a constraint error
