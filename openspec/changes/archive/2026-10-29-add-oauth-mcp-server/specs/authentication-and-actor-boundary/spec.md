## MODIFIED Requirements

### Requirement: Email/password authentication is closed to public enrollment
The system SHALL provide email/password browser authentication at `/api/auth/*`
and SHALL reject public sign-up attempts. It SHALL create no user, account, or
session as a result of a rejected public sign-up. The provider's email
sign-in, sign-out and get-session routes SHALL remain reachable. Only while MCP
is enabled, an additional explicit method/path allowlist SHALL expose the OAuth
authorization, consent, token, registration, revocation and signing-key routes
needed by `mcp-oauth-delegation`, with its discovery aliases routed explicitly.
Every other `/api/auth/*` path, including provider sign-up, password-change,
password-reset, user-update and session-listing routes, SHALL return `404`
without reaching the provider, so account changes happen only through Lace
routes. Disabled MCP SHALL restore the original three-route allowlist; enabling
a provider plugin SHALL NOT automatically expose all of its endpoints. Session and
credential material SHALL be managed by the authentication provider and SHALL
not be included in Lace API logs or error responses.

#### Scenario: Public sign-up is attempted
- **WHEN** an unauthenticated client calls the provider's email sign-up route
- **THEN** the request is rejected and no new user, credential account, or
  authenticated session is created

#### Scenario: Existing user signs in
- **WHEN** a user with a valid email/password credential calls the provider's
  sign-in route from a trusted origin
- **THEN** the response establishes the provider session according to its
  cookie policy without exposing the credential verifier

#### Scenario: Provider account route is called directly
- **WHEN** a signed-in client calls the provider's change-password or
  list-sessions route
- **THEN** the response is `404` and neither the credential nor any session
  token is exposed or changed

#### Scenario: First administrator setup is unchanged
- **WHEN** setup is incomplete and a client submits the one-time setup token,
  email and password to the setup route
- **THEN** the first administrator is created exactly as before and can sign in

#### Scenario: MCP expands only its explicit provider surface
- **WHEN** MCP is enabled and a client requests a required OAuth endpoint followed by a provider account-management endpoint
- **THEN** only the allowlisted OAuth method/path reaches the provider and the account-management request remains `404`

#### Scenario: MCP is disabled
- **WHEN** a client requests a previously enabled OAuth token or registration endpoint
- **THEN** it receives `404` before the provider runs while the original browser sign-in routes remain reachable

### Requirement: A validated session supplies the complete application actor
For existing session-protected admin routes, the system SHALL resolve the
request's actor only from a validated, unexpired browser session whose user
record contains a valid Lace role. Only the enabled MCP boundary SHALL also
resolve an actor through the separate OAuth verification and current-account
rules of `mcp-oauth-delegation`; that actor SHALL retain its server-derived
delegated operation and permission ceiling through application dispatch. It SHALL map
the persisted user identifier and role to the application actor and SHALL deny
the protected request when its required credential is absent, invalid, expired, revoked,
or joined to an invalid role. OAuth credentials SHALL NOT replace the session
on ordinary admin routes, and browser sessions SHALL NOT replace MCP tokens. A newly created provider user SHALL receive the `viewer`
role unless an authorized future workflow changes it.

#### Scenario: Session resolves as viewer
- **WHEN** a valid authenticated session belongs to a user persisted with the
  `viewer` role
- **THEN** a protected use case receives an actor with that user identifier and
  the `viewer` role

#### Scenario: Invalid session or role is presented
- **WHEN** a session-protected request has no valid session or its resolved user role is
  absent or outside `admin`, `editor`, and `viewer`
- **THEN** the request is denied before application content work runs

#### Scenario: MCP actor retains its restrictions
- **WHEN** a valid MCP access token belongs to a currently enabled administrator
- **THEN** the application receives that user's current identity/role together with delegated limits, and publication, unpublication and deletion remain denied
