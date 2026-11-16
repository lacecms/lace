## Why

[EX4A in the extensibility roadmap](../../../../docs/extensibility-roadmap.md#session-ex4a--route-metadata) gives registered routes one source for HTTP policies that are currently repeated across routing, middleware and OpenAPI. Build export also needs to fail closed at composition time when the runtime supplies no build-token verifier.

## What Changes

- Declare credential mode, body handling and rate-limit policy with each route. Use those declarations for body limits, import-token eligibility, authentication challenges, rate-limit selection and OpenAPI security. Preserve the fixed import allowlist, streaming media uploads and trusted request identity from EX6A.
- Mount v1 in its own Hono sub-application under `/api/v1`. Keep the existing provider, MCP, health and documentation boundaries, including the API error and admin-asset fallbacks.
- Associate each MCP-reachable REST content operation with the same delegated scope used by MCP token checks, tool authorization and delegated actor construction. Preserve the six existing tools and their authorization behavior.
- Register `/api/v1/public/build-export` only when a callable build-token verifier is available. A composition without one keeps its other routes and returns the normal API not-found response for build export. A configured export keeps its existing Bearer challenge and published-data contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hono-app-factory` adds a registration prerequisite and a matching OpenAPI guarantee for build export.

## Impact

- Scope is EX4A. EX1A is complete and EX6A supplies ingress identity and its regression coverage. EX4B security use cases, EX4C typed handlers, EX4D HTTP consistency changes, additional API versions and backlog features are out of scope.
- Relevant invariants are [architecture §12](../../../../docs/architecture/api.md) and [§14](../../../../docs/architecture/security.md). Preserve the accepted [authentication and actor boundary](../../../specs/authentication-and-actor-boundary/spec.md), [abuse controls](../../../specs/bootstrap-user-token-abuse-controls/spec.md), [REST contracts](../../../specs/rest-contracts/spec.md), [MCP content server](../../../specs/mcp-content-server/spec.md) and [MCP OAuth delegation](../../../specs/mcp-oauth-delegation/spec.md).
- Affects `server` HTTP composition, the delegated content policy shared by `application`, `auth` and `mcp`, and the OpenAPI generator and verification fixtures. Node and Cloudflare continue to use the shared composition and existing persistence and credential services.
