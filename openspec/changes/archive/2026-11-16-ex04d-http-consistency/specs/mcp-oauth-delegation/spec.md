## ADDED Requirements

### Requirement: Account traverses owned connection pages
The Account screen SHALL use the common continuation contract to load
additional owned connections. Connection lists SHALL continue to include
expired and revoked connections with their existing status. Each request
SHALL derive ownership from the current session.

#### Scenario: More owned connections are available
- **WHEN** the Account screen receives a connection page with a continuation
- **THEN** its Load more action submits that opaque continuation and appends
  the next page of owned connections

#### Scenario: A previous grant ID is received as a continuation
- **WHEN** a signed-in user submits a raw grant ID from a pre-upgrade
  connection page in `after`
- **THEN** the list returns the standard invalid-cursor response and a new
  request without `after` starts a fresh traversal of their connections

## MODIFIED Requirements

### Requirement: OpenAPI describes MCP connection management
The generated versioned OpenAPI document SHALL describe the session-authenticated MCP connection list and revoke operations, including their path and query parameters, success responses, and applicable sanitized error responses. The document SHALL describe the supported operations regardless of whether MCP is enabled in a particular deployment. The existing runtime feature gate, session authorization, ownership and origin protections SHALL remain in force on Node and Cloudflare.

#### Scenario: Generated inventory includes connection management
- **WHEN** a consumer inspects the generated versioned OpenAPI document
- **THEN** it describes `GET /api/v1/account/mcp-connections` with opaque `after`, the common `limit`, an optional `nextCursor` and invalid-pagination errors, and `POST /api/v1/account/mcp-connections/{connectionId}/revoke` with its path parameter and response contracts

#### Scenario: Disabled MCP remains inaccessible
- **WHEN** MCP is disabled and a session requests either connection operation
- **THEN** the installation refuses the request even though the generated inventory describes the supported operation

#### Scenario: Connection ownership and origin are enforced
- **WHEN** a user attempts to revoke another user's connection or submits a revoke request with an invalid origin
- **THEN** the operation preserves the existing sanitized not-found or authorization failure and does not revoke the connection
