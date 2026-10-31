## MODIFIED Requirements

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
- **THEN** the application receives that user's current identity/role together with delegated limits, publication is allowed only when the token's grant includes `content:publish`, and unpublication and deletion remain denied
