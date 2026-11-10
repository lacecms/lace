## Context

See the proposal. `createAdminClient` currently constructs a frozen object with shared `request`, `postJson`, parsing, redaction and upload helpers. Queries use both explicit `URLSearchParams` keys and `Object.entries(query)`; media upload uses an injected uploader. The OpenAPI file describes `/api/v1` but deliberately excludes Better Auth's `/api/auth` routes (architecture §12). The `shared/api` index is the admin unit boundary. During apply, the two feature-gated `/api/v1/account/mcp-connections` operations were found to be absent from the generated document: the generator constructs the app without MCP capabilities and those routes have no OpenAPI descriptions. The drift guard subsequently found five additional existing operations absent from the document: `GET /api/v1/admin/users`, `GET /api/v1/account/capabilities`, `GET /api/v1/admin/settings/status`, `GET /api/v1/admin/api-tokens` and `DELETE /api/v1/admin/api-tokens/{tokenId}`.

## Goals / Non-Goals

**Goals:** Keep the existing client surface and transport behavior while making every client operation discoverable by a drift guard. Detect added or changed routes and query names without maintaining a second unchecked list of versioned routes.

**Non-Goals:** Prove request/response schema equivalence with OpenAPI, change server route behavior or authorization, or test backend parity anew; existing runtime contract and client tests retain those responsibilities.

## Decisions

1. Compose domain operation factories in `admin-client/{content,media,accounts,settings,builds}.ts` through the existing `admin-client.ts` facade. Keep the interface and query keys at the facade or in dependency-safe shared modules, and shared transport/errors/upload primitives in lower-level modules; avoid cycles and retain all exports, injected fetcher/uploader selection, object freezing and `AdminClientError` identity. Place setup and auth with accounts. Keep tests at the unit boundary; move imports only where needed. The existing behavior tests remain intact. This avoids five copies of transport behavior; generating a client would change the implementation and exceed the session.

2. Build a source-derived guard using TypeScript AST or an equally exhaustive mechanical extraction of client operations, including `request`, `postJson`, and upload calls after the split. Resolve method defaults, literals, template interpolations and query builders, including `Object.entries` query shapes; normalize encoded dynamic segments to OpenAPI `{parameter}` segments and check the operation and each emitted query name against path-level and operation-level parameters (including references). Do not rely on a handwritten inventory that can omit newly added operations. Unsupported dynamic expressions or methods must fail with a source location rather than silently skip. Restrict query checking to names, not values or requiredness. Preserve path specificity where static and parameter paths overlap.

3. Handle `/api/auth/sign-in/email`, `/api/auth/sign-out`, `/api/auth/oauth2/authorize` and `/api/auth/oauth2/consent` with a precise, separately checked method/path/query allowlist because they are intentionally absent from the versioned OpenAPI. Any newly introduced auth path or query name fails until deliberately reviewed; the allowlist is not a substitute for testing the versioned paths. Other unrecognized namespaces fail. This is a necessary refinement of the roadmap's wording that every client literal exists in `api-v1.json`, which conflicts with architecture §12 and the actual document. Do not add fabricated Better Auth operations to the OpenAPI file.

4. Prove the guard detects missing path, wrong method, changed query name, unhandled syntax and unlisted auth operation with focused negative fixtures; prove dynamic segments, all optional query branches, repeated media tags, `Object.entries`, and multipart upload are covered. If extraction cannot establish every possible key, fail closed rather than claim coverage. Continue running `openapi:check` so the committed document is checked against generation.

5. Add route descriptions for the existing MCP connection list and revoke operations using their shared schemas, including `after` and `limit`, the connection ID, success and applicable sanitized error responses. Configure the documentation-generation app with MCP capability enabled and a non-operational typed stub for the connection port; generation must never call it. Generate `api-v1.json` from the app as before. Do not register the routes unconditionally: runtime apps without the feature or capability must still refuse them. Test the generated operations and names, existing ownership/origin checks, and both enabled and disabled configurations. Compare the regenerated document to ensure unrelated operations are unchanged. This fixes the missing versioned contract instead of weakening the drift guard or maintaining a handwritten OpenAPI exception.

6. Describe those five routes using their existing shared request and response schemas, including the token path parameter and applicable sanitized errors. Regenerate the document and assert the intended five operations are added alongside the two MCP operations, with unrelated operations unchanged. Exercise existing permission and failure tests to show documentation metadata does not change access or response semantics. Do not suppress the missing operations in the drift guard or change route behavior.

## Risks / Trade-offs

- [Static extraction may become brittle when client code changes] → fail with a location and extend supported syntax with a regression fixture; never skip unknown forms.
- [Queries assembled from typed objects may hide keys] → resolve their declared shapes, or use a code structure that exposes all possible names while preserving serialization and the public types; assert representative and negative cases.
- [Moving security-sensitive code can alter failures] → retain same-origin credentials, error envelopes and request IDs, setup and secret-bearing request redaction, 204/invalid JSON behavior and upload progress through existing tests.
- [Documentation generation enables a capability unavailable in a deployment] → the generated inventory describes supported operations, not deployment enablement; runtime registration and capability checks stay unchanged and are tested.
- [Auth allowlist can drift from its provider] → retain existing behavioral tests; the allowlist only guards client changes and does not claim provider contract verification.

## Migration Plan

No deployment, data or configuration migration. Ship the client and tests together; revert the change as a unit if needed. The browser and both server runtimes keep the same wire contract.
