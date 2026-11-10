## ADDED Requirements

### Requirement: OpenAPI describes MCP connection management
The generated versioned OpenAPI document SHALL describe the session-authenticated MCP connection list and revoke operations, including their path and query parameters, success responses, and applicable sanitized error responses. The document SHALL describe the supported operations regardless of whether MCP is enabled in a particular deployment. The existing runtime feature gate, session authorization, ownership and origin protections SHALL remain in force on Node and Cloudflare.

#### Scenario: Generated inventory includes connection management
- **WHEN** a consumer inspects the generated versioned OpenAPI document
- **THEN** it describes `GET /api/v1/account/mcp-connections`, including `after` and `limit`, and `POST /api/v1/account/mcp-connections/{connectionId}/revoke`, including the path parameter and response contracts

#### Scenario: Disabled MCP remains inaccessible
- **WHEN** MCP is disabled and a session requests either connection operation
- **THEN** the installation refuses the request even though the generated inventory describes the supported operation

#### Scenario: Connection ownership and origin are enforced
- **WHEN** a user attempts to revoke another user's connection or submits a revoke request with an invalid origin
- **THEN** the operation preserves the existing sanitized not-found or authorization failure and does not revoke the connection
