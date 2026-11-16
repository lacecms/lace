## ADDED Requirements

### Requirement: Application use cases authorize security administration

Portable application operations SHALL check session authority and the domain permission policy before accessing managed data or invoking a write, an email sender, or a readiness probe. Listing and updating users, managing invitations, issuing an administrative password reset and ending a user's sessions SHALL require `users:manage`. Reading settings status, sending a test email, and listing, issuing or revoking build and import tokens SHALL require `settings:manage`. Issuing a publishing import token SHALL also require `content:publish`. Session-only operations SHALL deny delegated actors, including actors whose underlying role is administrator.

Token management SHALL use the composed clock for creation, revocation and import expiry. The import creator SHALL be the acting user, with a lifetime of one to seven whole days. List and revoke results SHALL contain token metadata only. Token issuance and revocation SHALL preserve the existing kind separation, one-time plaintext disclosure and retry outcomes. User and invitation changes SHALL use the existing guarded persistence operations, including final-administrator protection, atomic invitation acceptance and credential invalidation on account-security events.

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

- **WHEN** two authorized calls concurrently attempt to disable or demote the last two active administrators
- **THEN** at most one succeeds, a refused update reports `LAST_ADMIN_PROTECTED`, and at least one active administrator remains on both runtimes

### Requirement: Application use cases enforce account and credential boundaries

Application use cases SHALL expose setup state and first-administrator completion using the existing guarded bootstrap protocol. Public invitation inspection and acceptance and public password-reset request and confirmation SHALL use the existing anonymous lifecycles and their credential, invalid-token and non-disclosure rules.

Session summary, account capabilities, profile and password changes, session management and optional MCP connection management SHALL require session authority for any current Lace role. The application SHALL derive the account owner from the authenticated actor, use the trusted session identifier to mark and protect the current session, and derive summary permissions from the domain role policy. The import-credential description SHALL use the import credential and attenuated actor supplied by successful import authentication. It SHALL expose only that credential's existing metadata and the actor's effective permissions.

#### Scenario: A delegated caller attempts account self-service

- **WHEN** a direct caller presents an import or MCP actor to read a session summary, change a profile or manage a session or connection
- **THEN** the operation denies access before reading or modifying account data

#### Scenario: Session identity controls ownership

- **WHEN** a signed-in viewer lists sessions and attempts to revoke another user's session or their own current session
- **THEN** the list contains only their own sessions, marks the current session, and the revocation attempts return the existing not-found and conflict outcomes respectively

#### Scenario: Setup resumes after an interrupted claim

- **WHEN** first-administrator setup is retried with the same credential and email after an interrupted claim
- **THEN** bootstrap resumes through the existing claim without creating a second administrator

#### Scenario: An invitation is accepted once

- **WHEN** two requests attempt to accept a single invitation concurrently
- **THEN** exactly one creates an account and the other receives the invalid-invitation outcome

### Requirement: Application use cases authorize site-build administration

The application SHALL require a session actor with `content:read` to return the safe configured build-site identity or read build history or details. Manual build and retry commands SHALL require a session actor with `settings:manage` and SHALL retain the existing durable queueing behavior.

#### Scenario: A viewer reads builds and attempts to queue a retry

- **WHEN** a signed-in viewer reads build site selection and build history and then requests a retry
- **THEN** the reads succeed and the retry is denied without writing a build or outbox event

#### Scenario: Delegated content read does not grant build access

- **WHEN** a delegated actor with `content:read` directly requests build site selection or history
- **THEN** the application denies access before reading build data
