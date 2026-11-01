## Why

`lace import` (SM4B) must write drafts and media into a running installation
from a terminal or CI job, and must be safe to rerun. Today nothing allows
that: admin REST writes need a browser session cookie and a trusted Origin,
API tokens carry only `content:build:read`, MCP tokens never authenticate admin
REST, media have no content hash for deduplication, and an entry cannot be
found by its slug exactly. This session adds the server side the CLI needs.

## Roadmap unit

Session **SM4A** of step SM4 in
[`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md).
SM4B (CLI import) and SM4C (runtime verification and documentation) are
separate sessions. Depends on SM3A (media tags in upload and update); SM2 is
not required.

Owner decisions (2026-10-31), settling the roadmap's open question:

1. The credential is an API token with a new `content:import` capability, not
   an OAuth loopback flow.
2. Publishing is optional per token: chosen at creation and refused unless the
   creator currently holds `content:publish`.
3. Media uploaded before this change keep a `NULL` hash and are not
   deduplicated; no backfill.
4. Lookups are parameters on the existing list endpoints, not new routes.

## What Changes

- **Import tokens.** An administrator (`settings:manage`) creates a named
  import token in Settings with a required expiry of 1 to 7 days and an
  optional publish permission. The plaintext is shown once. Tokens are listed
  with their creator, expiry and last use, and can be revoked. They share the
  `api_tokens` table with build tokens but have their own routes
  (`/api/v1/admin/import-tokens`), so the build-token contract and screen are
  unchanged.
- **Import actor.** `Authorization: Bearer <import token>` authenticates only a
  fixed allowlist of admin REST routes: content models, entry list, create,
  read, draft save, publish, media list, upload, read and metadata update, and
  a new `GET /api/v1/admin/import-credential` that describes the token. The
  request acts as the creating administrator with the current role,
  attenuated to `content:read`, `content:write`, `media:write` and optionally
  `content:publish`; unpublish, revert, duplicate, delete, media deletion and
  every user, token and settings route stay closed. A Bearer request never
  falls back to the session cookie, so the Fetch-Metadata cross-site rule
  does not apply to it; an explicit untrusted `Origin` is still refused.
- **Lifecycle.** Expired or revoked tokens fail. Disabling the creator, a
  password reset, an administrator sign-out-everywhere and a password change
  that ends other sessions revoke the creator's import tokens, matching MCP
  grant invalidation. Build tokens still authenticate only build export (its
  verification now checks the capability, since both kinds share a table), and
  import tokens never authenticate build export or MCP.
- **Media hash.** Every new upload records the SHA-256 of its stored bytes
  (lowercase hex). Admin media DTOs carry optional `sha256`;
  `GET /api/v1/admin/media?sha256=<hex>` returns matching `active` items.
  Public DTOs and the build export stay unchanged.
- **Exact slug lookup.** `GET /api/v1/admin/models/:modelKey/entries?slug=<slug>`
  returns collection entries whose current draft slug equals the value. Page and
  global models already return at most one entry from the same list.
- **Migration `0015`** on Node SQLite and D1: `api_tokens.expires_at`,
  `api_tokens.created_by`, `media.sha256` and an index on it. Template 0.43.0
  ships the upgrade step.
- **Architecture.** §14 now allows one more credential on admin REST, so the
  change adds ADR 0016 and updates §9.7, §12 and §14 before code.

## Scope, Dependencies and Non-goals

Server, persistence, contracts and the admin Settings screen. Non-goals: the
`lace import` command and package format (SM4B), runtime acceptance journeys
and the import guide (SM4C), OAuth loopback, editor-created import tokens,
hash backfill for existing media, a uniqueness constraint on hashes, import
tokens on MCP or the public API, new rate limits.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bootstrap-user-token-abuse-controls`: import-token issuance, expiry,
  optional publish, listing, revocation and account-security invalidation;
  build export accepts only build-capability tokens.
- `authentication-and-actor-boundary`: Bearer import tokens resolve an
  attenuated actor for the creator, never fall back to a cookie, and fail
  closed for disabled, expired and revoked cases.
- `hono-app-factory`: the import-token route allowlist, import-token
  administration routes and the import-credential description route.
- `rest-contracts`: import-token DTOs, the import-credential DTO, the `slug`
  entry-list parameter, the `sha256` media-list parameter and the optional
  media `sha256` field.
- `media-use-cases`: uploads record a content hash; media lists filter by
  hash.
- `content-use-cases`: entry lists filter by exact current draft slug.
- `content-repository-contracts`: Node and D1 parity fixtures for hash and
  slug lookups.
- `sqlite-schema-and-migrations`: migration `0015`.
- `admin-users-and-settings`: the Settings import-token card, creation dialog
  and revocation.

## Impact

- Packages: `domain` (no change to the role matrix), `application` (security
  service, media hash, slug filter), `db` (schema, migration `0015`, shared
  SQL, invalidation SQL), `auth` (import actor resolver), `platform-node` and
  `platform-cloudflare` (token persistence, repositories), `contracts`,
  `server`, `apps/admin` (Settings), `create-lace` (template 0.43.0,
  upgrade instructions), `test-utils` (security and repository contracts).
- REST/OpenAPI: new routes `GET|POST /api/v1/admin/import-tokens`,
  `DELETE /api/v1/admin/import-tokens/:tokenId`,
  `GET /api/v1/admin/import-credential`; new query parameters `slug` and
  `sha256`; additive optional media DTO field.
- Docs: `docs/mvp-architecture.md` §9.7, §12, §14; ADR 0016;
  `docs/auth-operations.md`; roadmap progress log.
- Operations: additive migration; existing build tokens keep working at build
  export.
