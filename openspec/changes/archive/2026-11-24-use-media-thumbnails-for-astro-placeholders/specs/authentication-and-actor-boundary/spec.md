## MODIFIED Requirements

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
- a missing, malformed or rejected build token on the build export or build
  thumbnail route.

That `401` envelope is the unauthenticated response named by other
requirements. It SHALL carry a sanitized message that does not reveal which
check failed, `Cache-Control: no-store`, and a `WWW-Authenticate` header:

- `Bearer realm="lace"` on the build export and build thumbnail route;
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
