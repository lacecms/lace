## ADDED Requirements

### Requirement: Local Compose forwards the optional MCP flag
The documented `dev:node` Compose stack SHALL pass `LACE_MCP_ENABLED` from the selected environment into the API container. An absent or empty Compose value SHALL default to `false`; any non-empty value SHALL reach the existing strict runtime parser unchanged, so unsupported values SHALL fail safely rather than become enabled. Generated local environments and the example SHALL default to disabled MCP. The guide SHALL explain setting `true`, recreating the API container after changes, verifying canonical resource discovery, and distinguishing disabled `404` from the unauthenticated enabled MCP `401` challenge. It SHALL NOT require deleting data or recreating credentials. The local gateway SHALL send `/mcp`, its child paths, and MCP discovery namespaces to the API rather than a frontend, including when disabled; the API SHALL retain its exact route allowlist and disabled `404` behavior.

#### Scenario: Contributor enables MCP locally
- **WHEN** the selected `.env` contains `LACE_MCP_ENABLED=true` and the contributor recreates the API container through the documented workflow
- **THEN** canonical resource discovery returns `200`, unauthenticated `/mcp` returns an OAuth `401` challenge, and registration reaches the OAuth handler instead of the disabled `404`

#### Scenario: Default or explicitly disabled local stack
- **WHEN** the flag is absent, empty at Compose interpolation, or `false`
- **THEN** the API receives `false`, MCP-only routes remain `404`, and ordinary Admin and REST remain usable

#### Scenario: Unsupported non-empty flag
- **WHEN** `.env` supplies `LACE_MCP_ENABLED=TRUE` or `1`
- **THEN** the runtime rejects the configuration with the existing sanitized diagnostic rather than coercing it to a boolean

#### Scenario: Environment changes on an existing stack
- **WHEN** a contributor follows the guide to change the flag on an existing stack
- **THEN** container recreation applies it while retaining the existing database, content, users, and object-store data


#### Scenario: MCP paths pass through the development gateway
- **WHEN** a client requests `/mcp`, an MCP child path, or either root MCP discovery namespace through the documented development origin
- **THEN** the API handles the request with its normal authentication/allowlist/enablement rules, and no request or WebSocket upgrade reaches Astro or Vite
