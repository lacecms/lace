## Context

`server` currently selects limits in the app and again in `SensitiveRequestRateLimiter`. The import allowlist also feeds actor resolution, while the route definitions separately describe OpenAPI security. The build-export handler conditionally verifies credentials based on an optional capability. MCP has separate tool-to-operation, OAuth scope and delegated actor mappings in `mcp`, `server`, `application` and `auth`.

## Goals / Non-Goals

- Make the route declaration the source for transport policy and keep application authorization in its existing owners.
- Reuse one closed delegated content policy across HTTP, OAuth and MCP while keeping OAuth scope checks and per-call authorization independent.
- Keep version composition, optional route availability and asset fallback in `server`. EX4B owns any relocation of security use cases and EX4C owns end-to-end handler typing.

## Decisions

### Register versioned routes with their policies

Use typed method and path declarations in `server`, grouped with the route families. Each declaration supplies a credential mode, body mode, rate-limit operation and subject or an explicit absence of a limit. The six REST counterparts of MCP tools reference the shared content operation. Registration attaches the declaration to the same Hono match as its handler and uses it to fill OpenAPI security. Existing validators, handler arguments and response descriptors stay with their route modules.

Model `public`, `session`, `session-or-import`, `import-only` and `build` separately. The outer MCP/provider adapter keeps its own protocol credential behavior. Use the matched policy for import resolution and the current accepted `401` challenge, including the combined Session/Bearer challenge for the import-credential description. The description continues to reject a session actor with `403`. Keep the management namespace's default denial for an Authorization header or `access_token` query on routes outside the allowlist, including unmatched requests. Preserve method and literal path matching, the HEAD/GET import equivalence and the reserved media-tags path, including when the media capability is absent.

Keep the public `IMPORT_ROUTE_ALLOWLIST` tuple order and `isImportRoute` behavior as projections of the same declarations. Keep declaration data portable and independent of the Hono handlers so exported compatibility helpers can use it without a dependency cycle. The current duplicate path classifiers and a second router for product policy are rejected because they can select a policy different from the handler that runs.

### Keep the request boundary and version mount predictable

Mount version-relative product routes and `/openapi.json` in one v1 sub-application. OpenAPI generation uses the fully mounted route inventory so its paths retain `/api/v1`. Keep `/api/docs`, `/api/auth/*`, `/mcp`, OAuth discovery and health at their existing outer paths. Keep the provider-owned allowlists and outer namespace gates for disabled MCP and API/health fallbacks. An outer boundary may still recognize a namespace to apply a default to unmatched requests.

Capture EX6A trusted client identity and request ID in the outer context before body handling. Preserve feature/host/origin gates, existing bounded checks for framed and headerless bodies, and the streaming multipart upload limit. Resolve applicable import or MCP identity and any actor needed for an actor-scoped bucket before applying the selected rate limit. Preserve the existing refusal order, response envelopes, provider forwarding, and one sanitized completion record. Continue using the same ingress identity for provider sign-in and client-scoped buckets, including the `0.0.0.0` fallback.

Pass the selected policy to the shared request limiter so it can reuse the existing clock and subject rules, including the address-plus-client-ID token bucket. Keep the public limiter's legacy direct-call behavior via the same declarations and existing namespace defaults. Preserve the applicable defaults for unmatched requests and method variants, including the broad auth and setup handling. Keep durable HMAC buckets, window sizes, and actor limits that charge only after authentication. SDK protocol syntax remains SDK-owned.

### Require a verifier before registering build export

Guard registration of the export and its OpenAPI metadata together on a callable verifier. With that dependency, authenticate before query-dependent export work, version reads or `304` decisions. Supply a rejecting verifier in the checked-in OpenAPI generator and a deliberate valid-token stub for tests that exercise successful export. Test the omitted-route composition separately. The alternatives were failing startup and an always-registered endpoint that rejects every request. Keeping optional composition usable and live discovery accurate favors omitting the route.

### Share the delegated content operation policy

Define the closed tool-name-to-content-operation mapping in `application` next to `contentOperationPermissions`. Derive the delegated operation set and its scope from the existing operation permissions for those six operations. The mapping covers the existing contract tool names and grants only explicitly listed operations. `server` consults the mapping for the required scope after body limiting. `auth` derives the delegated permissions and operation ceiling from the effective grant/token scopes. `mcp` uses the same operation for discovery and individual calls, and REST references that operation at its corresponding route. Preserve the `content:read` requirement for protocol traffic and SDK handling of unknown or malformed calls. Keep scope failures at the OAuth boundary and role/operation refusals at the application boundary, including the direct publish call from a demoted actor.

Avoid making `server` or `auth` depend on the MCP transport adapter. The application already owns the permission mapping and both transports depend on it. Keep protocol descriptions, argument validation and result handling with the MCP adapter.

## Risks / Trade-offs

- **Routing and policy diverge on overlapping or unmatched routes.** Verify policy against the actual Hono route selection. Compare the exact import inventory, status precedence, HEAD and wrong-method behavior, and disabled-route fallback against the current contract tests.
- **Mounting hides or duplicates operations in OpenAPI.** Verify live documents with and without the verifier and run the checked-in generated document check. Exercise parent error handling and request logging through the mounted child.
- **Actor or IP state survives across requests or is lost during buffering.** Run the existing EX6A interleaving and body replacement coverage on both runtimes and keep MCP's concurrent-identity check.

## Migration Plan

Deploy through the existing shared Node and Worker compositions, which already provide build-token verification. A custom HTTP composition that needs build export must wire a verifier before it can serve that route. The change requires no persistence, credential, or client migration. Update architecture §§12 and 14 during apply and record parity and OpenAPI verification in the change before archiving.
