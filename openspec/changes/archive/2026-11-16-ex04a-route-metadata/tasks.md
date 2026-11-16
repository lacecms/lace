## 1. Build export registration

- [x] 1.1 Make build export registration conditional on a callable verifier. Supply an explicit rejecting verifier in the OpenAPI generator and a verifier and credential in success fixtures. Verify API `404` for GET and HEAD and OpenAPI omission when absent, with ordinary public reads still working. Verify the Bearer `401` before any version or page read for missing and rejected tokens, including conditional and continuation requests. Keep the authenticated first-page, continuation and `304` tests green.

## 2. Delegated content policy

- [x] 2.1 Define the six tool-to-operation bindings in `application` and derive their delegated scopes and operation ceiling from the existing permission map. Use it in the server scope check, OAuth actor attenuation and MCP tool registration and calls. Test the exact tool/scope inventory, default-deny for other operations, OAuth insufficient scope, current-role denial including demoted publication, malformed or unknown calls, and concurrent actor isolation. Run the focused application, auth, server and MCP tests and `pnpm compat:mcp`.

## 3. Route metadata and v1 composition

- [x] 3.1 Introduce typed route policy declarations. Register v1 product routes and live OpenAPI in one child application mounted at `/api/v1`, reference the shared operations on the six MCP-reachable routes, and leave protocol, health and docs at their existing outer paths. Generate credential security annotations from the policy. Verify the mounted method/path inventory, OpenAPI operation paths and security schemes, optional surfaces, and API/health and SPA fallback behavior.
- [x] 3.2 Use the matched policy for body handling, credential selection and REST challenges. Derive the exported import allowlist and helper from the same declarations. Verify the exact eleven method/path pairs, reserved paths and HEAD, default denial and absence of cookie fallback for unsupported management credentials, the import-only description, and the existing REST `401`/`403` matrix. Exercise framed, headerless and streaming multipart bodies and REST versus OAuth error envelopes.
- [x] 3.3 Select each rate-limit operation and subject from route policy and explicit namespace defaults. Preserve the limiter's direct-call contract, actor resolution order, existing windows, `Retry-After`, and EX6A trusted identity through streamed body replacement and provider sign-in. Run the focused rate-limiter, client-address and protocol tests, including OAuth client-ID buckets, unmatched route cases and authenticated import uploads.

## 4. Parity and change verification

- [x] 4.1 Run the relevant API and runtime tests with both Node/SQLite and Worker/local D1. Verify the build route with production-style composition, the credential/challenge matrix, and the EX6A regressions for separate trusted clients, forwarded headers and missing ingress identity. Build the API and run `pnpm openapi:check` to verify the checked-in document remains stable for the full composition.
- [x] 4.2 Document route policy, version mounting and the build-verifier prerequisite in architecture §§12 and 14. Verify the links and confirm the documented behavior agrees with the delta. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate` and `pnpm exec openspec validate ex04a-route-metadata --type change --strict`. Record the verified EX4A result in the roadmap progress log.
