## ADDED Requirements

### Requirement: Optional MCP composition preserves the shared request boundary
The portable HTTP application SHALL accept an optional runtime-neutral MCP
request handler and explicit MCP-enabled state from its composition root. It
SHALL route MCP and its narrowly declared OAuth/discovery/account-connection
endpoints before asset fallback, using the same request identification,
sanitized logging and body/rate-limit infrastructure as existing routes.
MCP/protocol responses SHALL retain their own media types, OAuth challenges and
error envelopes rather than being rewritten as REST errors. Disabled MCP-only
routes SHALL return `404`, including method variants, without entering a
provider handler or serving HTML assets. Existing browser actor resolution
SHALL NOT accept an MCP token, and the MCP handler SHALL NOT fall back to browser
cookies or build credentials. Equivalent Node and Cloudflare composition SHALL
produce equivalent behavior without either adapter importing runtime-specific
database or Worker objects into the HTTP package.

#### Scenario: MCP request reaches a Worker with admin assets
- **WHEN** a client sends an enabled authenticated `/mcp` request to a deployment with admin SPA fallback
- **THEN** the request reaches MCP and receives its protocol response, never the admin HTML document

#### Scenario: Disabled method variant
- **WHEN** MCP is disabled and a client requests its discovery, registration or token path with any method
- **THEN** it receives `404` before provider work or asset fallback

#### Scenario: Shared observability
- **WHEN** a permitted MCP call succeeds or fails
- **THEN** it receives a request ID and one sanitized completion record without raw arguments or OAuth query parameters

### Requirement: Admin content handlers use shared content orchestration
Admin model discovery, entry listing/loading, creation and complete-draft save
SHALL delegate their application orchestration to the same operations used by
MCP, retaining shared contract projections. HTTP handlers SHALL remain
responsible for paths, queries, headers, cookies, status codes and conditional
responses, without a second metadata/read/authorization implementation. The
refactor SHALL preserve all existing browser content contracts, authentication
and non-MCP lifecycle behavior.

#### Scenario: Browser regression coverage
- **WHEN** the admin creates, loads and saves an entry after MCP is installed but disabled
- **THEN** its existing REST response shape, state, attribution and conflict behavior remain unchanged
