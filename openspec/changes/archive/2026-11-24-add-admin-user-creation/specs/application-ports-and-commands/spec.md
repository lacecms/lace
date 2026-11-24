## MODIFIED Requirements

### Requirement: Portable security lifecycle commands preserve guarded outcomes
The system SHALL expose portable, REST- and database-independent contracts for
setup-credential issuance and claim/completion, user lifecycle administration,
invitation issuance, inspection, acceptance, resend and revocation,
password-reset issuance and confirmation, own profile and password changes,
session listing and deletion, opaque build-credential
issuance/verification/revocation, and fixed-window rate-limit decisions. User
accounts other than the first administrator SHALL be created by accepting
an invitation or by an administrative command that atomically provisions an
enabled user, a credential awaiting a password and an initial password-reset
token verifier. Only setup and invitation acceptance SHALL accept a supplied
password at account creation. Commands SHALL encode their actor, time,
lifecycle guards, and complete outcome in dedicated input and result types
independent of database transactions and persistence rows. Persistence-facing values
SHALL contain only derived credential, email-subject, and rate-limit
identifiers, and invitation and reset tokens SHALL cross the port only as
plaintext inputs or once-returned outputs, never as stored values.

The security lifecycle contract SHALL be offered as three separate capability
ports: an account port (setup completion and first-administrator bootstrap,
user creation and listing, role or disabled-state changes, invitations, password
resets, display-name and password changes), a session port (listing and
deleting sessions of a user), and a token port (setup, build and import
credential issuance, listing, verification, resolution and revocation). Each
command SHALL belong to exactly one of the three ports. The runtime security
service SHALL be the combination of the user-profile read and the three
ports. Each runtime adapter SHALL implement that combination. A use case SHALL
declare only the ports whose commands it calls, so a caller can supply an
adapter that implements just those ports.

#### Scenario: A runtime adapter implements a security command
- **WHEN** a Node or Cloudflare adapter receives a portable setup, user,
invitation, reset, session, token, or limiter command
- **THEN** it can enforce the documented guarded outcome without importing an
HTTP DTO or exposing a database row to application callers

#### Scenario: Concurrent acceptance of one invitation
- **WHEN** two acceptances of the same invitation token run concurrently
- **THEN** exactly one creates the account and the other fails with the
  invalid-invitation outcome

#### Scenario: Every security command has one capability port
- **WHEN** the account, session and token ports are combined with the
  user-profile read
- **THEN** the combination declares exactly the commands, inputs and outcomes
  of the runtime security service, and no command appears in two ports

#### Scenario: Both runtime adapters implement the combined service
- **WHEN** the workspace type check runs over the Node and Cloudflare security
  adapters
- **THEN** each adapter satisfies the combined security service

#### Scenario: Account use cases accept only the ports they call
- **WHEN** the account use cases are constructed with an adapter that
  implements the user-profile read, the account port and the session port but
  not the token port
- **THEN** the construction type-checks and direct creation, invitation,
  reset, profile, password and session flows produce the same outcomes as
  with the full security service

### Requirement: Application use cases authorize security administration

Portable application operations SHALL check session authority and the domain permission policy before accessing managed data or invoking a write, an email sender, or a readiness probe. Creating, listing and updating users, managing invitations, issuing an administrative password reset and ending a user's sessions SHALL require `users:manage`. Reading settings status, sending a test email, and listing, issuing or revoking build and import tokens SHALL require `settings:manage`. Issuing a publishing import token SHALL also require `content:publish`. Session-only operations SHALL deny delegated actors, including actors whose underlying role is administrator.

Token management SHALL use the composed clock for creation, revocation and import expiry. The import creator SHALL be the acting user, with a lifetime of one to seven whole days. List and revoke results SHALL contain token metadata only. Token issuance and revocation SHALL preserve the existing kind separation, one-time plaintext disclosure and retry outcomes. User and invitation changes SHALL use the existing guarded persistence operations, including final-administrator protection, atomic direct creation and invitation acceptance, and credential invalidation on account-security events.

#### Scenario: A caller reaches the application without HTTP

- **WHEN** an editor invokes a user-management or settings operation directly, or a delegated administrator actor invokes a session-only operation
- **THEN** the operation returns the shared authorization denial with zero protected reads, writes, readiness probes or email sends

#### Scenario: Import token authority and time come from the use case

- **WHEN** an authorized session actor requests an import token of a valid lifetime using a fixed clock
- **THEN** the token is attributed to that actor, creation time and expiry use the fixed clock, and only issuance returns the plaintext

#### Scenario: Invalid import token issuance does no credential work

- **WHEN** the actor asks for publication without `content:publish`, or supplies a lifetime outside the supported bounds
- **THEN** the operation fails before issuing a credential

#### Scenario: Concurrent user updates preserve an active administrator

- **WHEN** two authorized calls concurrently attempt to disable or demote the last two enabled administrators with a password
- **THEN** at most one succeeds, a refused update reports `LAST_ADMIN_PROTECTED`, and at least one enabled administrator with a password remains on both runtimes
