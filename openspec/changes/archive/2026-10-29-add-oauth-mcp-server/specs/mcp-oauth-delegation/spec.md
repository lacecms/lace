## Purpose

Allows existing Lace users to delegate bounded content access to MCP clients
through OAuth and to inspect and revoke that access without sharing passwords.

## ADDED Requirements

### Requirement: OAuth uses existing accounts and explicit consent
When MCP is enabled, the system SHALL implement authorization code with S256
PKCE for public MCP clients and refresh-token renewal. An unauthenticated
authorization request SHALL use the existing `/admin/sign-in` form and resume
only a validated, server-bound authorization transaction after login. An active
session SHALL identify the user but SHALL NOT replace explicit first consent.
The consent page SHALL display the escaped client name, callback hostname,
requested supported access and the permanent ban on publishing, unpublishing
and deleting through MCP. Approval/denial SHALL require the current enabled
user's same-origin, CSRF-protected session. Approval SHALL bind the user, client,
exact redirect URI, resource and approved scopes; denial SHALL issue no tokens.
The system SHALL NOT create accounts, change roles, request an external identity
provider or supply the user's password/cookie to the MCP client. Login return
destinations SHALL be same-origin and unable to carry an arbitrary redirect.

#### Scenario: First connection
- **WHEN** an existing user starts authorization without a browser session
- **THEN** the existing sign-in form appears, successful login resumes the validated transaction, and tokens are issued only after consent

#### Scenario: Consent is denied or forged
- **WHEN** the user denies consent or a different origin submits approval
- **THEN** no grant or token is issued and an unvalidated callback is never followed

#### Scenario: Viewer is asked for write access
- **WHEN** a viewer is asked to authorize draft writes
- **THEN** the server refuses that grant without promoting the user or silently granting additional access

### Requirement: Discovery and client registration have a closed scope
The enabled server SHALL publish canonical authorization-server metadata and
RFC 9728 protected-resource metadata, and SHALL return a `401`
`WWW-Authenticate` challenge referencing the latter when MCP credentials are
missing or invalid. The sole resource SHALL be the canonical configured MCP URL;
request Host/forwarding headers SHALL NOT select the issuer or resource. The
server SHALL support public-client dynamic registration for authorization code
with PKCE, advertising its registration endpoint. Registration SHALL accept only
bounded client metadata and exact redirect URIs permitted by OAuth native/web
client rules; wildcard, credential-bearing, fragment-bearing and arbitrary
production HTTP redirects SHALL be refused. Client-controlled URLs SHALL NOT
be fetched for metadata, icons, discovery or software statements in this phase.
Client credentials, implicit/password/device grants, external identity and
client management of users or privileges SHALL remain unavailable.

#### Scenario: Discover and register
- **WHEN** an unauthenticated MCP client discovers the resource and registers a valid public-client callback
- **THEN** it receives a client identifier usable only for the supported OAuth flow, without a CMS account, session or content access

#### Scenario: Registration supplies a private metadata URL
- **WHEN** registration includes a URL pointing at a private service
- **THEN** the server does not fetch it or embed it as active content in consent

#### Scenario: Callback or resource substitution
- **WHEN** authorization or code exchange changes the registered callback or names another resource
- **THEN** it is rejected before token issuance or redirection to an unvalidated destination

### Requirement: Token authority is limited by current account and operation
Supported content scopes SHALL be `content:read` and `content:write`; refresh
renewal SHALL require `offline_access`. Write consent SHALL include read access.
Every MCP request SHALL verify token integrity or opaque-token validity, issuer,
resource/audience, expiry, client/grant binding and durable revocation status,
then resolve the current persisted enabled user and valid Lace role. Effective
authority SHALL be the intersection of current role permissions, the original
consented scope ceiling, token scopes and the fixed MCP operation allowlist.
Only metadata/list/load/create/save operations SHALL be grantable. A claimed
role, user ID, scope or operation in tool arguments SHALL NOT influence
authority. Demotion SHALL affect the next request; promotion SHALL NOT expand
an existing consent ceiling. Refresh SHALL NOT widen that ceiling. A browser
cookie or existing build token alone SHALL NOT authenticate MCP, and an MCP
token SHALL NOT authenticate ordinary admin REST routes or account operations.

#### Scenario: Editor is demoted
- **WHEN** an editor with an unexpired write token becomes a viewer
- **THEN** the next MCP save is denied before content work while otherwise valid read access follows the current role

