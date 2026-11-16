## ADDED Requirements

### Requirement: Content actor profiles are a security-owned projection

The shared SQLite schema SHALL provide a Lace-owned projection keyed by
actor ID with only the account's display name and validated Lace role.
A forward migration SHALL backfill existing accounts and install maintenance
that applies account insertion, display-name and role changes, and account
deletion to the projection within the same atomic write. Account records SHALL
remain authoritative for authentication and authorization. Content actor IDs
SHALL survive account deletion without a foreign-key dependency on either the
account or projection row. Content and media reads and publication-result
hydration SHALL use the projection for audit attributes and SHALL NOT read
provider account tables.

#### Scenario: An existing installation upgrades
- **WHEN** either runtime migrates a database with existing users and content
  or uploads attributed to those users
- **THEN** the projection contains the existing IDs, names and roles, with
  content, publication versions and the build queue intact

#### Scenario: Account writes and their projection commit together
- **WHEN** account setup or invitation acceptance creates a user, account
  self-service changes a name, or an administrator changes a role
- **THEN** the corresponding actor profile is current when the account write
  commits, and a rolled-back account write leaves no projection changes

#### Scenario: Account deletion preserves content
- **WHEN** an authentication user record is deleted
- **THEN** its actor profile is removed in the same commit and existing entry
  and media attribution IDs remain readable
