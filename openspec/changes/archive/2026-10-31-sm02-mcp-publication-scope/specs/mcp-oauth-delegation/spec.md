## MODIFIED Requirements

### Requirement: OAuth uses existing accounts and explicit consent
When MCP is enabled, the system SHALL implement authorization code with S256
PKCE for public MCP clients and refresh-token renewal. An unauthenticated
authorization request SHALL use the existing `/admin/sign-in` form and resume
only a validated, server-bound authorization transaction after login. An active
session SHALL identify the user but SHALL NOT replace explicit first consent.
The consent page SHALL display the escaped client name, callback hostname,
requested supported access and the permanent ban on unpublishing and deleting
through MCP. When publication is requested, the page SHALL offer it as a
separate access choice, unavailable when the user's current role lacks
`content:publish`, and SHALL state that published content reaches the public
site with the next build. The least-privileged choice SHALL remain the default,
and the user SHALL be able to explicitly approve narrower access than requested. Approval/denial SHALL require the current enabled
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

#### Scenario: Editor is asked for publication
- **WHEN** an editor opens consent for a request that includes `content:publish`
- **THEN** the publication choice is unavailable with an explanation, the editor can explicitly approve read or draft access instead, and any approval that still includes `content:publish` is refused without issuing a grant or promoting the user

#### Scenario: Administrator approves publication
- **WHEN** an administrator approves a request with read, write and publish scopes
- **THEN** the consent page has shown publication and the unpublish/delete ban, and the issued grant records all three content scopes

### Requirement: Token authority is limited by current account and operation
Supported content scopes SHALL be `content:read`, `content:write` and
`content:publish`, all advertised in discovery metadata; refresh renewal SHALL
require `offline_access`. Write consent SHALL include read access, and publish
consent SHALL include read and write access.
Every MCP request SHALL verify token integrity or opaque-token validity, issuer,
resource/audience, expiry, client/grant binding and durable revocation status,
then resolve the current persisted enabled user and valid Lace role. Effective
authority SHALL be the intersection of current role permissions, the original
consented scope ceiling, token scopes and the fixed MCP operation allowlist.
Only metadata/list/load/create/save operations and, under `content:publish`,
the publish operation SHALL be grantable. Unpublish, delete, revert, duplicate
and every other operation SHALL NOT be grantable. A claimed
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
- **THEN** the connection remains read-only until a new explicit consent, publication becomes available only through a new consent that includes `content:publish`, and unpublication/deletion never become available

#### Scenario: Administrator with publish scope is demoted
- **WHEN** an administrator with an unexpired publish-scoped token becomes an editor
- **THEN** the next `publish_entry` call is denied before content work while draft writes follow the editor role

#### Scenario: Existing grant lacks the publish scope
- **WHEN** a connection created before this scope existed calls `publish_entry`
- **THEN** the request fails with `insufficient_scope` naming `content:publish` and the connection is not widened by refresh

#### Scenario: Token crosses the boundary
- **WHEN** an MCP token is sent to admin REST, or a build token/session cookie is sent alone to MCP
- **THEN** it grants no authority at that boundary
