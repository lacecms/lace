## ADDED Requirements

### Requirement: Authentication failures are distinct from authorization denials
The REST API on both runtimes SHALL answer `401` with the shared envelope and
code `AUTHENTICATION_REQUIRED`, before application work, when a protected
route receives no credential it accepts, or a presented credential that does
not resolve to an active actor. This covers:

- an absent, expired, revoked, disabled-account or invalid-role session;
- a session whose user profile is missing or disabled when the session summary
  is read;
- a malformed, unknown, expired, revoked or wrong-kind import Bearer value on
  an allowlisted import route;
- a missing, malformed or rejected build token on the build export.

That `401` envelope is the unauthenticated response named by other
requirements. It SHALL carry a sanitized message that does not reveal which
check failed, `Cache-Control: no-store`, and a `WWW-Authenticate` header:

- `Bearer realm="lace"` on the build export;
- `Session realm="lace", Bearer realm="lace"` on import-allowlisted routes;
- `Session realm="lace"` on every other protected route.

The API SHALL answer `403` `AUTHORIZATION_DENIED` only after authentication,
or when the request shape is refused whatever the credential:

- a resolved actor lacks the permission or content operation;
- a credential kind the route never accepts is presented, such as a Bearer
  value outside the import allowlist, or a session on the route that describes
  the presented import token;
- a browser-session-only operation is reached by a non-session actor;
- an origin, Fetch Metadata or CSRF rule refuses the request.

Rate limits keyed by actor SHALL NOT be consumed by a request answered with
`401`. MCP keeps its OAuth `401` and `403` challenges. The authentication
provider's own `/api/auth/*` endpoints keep their responses.

#### Scenario: No session on an admin route
- **WHEN** a request without a session cookie calls `GET /api/v1/admin/entries/:id`
- **THEN** the response is `401` `AUTHENTICATION_REQUIRED` with
  `WWW-Authenticate: Session realm="lace", Bearer realm="lace"` and no
  content is read

#### Scenario: Expired session
- **WHEN** a request presents a session cookie whose session has expired
- **THEN** the response is `401` `AUTHENTICATION_REQUIRED`

#### Scenario: Authenticated viewer lacks permission
- **WHEN** a valid viewer session publishes an entry
- **THEN** the response is `403` `AUTHORIZATION_DENIED` and nothing changes

#### Scenario: Rejected build token
- **WHEN** the build export is requested with an unknown or revoked build token,
  or without an `Authorization` header
- **THEN** the response is `401` `AUTHENTICATION_REQUIRED` with
  `WWW-Authenticate: Bearer realm="lace"` and no export content is read

#### Scenario: Import-token description without any credential
- **WHEN** the route that describes the presented import token is called with
  no credential
- **THEN** the response is `401` `AUTHENTICATION_REQUIRED`, while the same
  call with only a valid session is `403` `AUTHORIZATION_DENIED`

#### Scenario: Foreign origin stays a denial
- **WHEN** an authenticated session revokes an OAuth connection with an
  `Origin` outside the configured origin
- **THEN** the response is `403` `AUTHORIZATION_DENIED`

#### Scenario: Runtime parity
- **WHEN** the same unauthenticated and unauthorized requests run against
  Node and the Worker
- **THEN** both return identical statuses, codes, messages and
  `WWW-Authenticate` values

## MODIFIED Requirements

### Requirement: Disabled accounts fail closed at actor resolution
The authentication boundary SHALL refuse to resolve an actor from a valid
provider session when its persisted user account has been disabled. It SHALL
not disclose the disabled state through a session or actor response. Disabling
an account SHALL additionally delete its sessions, so the refusal also holds
if the account is later re-enabled.

#### Scenario: Disabled user presents a valid session
- **WHEN** a session belonging to a disabled user reaches a protected route
- **THEN** actor resolution fails and the route returns `401`
  `AUTHENTICATION_REQUIRED` before application work runs

#### Scenario: Re-enabled account does not revive old sessions
- **WHEN** an administrator disables and then re-enables a user
- **THEN** sessions created before the disable remain rejected and the user
  must sign in again

### Requirement: An import credential resolves an attenuated actor for its creator
A request carrying `Authorization: Bearer <value>` on an import-enabled admin
route SHALL be authenticated only as an import credential and SHALL NOT fall
back to a session cookie, even when one is present. A valid credential SHALL
resolve the creating user's persisted, current, enabled account and role,
attenuated to the permissions `content:read`, `content:write` and `media:write`
and the content operations `discoverModels`, `list`, `load`, `create` and
`save`, plus `content:publish` and `publish` when the credential carries
`content:publish`. The effective authority SHALL be the intersection with the
current role, so a demoted creator loses permissions the new role lacks. A
disabled or missing creator, a malformed header, a query-string credential and
a credential that is unknown, expired, revoked or of another kind SHALL fail
with `401` `AUTHENTICATION_REQUIRED` before application work. A Bearer
credential on a management route outside the import allowlist SHALL fail
with `403` `AUTHORIZATION_DENIED` whatever its validity. A browser
session SHALL never resolve an import actor, and an import credential SHALL
NOT authenticate MCP. Content mutations SHALL record the creating user as the
actor. Logs SHALL contain the actor ID and never the credential.

#### Scenario: Cookie and Bearer together
- **WHEN** a request carries a valid administrator session cookie and an invalid import Bearer value
- **THEN** the request fails with `401` `AUTHENTICATION_REQUIRED` and the
  session is not used

#### Scenario: Demoted creator
- **WHEN** the creator of a publishing import credential is changed to the editor role
- **THEN** draft and media writes through the credential still succeed and publication is denied

#### Scenario: Disabled creator
- **WHEN** an import credential's creator is disabled after it was issued
- **THEN** every request with the credential fails with `401`
  `AUTHENTICATION_REQUIRED` before application work

#### Scenario: Import credential at MCP
- **WHEN** a client presents a valid import credential to `/mcp`
- **THEN** the MCP boundary rejects it as an invalid token

#### Scenario: Import credential outside the allowlist
- **WHEN** a valid import credential is presented to a management route that
  is not on the import allowlist
- **THEN** the request fails with `403` `AUTHORIZATION_DENIED` and no
  application work runs
