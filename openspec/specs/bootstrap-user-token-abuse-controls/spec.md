# bootstrap-user-token-abuse-controls Specification

## Purpose
Defines the secure installation bootstrap and automation-credential controls
that let a single Lace deployment gain admins and build access without exposing
passwords, token secrets, or sensitive identifying data.

## Requirements

### Requirement: One-time bootstrap establishes the first administrator
The system SHALL mint a setup credential only while installation setup is
incomplete, with a bounded expiry and hash-only persistence. It SHALL accept
that credential, an email, and a password at the setup-admin endpoint, claim
the credential atomically for a one-way digest of the requested email before
creating the provider user, create the first user with the `admin` role, record
the setup administrator, and consume all outstanding setup credentials. A
retry with the same credential and email SHALL resume completion safely; an
expired, consumed, unknown, or differently claimed credential SHALL not create
or modify a user. The endpoint SHALL return `404` once setup is complete.

#### Scenario: Bootstrap is interrupted after a claim
- **WHEN** a valid setup credential is claimed for an email and completion is
  interrupted before setup is recorded as complete
- **THEN** a retry with that credential and email can complete the same
  first-admin setup without creating a competing administrator

#### Scenario: Another email attempts to take a claim
- **WHEN** an unconsumed setup credential is already claimed for one email
  digest and a request supplies the credential with another email
- **THEN** the request is rejected without creating or modifying a user

#### Scenario: Setup has completed
- **WHEN** installation state records a setup administrator
- **THEN** the setup-admin endpoint returns `404` and bootstrap credential
  minting refuses to create another credential

### Requirement: Administrators manage users without removing the final administrator
The system SHALL allow only an actor with `users:manage` to list users, create
a user with a selected valid role, disable a user, or change a user's role.
Disabled users SHALL not resolve to authenticated actors. The system SHALL
reject a disable or demotion that would leave no active `admin` user, including
concurrent competing requests, and SHALL leave the protected administrator
active with its role unchanged.

#### Scenario: An administrator changes a user role
- **WHEN** an authenticated administrator requests a valid role change for an
  active user and another active administrator remains if needed
- **THEN** the user record has the requested valid role and subsequent sessions
  resolve with that role

#### Scenario: Final administrator is protected
- **WHEN** a request would disable or demote the only active administrator
- **THEN** the request is rejected and that user remains active with the
  `admin` role

#### Scenario: A non-administrator manages users
- **WHEN** an authenticated editor or viewer requests user list or mutation
- **THEN** the request receives the standard authorization denial and performs
  no user read or mutation

### Requirement: Build credentials remain narrowly scoped and revocable
The system SHALL issue an opaque randomly generated build credential with only
the `content:build:read` capability, display its plaintext value exactly once,
and persist only a non-reversible verifier, display prefix, metadata, and
lifecycle timestamps. It SHALL compare presented credentials without
secret-dependent timing, reject an expired-or-revoked credential, and update
`last_used_at` only after a successful build-export authorization. Browser
sessions and credentials with any other capability SHALL not authenticate a
build export through this mechanism.

#### Scenario: Build credential is issued
- **WHEN** an authorized administrator creates a build credential
- **THEN** the response is the only time its plaintext value is returned and
  all later token listings expose only metadata and its display prefix

#### Scenario: Revoked credential is presented
- **WHEN** a caller presents a formerly valid credential after it is revoked
- **THEN** build export is denied and its `last_used_at` value is not advanced

#### Scenario: Valid credential reads an export
- **WHEN** a caller presents a valid active build credential to build export
- **THEN** the endpoint returns only published build data and records its use

### Requirement: Sensitive operations use portable fixed-window controls
The system SHALL apply fixed-window limits before authentication, setup,
token-management, and upload operations. It SHALL count successful and failed
requests, persist only an HMAC projection of operation plus the applicable
actor, email, or client-IP subject, and return `429` with a `Retry-After`
value when a window is exhausted. Default maximums SHALL be 10 sensitive auth
attempts per 15 minutes, 5 setup attempts per hour, 20 token-management
attempts per hour per administrator, and 30 upload attempts per minute per
actor; deployments MAY lower, but SHALL NOT raise, these limits.

#### Scenario: Setup limit is exhausted
- **WHEN** one setup subject makes more than five setup attempts in an hour
- **THEN** the sixth request is rejected before bootstrap work with `429` and
  a `Retry-After` value for the current window

#### Scenario: Subjects cannot be recovered from stored buckets
- **WHEN** a persisted rate-limit bucket is inspected
- **THEN** it contains no raw email address or client IP and cannot identify a
  subject without the configured HMAC secret

### Requirement: Cookie-authenticated management mutations enforce trusted origins
Before resolving a session actor for an unsafe HTTP method, the shared auth boundary SHALL deny an explicit untrusted, opaque or malformed Origin and origin-less browser requests marked cross-site by Fetch Metadata. Provider and Lace mutations SHALL use the same configured trusted-origin policy: canonical origin in production, with the existing development-only localhost/127.0.0.1 alias at the same scheme and port. Ordinary origin-less non-browser requests and safe reads SHALL preserve their existing contracts. Denial SHALL use sanitized existing authorization errors and SHALL NOT create or change users, content, tokens or media. Existing role, session, cookie, setup and provider CSRF rules SHALL remain in force.

#### Scenario: A foreign origin submits a valid administrator cookie
- **WHEN** a foreign-origin request attempts a Lace management mutation with a valid administrator cookie
- **THEN** it is denied before protected work, and persisted protected state remains unchanged on Node and Worker

#### Scenario: An operator submits a non-browser request without Origin
- **WHEN** a valid authenticated operator request has no Origin or cross-site Fetch Metadata
- **THEN** its original role and session authorization rules apply

### Requirement: Rate-limit subjects come from a trusted runtime boundary
Node SHALL derive client identity from the transport peer by default, ignoring caller-supplied forwarding headers. A configured trusted proxy policy SHALL accept forwarded identity only from an allowed immediate peer and resolve a validated chain from the trusted end; malformed or untrusted chains SHALL NOT select an arbitrary caller identity. Cloudflare SHALL use its platform-supplied client identity at its trusted ingress, not arbitrary forwarding headers. Lace authentication/setup protection and the authentication provider's sign-in protection SHALL use the same resolved identity. Missing trustworthy identity SHALL fail conservatively without accepting spoofed headers. Configuration failures SHALL identify setting names without values. Raw identities SHALL NOT enter logs or Lace's persisted buckets.

Authenticated upload and token-management limits SHALL use the validated actor identity, and caller headers SHALL NOT bypass those limits. Existing default limits, HMAC persistence, denied-request behavior and authorization requirements SHALL remain in force.

#### Scenario: A direct caller changes forwarding headers
- **WHEN** one direct Node client exhausts authentication attempts and changes X-Forwarded-For or a provider IP header
- **THEN** the same subject remains limited with 429 and Retry-After

#### Scenario: Two clients use a trusted proxy
- **WHEN** a configured proxy supplies valid distinct client chains for two clients
- **THEN** both authentication limiters distinguish the clients and forged values prepended by either client do not bypass their own limit

#### Scenario: Actors share a proxy
- **WHEN** two authenticated actors upload or manage tokens through the same proxy
- **THEN** their permitted operations count against separate actor limits and changing request IP headers does not reset either limit

#### Scenario: Client identity is unavailable
- **WHEN** no trustworthy transport or platform identity is available
- **THEN** protection uses a documented conservative fallback without trusting a caller's replacement header