#### Scenario: User is promoted
- **WHEN** a viewer with a read-only connection becomes an administrator
- **THEN** the connection remains read-only until a new explicit write consent, and publication/deletion never become available

#### Scenario: Token crosses the boundary
- **WHEN** an MCP token is sent to admin REST, or a build token/session cookie is sent alone to MCP
- **THEN** it grants no authority at that boundary

### Requirement: Tokens and grants are durable and revocable
Authorization codes SHALL expire within five minutes and be redeemable once.
Access tokens SHALL expire within fifteen minutes; refresh tokens SHALL expire
within thirty days, rotate atomically on use and never outlive their grant.
Concurrent redemption/refresh SHALL allow one winner only; reuse of a rotated
refresh token SHALL revoke that token family, including issued access-token
authority, and require a new connection. Private credentials SHALL be hashed
or encrypted at rest as appropriate; signing keys SHALL be durable and not
generated afresh per process/isolate. Node and D1 SHALL enforce the same
atomicity. Each protected request and refresh SHALL check durable grant state,
so expiry-only JWT verification SHALL NOT substitute for revocation checks.
Requests beginning after revocation commits SHALL fail; already committed
content changes SHALL NOT be undone. Ordinary browser sign-out SHALL leave
independent OAuth connections intact. Account disable, password reset,
administrator sign-out-everywhere and password change with revoke-others SHALL
revoke all affected OAuth grants/refresh families as well as existing session
effects. The shared security boundary SHALL prevent an account-wide
invalidation from reporting success while affected grants remain usable, and
SHALL preserve that invalidation through interruption/retry. Re-enabling an
account SHALL NOT revive revoked connections.

#### Scenario: Concurrent code redemption
- **WHEN** two exchanges redeem the same valid code concurrently
- **THEN** at most one issues tokens on Node and D1 and no partial second grant appears

#### Scenario: Revocation reaches an unexpired access token
- **WHEN** connection revocation commits and a new request presents its still-unexpired access token
- **THEN** authorization fails before any content work

#### Scenario: Refresh response is lost
- **WHEN** refresh commits but its response is lost and the client retries the consumed refresh token
- **THEN** the token family is revoked and the client must reconnect rather than silently receiving wider or duplicate authority

#### Scenario: Disabled account is re-enabled
- **WHEN** an administrator disables then re-enables a connected user
- **THEN** old access/refresh tokens remain unusable and fresh consent is required

### Requirement: Users manage their own MCP connections
When enabled, every signed-in user SHALL have a protected MCP-connections
section in `/admin/account`, backed by session-authenticated list and revoke
operations for that user's connections. It SHALL show client display identity,
granted content scopes, creation/expiry and last use when available, never
tokens, codes or secrets. Revocation SHALL be explicit, idempotent for an owned
connection and guarded by current session and CSRF/origin protections. Another
user's connection identifier SHALL return `404` without disclosing ownership.
The disabled installation SHALL hide the section and refuse its endpoints.

#### Scenario: User revokes a connection
- **WHEN** a user confirms revocation of one of their connections
- **THEN** that connection can no longer access or refresh, and the user's browser session and other connections remain usable

#### Scenario: Cross-user connection management
- **WHEN** a signed-in user requests another user's connection identifier
- **THEN** the response is `404` and the connection remains unchanged

### Requirement: OAuth traffic is bounded without leaking credentials
Registration SHALL use the existing trusted-client-address limiter with a
limit of ten attempts per fifteen minutes. Token requests SHALL be limited to
sixty per minute per client and trusted client address; connection revocations
SHALL be limited to twenty per hour per user. Consent and login SHALL retain
same-origin/CSRF and existing authentication protections. `429` responses SHALL
include `Retry-After`. OAuth endpoints SHALL use bounded bodies and return
protocol-appropriate sanitized errors without tokens, passwords, raw request
bodies or SQL in logs. Authorization endpoint queries SHALL be redacted from
logs, including reverse-proxy/operational examples. MCP requests SHALL NOT use
query-string access tokens. Token/consent responses SHALL be non-cacheable;
browser storage SHALL NOT persist OAuth credentials.

#### Scenario: Registration abuse
- **WHEN** a client exceeds its registration window
- **THEN** it receives `429` with `Retry-After` and no new registration is persisted

#### Scenario: Credential-bearing failure
- **WHEN** a malformed token request or unexpected provider error occurs
- **THEN** its safe OAuth failure is returned without placing credential material in application logs or an error page
