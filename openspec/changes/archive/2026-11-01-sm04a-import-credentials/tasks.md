## 1. Architecture and planning documents

- [x] 1.1 Add ADR `docs/adr/0016-import-credentials.md` (decision, owner choices, rejected OAuth loopback and separate table, risks) and update `docs/mvp-architecture.md` §14 (import tokens, `api_tokens` columns, the narrowed "browser REST actors require sessions" invariant, invalidation), §9.7 (`sha256` column and filter) and §12 (import-token routes, `import-credential`, `slug` and `sha256` parameters); verify with `git diff` that no other invariant changes
- [x] 1.2 Mark SM4 / SM4A `in progress` in `docs/site-migration-roadmap.md` with the settled open question; verify the overview table and progress log agree

## 2. Schema and migration

- [x] 2.1 Add `expiresAt`, `createdBy` to `apiTokens` and `sha256` (with the hex check) plus `media_sha256_idx` to `packages/db/src/schema.ts`; generate migration `0015_import_credentials`; verify it applies on in-memory SQLite, file-backed SQLite and local D1 with existing build tokens still verifying, and update hard-coded migration counts in `packages/platform-node`, CLI and the 0007 migrate test
- [x] 2.2 Add `importTokenUserInvalidationSql()` to `packages/db` beside `oauthUserInvalidationSql`; verify a db unit test that it revokes only the user's import tokens and never build tokens

## 3. Security service and persistence

- [x] 3.1 Extend `SecurityService` in `packages/application` with `createImportToken` (actor-aware publish rule), `listImportTokens`, `revokeImportToken` and `resolveImportToken`, and restrict build-token list, revoke and verify to the build capability; verify application unit tests for the publish rule and lifetime bounds
- [x] 3.2 Implement the methods in `packages/platform-node/src/security.ts` (constant-time compare, expiry, throttled `last_used_at`, invalidation in disable, reset confirm, sign-out-everywhere and password-change transactions); verify platform-node tests
- [x] 3.3 Implement the same in `packages/platform-cloudflare/src/d1-security.ts` inside the existing guarded batches; verify platform-cloudflare tests
- [x] 3.4 Add import-credential cases to `packages/test-utils/src/security-contract.ts` (issuance, expiry boundary, revocation idempotence, kind separation both ways, throttled use, each invalidation event, re-enable does not restore); verify they pass on Node and local D1

## 4. Media hash and slug lookup

- [x] 4.1 Compute the SHA-256 in `MediaUseCases.create` and pass it to `createMedia`; add `sha256` to media views and the list query; verify application tests with fake ports (hash of known bytes, failed upload stores nothing, updates keep the hash)
- [x] 4.2 Add the slug predicate to the entry-list use case and `packages/db/src/collection-list.ts` (page, totals, cursor binding; refused for page and global models); verify application and db unit tests
- [x] 4.3 Store and filter `sha256` in shared SQL and both media repositories (active-only match, cursor binding); verify platform-node and platform-cloudflare tests
- [x] 4.4 Add the lookup cases to `packages/test-utils/src/repository-contract.ts` per the `content-repository-contracts` delta and a 500-item hash lookup to the D1 budget suite; verify on file-backed SQLite, in-memory SQLite and local D1 (`vitest.d1-budgets.config.mjs`)

## 5. Import actor and HTTP

- [x] 5.1 Add `createImportActorResolver` to `packages/auth` (header parsing, current creator role, disabled refusal, attenuation table from design D2); verify auth unit tests including demoted and disabled creators and query-string credentials
- [x] 5.2 Add contracts in `packages/contracts`: import-token create/DTO/created/list schemas, import-credential description, `slug` in `contentEntryListQuerySchema`, `sha256` in `mediaListQuerySchema` and optional `sha256` in the admin media DTO; verify contracts tests for pointers `/expiresInDays`, `/slug`, `/sha256` and secret-free list DTOs
- [x] 5.3 Add the Bearer middleware and frozen allowlist to `packages/server/src/app.ts` (no session fallback, explicit-Origin refusal, denial for every other admin and account route), the import-token routes with the token-management limit, and `GET /api/v1/admin/import-credential`; wire the resolver in Node and Worker composition; verify server tests for each allowlisted route, each closed route class, cookie-plus-Bearer, foreign Origin, publish without the capability, upload limit subject, build export refusing import tokens and MCP refusing them, and an allowlist-equals-spec test
- [x] 5.4 Pass `slug` and `sha256` through the list routes and regenerate OpenAPI; verify `pnpm openapi:check` and server tests for 422 pointers and cursor refusal with a different value
- [x] 5.5 Verify Node and Worker parity for import authentication, hash and slug lookups in the cross-runtime product suite (`vitest.cross-runtime.config.mjs`)

## 6. Admin Settings

- [x] 6.1 Add the admin API client methods and types for import tokens and the optional media `sha256`; verify admin typecheck and client unit tests
- [x] 6.2 Build `ImportTokenTable`, `create-import-token` and `revoke-import-token` per the `admin-users-and-settings` delta (expiry choice, publish checkbox gated by `content:publish`, Active/Expired/Revoked, transient plaintext); verify component unit tests and an e2e test for create, copy, revoke and expired rows with axe at 320 px and keyboard-only use

## 7. Template and documentation

- [x] 7.1 Bump `TEMPLATE_VERSION` to 0.43.0 with an `.lace/upgrade-instructions.json` entry for migration `0015` (backup, Node and Cloudflare steps, rollback) and refresh generated-project snapshots; verify create-lace tests and `pnpm acceptance:starter`
- [x] 7.2 Document import tokens in `docs/auth-operations.md` (creation, expiry, publish, revocation, what is closed, leaked-token response) and the new list parameters in the API reference; verify `pnpm docs:check` or the docs build

## 8. Verification and completion

- [x] 8.1 Run root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and every step in `.github/workflows/ci.yml` (including `acceptance:existing-site` and `spec:validate`); record results in `verification.md`
- [x] 8.2 Run `pnpm exec openspec validate sm04a-import-credentials --type change --strict` and update the roadmap progress log; verify validation passes
