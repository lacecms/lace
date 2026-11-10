## 1. Baseline and client split

- [x] 1.1 Capture the current client method names, shared API exports, query-key results and package declaration export lists after `pnpm build`; run the existing admin client tests as the behavior baseline.
- [x] 1.2 Extract shared transport, errors, parsing, redaction and uploader primitives without changing identity or injection behavior; run the existing client tests, including upload and failure cases.
- [x] 1.3 Move operations into `admin-client/{content,media,accounts,settings,builds}.ts`, compose the same frozen `AdminClient` behind the existing facade and query keys; run existing client tests and compare the captured methods and query keys.
- [x] 1.4 Remove the old oversized-source baseline entry and verify every resulting production module is below 1,000 lines and `pnpm lint` boundary checks accept the structure.

## 2. MCP OpenAPI inventory

- [x] 2.1 Add shared-schema OpenAPI descriptions to the existing feature-gated MCP connection list and revoke routes; verify their parameters, response and error descriptions and existing authorization behavior.
- [x] 2.2 Enable MCP and supply a typed, non-operational connection port to the OpenAPI generation app; regenerate the committed document and verify only the intended operations change, with enabled and disabled runtime routing tested.

## 3. Additional OpenAPI inventory

- [x] 3.1 Describe the existing user-list, account-capabilities and settings-status operations using shared contracts; verify OpenAPI output, existing permissions and sanitized failures.
- [x] 3.2 Describe the existing build-token list and revoke operations using shared contracts; regenerate OpenAPI and verify the five new operations and the two MCP operations while unrelated operations remain unchanged, with existing authorization tests passing.

## 4. OpenAPI drift guard

- [x] 4.1 Add a source-derived, fail-closed guard in `shared/api` that finds every client transport and upload call, resolves dynamic path segments and methods, and checks versioned operations against `apps/api/openapi/api-v1.json`; verify missing paths, wrong methods and unknown syntax fail with locations.
- [x] 4.2 Check every possible hand-built query name against resolved OpenAPI path and operation parameters, including conditional, repeated and object-derived keys; verify valid dynamic paths and query branches pass and a renamed query fails.
- [x] 4.3 Check the four existing Better Auth method/path pairs and their query names against a separate exact allowlist; verify an unlisted auth operation or query and an unknown namespace fail.
- [x] 4.4 Exercise the guard on the complete split client, including multipart upload, and run its focused positive and negative fixtures plus `pnpm openapi:check`.

## 5. Verification and documentation

- [x] 5.1 Run the full admin tests with existing behavioral assertions preserved, root `pnpm build`, and compare shared API exports and package declaration export lists to the captured baseline.
- [x] 5.2 Record RF6B's actual largest client module, removed baseline entry, guard coverage and verification results in the roadmap baseline and progress log; verify the stated counts against source.
- [x] 5.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate`, and `pnpm exec openspec validate rf06b-admin-api-client --type change --strict`; record outcomes and resolve failures.
