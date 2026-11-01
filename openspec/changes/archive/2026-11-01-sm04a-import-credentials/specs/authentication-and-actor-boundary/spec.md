## ADDED Requirements

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
with the standard authorization denial before application work. A browser
session SHALL never resolve an import actor, and an import credential SHALL
NOT authenticate MCP. Content mutations SHALL record the creating user as the
actor. Logs SHALL contain the actor ID and never the credential.

#### Scenario: Cookie and Bearer together
- **WHEN** a request carries a valid administrator session cookie and an invalid import Bearer value
- **THEN** the request is denied and the session is not used

#### Scenario: Demoted creator
- **WHEN** the creator of a publishing import credential is changed to the editor role
- **THEN** draft and media writes through the credential still succeed and publication is denied

#### Scenario: Disabled creator
- **WHEN** an import credential's creator is disabled after it was issued
- **THEN** every request with the credential is denied before application work

#### Scenario: Import credential at MCP
- **WHEN** a client presents a valid import credential to `/mcp`
- **THEN** the MCP boundary rejects it as an invalid token

### Requirement: Bearer import requests keep an explicit origin policy
Because an import Bearer request never authenticates through ambient browser
state, the cross-site Fetch Metadata rule for origin-less browser mutations
SHALL NOT apply to it. An unsafe import request that carries an explicit
`Origin` outside the configured trusted origins SHALL still be denied before
protected work. Cookie-authenticated requests SHALL keep every existing origin
and CSRF rule.

#### Scenario: Command-line request without Origin
- **WHEN** a command-line client saves a draft with a valid import credential and no `Origin` header
- **THEN** the save follows the attenuated actor's ordinary authorization

#### Scenario: Foreign Origin with an import credential
- **WHEN** a request with a valid import credential and `Origin: https://evil.example` attempts a draft save
- **THEN** it is denied and the draft is unchanged
