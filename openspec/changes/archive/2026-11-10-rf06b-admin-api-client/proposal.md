## Why

Roadmap Step RF6, Session RF6B addresses the 1,043-line admin client and its unguarded route literals. A change to the generated API description can currently leave browser requests pointing at a missing operation or query parameter.

## What Changes

- Split the client operations by content, media, accounts, settings and builds, composed behind the existing `AdminClient`, factory, query keys and shared API exports. Preserve request and response behavior.
- Add a fail-closed client-to-OpenAPI drift test for versioned operations and manually constructed query names, including parameterized paths and uploads. Better Auth paths are outside `api-v1.json` by architecture §12 and receive an explicit, narrowly bounded separate check.
- Describe the existing session-authenticated MCP connection list and revoke routes in generated OpenAPI, including their parameters, response and error contracts. Generate the full versioned inventory with MCP enabled; preserve runtime feature gating and authorization.
- Describe the existing user list, account capabilities, settings status, build-token list and build-token revoke operations in generated OpenAPI using their existing schemas and authorization behavior.
- Remove the split file from the oversized-source baseline and record the measured result in the roadmap. Client and endpoint runtime behavior remain unchanged; the published OpenAPI document gains seven operations.
- Non-goals: changing endpoint behavior, permissions or feature defaults, editor state or renderer work (RF6C/RF6D), and a generated client.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-oauth-delegation`: specify that the generated versioned OpenAPI describes the existing MCP connection list and revoke operations.
- `rest-contracts`: specify that the five existing account and administration operations are documented in the versioned OpenAPI.

The accepted `admin-source-structure`, `admin-remote-state-and-lists`, and `admin-media-library` behavior remains intact.

## Impact

- `apps/admin/src/shared/api` client implementation and colocated tests; `packages/server` account, user, settings and credential route descriptions and tests; `apps/api` OpenAPI generator and generated document; `scripts/oversized-source-baseline.json`. No new dependency is required.
- Architecture §12 and §17 (API ownership, transport, admin layers) and §20 (testing) remain unchanged. Existing shared API exports, request semantics, error handling, secret redaction, uploads, and query-key values remain unchanged.
- RF3A and RF6A are completed dependencies; RF6C and RF6D remain separate sessions. Node and Cloudflare REST contracts remain unchanged.
