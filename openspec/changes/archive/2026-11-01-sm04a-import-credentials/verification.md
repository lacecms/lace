# SM4A verification

Date: 2026-11-01. Change: `sm04a-import-credentials`.

## Implemented behavior

- ADR 0016 and architecture §9.7, §12 and §14: import tokens are the only
  non-session credential on admin REST, limited to a literal allowlist.
- Migration `0015_import_credentials` (ALTER-only, no table rebuild):
  `api_tokens.expires_at`, `api_tokens.created_by`, checked `media.sha256`
  and `media_sha256_idx`. Build tokens keep working; legacy media keep `NULL`.
- Security service on Node and D1: import-token create, list, revoke and
  resolve with constant-time comparison, exclusive expiry, enabled-creator
  check and `last_used_at` throttled to once per minute. Every build-token
  query now filters by capability, so the kinds never authenticate each
  other's surfaces. Disable, reset confirmation, sign-out-everywhere,
  other-session sign-out and password change ending other sessions revoke the
  creator's import tokens in the same transaction or D1 batch.
- `createImportActorResolver` (auth): Bearer-only, current creator role,
  write/media ceiling plus optional publish, refuses query-string credentials
  and an explicit foreign `Origin` on unsafe methods. The trusted-origin list
  moved to a shared module used by both boundaries.
- Server: Bearer requests on admin/account routes never reach the session
  resolver; non-allowlisted routes return `403 AUTHORIZATION_DENIED`. New
  routes `GET|POST /api/v1/admin/import-tokens`,
  `DELETE /api/v1/admin/import-tokens/:tokenId` (session, `settings:manage`,
  token-management limit) and `GET /api/v1/admin/import-credential`.
- Uploads record the SHA-256 of the stored bytes; admin DTOs carry optional
  `sha256`; `?sha256=` returns active matches; `?slug=` filters collection
  entries by exact current draft slug. Both bind cursors only when present, so
  existing cursors stay valid. Public SQL keeps its column list.
- Admin Settings: Import tokens card, create dialog (1/3/7 days, publish
  checkbox only with `content:publish`), table with creator, expiry, access and
  Active/Expired/Revoked, revoke dialog. The shared `Table` gained an optional
  labelled focusable scroll region for the wide table at 320 px.
- Template 0.43.0 with `0015` upgrade and rollback notes; six generated-project
  snapshots refreshed; `docs/auth-operations.md` and `docs/media-tags.md`.

## Checks

| Check | Result |
| --- | --- |
| Security contract: import credentials and account-event revocation | passed on file SQLite, in-memory SQLite and local D1 |
| Repository contract: hash and slug lookups | passed on file SQLite, in-memory SQLite and local D1 |
| D1 budget: 500-item hash lookup uses `media_sha256_idx` | passed |
| Cross-runtime product: import token, hash, slug, closed routes, foreign Origin, build export, revocation | identical on Node and Worker |
| Server: allowlist equals spec, allowlisted and closed routes, no session fallback, publish capability, description route, token administration, 422 pointers and cursor binding | passed |
| Auth resolver, application, db, contracts unit tests | passed |
| Admin unit tests and `import-tokens.e2e.ts` (keyboard only, axe at 320 px); `accessibility.e2e.ts` | passed |
| Root `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` | passed |
| Root `pnpm test` | 44/44 package tasks passed; root `tests/release-artifacts.test.mjs` fails only on unpinned Node 24.22.1 and passes 7/7 on pinned Node 24.12.0 |
| `pnpm acceptance:starter`, `pnpm acceptance:existing-site` | passed |
| `pnpm docs:check`, docs `test:variants`, `pnpm openapi:check`, `pnpm spec:validate` | passed |

## Not covered

- MCP refusing an import token is covered by construction (the MCP resolver
  looks tokens up in the OAuth tables) and the existing unknown-token MCP
  tests; the cross-runtime fixture runs with MCP disabled.
- Docker VPS journey (`pnpm test:vps`) was not run.
