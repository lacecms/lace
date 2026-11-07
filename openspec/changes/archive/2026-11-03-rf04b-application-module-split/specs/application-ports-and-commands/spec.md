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

The security lifecycle contract SHALL be offered as three separate capability
ports: an account port (setup completion and first-administrator bootstrap,
user listing and role or disabled-state changes, invitations, password
resets, display-name and password changes), a session port (listing and
deleting sessions of a user), and a token port (setup, build and import
credential issuance, listing, verification, resolution and revocation). Each
command SHALL belong to exactly one of the three ports. The runtime security
service SHALL be the combination of the user-profile read and the three
ports, with the same commands, inputs and outcomes as before the split, and
each runtime adapter SHALL implement that combination. A use case SHALL
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
- **THEN** each adapter satisfies the combined security service without any
  change to its methods

#### Scenario: Account use cases accept only the ports they call
- **WHEN** the account use cases are constructed with an adapter that
  implements the user-profile read, the account port and the session port but
  not the token port
- **THEN** the construction type-checks and invitation, reset, profile,
  password and session flows produce the same outcomes as with the full
  security service
