## ADDED Requirements

### Requirement: MCP package remains a portable transport adapter
The workspace SHALL provide `@lacecms/mcp` as a portable adapter depending only
on the application, contracts and domain Lace packages and its declared
protocol/schema dependencies. It SHALL NOT import server HTTP handlers, database
or auth-provider implementations, platform packages, browser UI, configuration
loaders or Node-only APIs. Platform composition packages SHALL be permitted to
import MCP and inject a runtime-neutral handler into the server. The application
SHALL remain independent of REST contracts, Hono, MCP SDK, Better Auth, Drizzle
and runtime adapters. Shared DTO validation/serialization SHALL remain in
contracts, while business behavior and use-case orchestration SHALL remain in
application/domain. The repository's boundary checker SHALL enforce these
edges, reject cycles and reject cross-package source imports. Release tooling
SHALL include the new package with its declared public entry point and pinned
catalog dependencies.

#### Scenario: Portable MCP import
- **WHEN** the MCP adapter imports shared application operations and contract projections through public package exports
- **THEN** dependency checks pass and both runtime bundles can consume it

#### Scenario: MCP bypasses the application boundary
- **WHEN** a boundary fixture imports a database, platform implementation, server handler or Node-only API from MCP
- **THEN** the dependency check rejects it

#### Scenario: Application imports a transport schema
- **WHEN** an application boundary fixture imports a REST contract or MCP SDK
- **THEN** the existing forbidden-edge check continues to reject it
