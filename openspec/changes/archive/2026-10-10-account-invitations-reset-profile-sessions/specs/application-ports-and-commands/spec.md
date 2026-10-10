## MODIFIED Requirements

### Requirement: Portable security lifecycle commands preserve guarded outcomes
The system SHALL expose portable, REST- and database-independent contracts for
setup-credential issuance and claim/completion, user lifecycle administration,
invitation issuance, inspection, acceptance, resend and revocation,
password-reset issuance and confirmation, own profile and password changes,
session listing and deletion, opaque build-credential
issuance/verification/revocation, and fixed-window rate-limit decisions. User
accounts other than the first administrator SHALL be created only by accepting
an invitation; there SHALL be no command that creates a user with a supplied
password outside setup and invitation acceptance. Commands SHALL encode their
actor, time, lifecycle guards, and complete outcome rather than accepting a
generic transaction callback or a persistence row. Persistence-facing values
SHALL contain only derived credential, email-subject, and rate-limit
identifiers, and invitation and reset tokens SHALL cross the port only as
plaintext inputs or once-returned outputs, never as stored values.

#### Scenario: A runtime adapter implements a security command
- **WHEN** a Node or Cloudflare adapter receives a portable setup, user,
invitation, reset, session, token, or limiter command
- **THEN** it can enforce the documented guarded outcome without importing an
HTTP DTO or exposing a database row to application callers

#### Scenario: Concurrent acceptance of one invitation
- **WHEN** two acceptances of the same invitation token run concurrently
- **THEN** exactly one creates the account and the other fails with the
  invalid-invitation outcome
