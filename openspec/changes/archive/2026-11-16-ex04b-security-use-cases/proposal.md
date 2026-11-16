## Why

[EX4B in the extensibility roadmap](../../../../docs/extensibility-roadmap.md#session-ex4b--security-use-cases) makes the application responsible for authorizing security operations. Today some routes call security ports directly after checking a permission, while others duplicate a check that the use case already makes. EX4A supplies the route policies for credential selection and rate limits.

## What Changes

- Route user, invitation, account, setup, settings, and build/import token operations through portable application use cases. Check session authority, permissions, and ownership before protected work. Keep anonymous setup and recovery operations subject to their existing credential lifecycles.
- Remove the 12 calls to the route-level user and settings permission helpers, plus the build-site read's inline permission check. Keep the current access for administrators, editors and viewers, as well as the existing guarded writes and build queue behavior.
- Keep authentication, request validation, origin checks, route policy, and response mapping in the HTTP boundary. REST and MCP continue sharing the application content operations for the six existing tools. Account and security administration require a browser session where applicable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `application-ports-and-commands` defines application authorization and ownership for portable security operations and site-build administration.
- `hono-app-factory` requires REST handlers to delegate those operations to the shared use cases and preserves credential boundaries and HTTP outcomes.

## Impact

- Depends on the completed [EX4A route metadata change](../2026-11-16-ex04a-route-metadata/). EX4C handler typing and EX4D pagination and HTTP consistency are separate sessions.
- Affects `application` and the shared `server` composition used by Node/SQLite and Worker/D1. Apply updates [architecture §14](../../../../docs/architecture/security.md) and its composition description in [§15](../../../../docs/architecture/runtimes.md), in line with the route boundary in [§12](../../../../docs/architecture/api.md).
- The existing [REST contracts](../../../specs/rest-contracts/spec.md), [authentication and actor boundary](../../../specs/authentication-and-actor-boundary/spec.md), and [setup, user and token lifecycles](../../../specs/bootstrap-user-token-abuse-controls/spec.md) continue to govern client-visible behavior. The [MCP tool set](../../../specs/mcp-content-server/spec.md) and [OAuth delegation boundary](../../../specs/mcp-oauth-delegation/spec.md) retain their current scope. The existing database schema and guarded persistence commands support the change.
