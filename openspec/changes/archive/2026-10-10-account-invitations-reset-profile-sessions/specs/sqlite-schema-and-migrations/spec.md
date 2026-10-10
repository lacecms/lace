## ADDED Requirements

### Requirement: Account token tables support invitations and password resets
Migration `0004` SHALL add an `invitations` table (identifier, normalized
email, Lace role, unique token digest, inviting user, created, expiry, accepted,
revoked and accepted-user columns) with a role check and a partial unique index
that allows one active invitation per email, and a `password_reset_tokens`
table (token digest primary key, user reference with cascade delete, created,
expiry, consumed and requesting-administrator columns) indexed by user. The
migration SHALL be additive, SHALL apply identically to Node SQLite and D1, and
SHALL store no plaintext token.

#### Scenario: Migration applies to an alpha.4 database
- **WHEN** migration `0004` runs on a database migrated to `0003`
- **THEN** both tables exist, existing users and content are unchanged, and
  readiness reports the schema as current

#### Scenario: Second active invitation is rejected by the schema
- **WHEN** two active invitation rows for one email are inserted
- **THEN** the second insert fails the unique constraint
