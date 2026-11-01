## Context

See proposal.md for motivation and owner decisions. Current state that shapes
the approach:

- `api_tokens` (§14) has `capabilities_json` but no expiry or creator. The
  build-export route calls `SecurityService.verifyBuildToken`, which on Node
  scans every unrevoked row with a constant-time compare and never checks the
  capability. Adding a second token kind to the same table without a
  capability check would let an import token read build exports.
- Admin REST actors come only from `SessionActorResolver` in
  `packages/auth/src/index.ts`, which refuses unsafe requests with a foreign
  `Origin` or cross-site Fetch Metadata before reading the session.
- Delegation already exists: `attenuateActor` intersects a permission and
  operation ceiling with the role, `hasPermission` honours it, and
  `canContentOperation` allows only `delegatedContentOperations`
  (`discoverModels`, `list`, `load`, `create`, `save`, `publish`). MCP uses this
  ceiling. Admin entry reads (`projectAdminEntry`) authorize `load`, so
  allowlisted admin routes work under the same ceiling.
- Media use cases check permissions only (`media:write`, `content:read`), not
  operations, so the HTTP allowlist is what keeps media deletion closed.
- Account-security events already run `oauthUserInvalidationSql` inside their
  Node transaction or D1 batch.
- `MediaUseCases.create` holds the full verified byte array in memory before
  storing it.

## Goals / Non-Goals

**Goals:** one revocable, short-lived, write-capable credential that the CLI
can use headlessly; no widening of browser-session trust; exact server lookups
so SM4B can be idempotent without scanning lists.

**Non-Goals:** CLI behavior and package format (SM4B); changing the role
matrix; per-token rate limits; storing hashes for old media.

## Decisions

### D1. Same table, new kind, separate routes

Import tokens are rows in `api_tokens` with `capabilities_json`
`["content:import"]` or `["content:import","content:publish"]`, plus the new
`expires_at` and `created_by` columns. Build tokens keep
`["content:build:read"]` and `NULL` in both new columns.

Every security-service query filters by kind: build-token list, revoke and
verify match `capabilities_json = '["content:build:read"]'`; import-token
methods match `capabilities_json like '["content:import"%'`. New
`SecurityService` methods: `createImportToken`, `listImportTokens`,
`revokeImportToken` and `resolveImportToken({token, now})`, which returns
`{token metadata, creatorId}` or `null`. `/api/v1/admin/api-tokens` and its
DTO stay unchanged.

*Alternatives:* a separate `import_tokens` table (cleaner, but duplicates
lifecycle code and the security contract suite for one column difference);
extending the build-token DTO with a union (breaks strict clients and the
Settings card that counts "active build tokens").

### D2. Import actor resolution in the auth package, before session lookup

A new `createImportActorResolver` in `packages/auth` (bearer-only, like
`createMcpActorResolver`) parses `Authorization: Bearer <base64url>` (at most
4096 characters, no query-string credential), calls
`SecurityService.resolveImportToken`, reads the creator with
`readUserProfile`, fails closed when the creator is missing or disabled, and
returns `attenuateActor({id, role: current role}, ceiling)` with:

| Capability | Permissions | Operations |
| --- | --- | --- |
| `content:import` | `content:read`, `content:write`, `media:write` | `discoverModels`, `list`, `load`, `create`, `save` |
| `+ content:publish` | `+ content:publish` | `+ publish` |

The server middleware decides the credential before any handler runs: if the
path is below `/api/v1/admin/` or `/api/v1/account/` and the request has an
`Authorization` header, it is an import request. Non-allowlisted routes return
the standard denial; allowlisted routes resolve the import actor and store it
in `lace.actor`, so the existing `actor(context)` helper returns it and the
session resolver is never consulted. The import resolver refuses an explicit
untrusted `Origin` on an unsafe method using the trusted-origin list it shares
with the session boundary (`trusted-origins.ts`); Fetch Metadata is not
consulted. The allowlist is a frozen literal
array of `[method, pattern]` where each pattern is the route template with
each `:param` compiled to one non-empty segment without `/`. Middleware runs
before routing, so it matches the raw path, not Hono's route path. The array
is exported for a test that compares it with the spec list.

*Why not let use cases enforce everything:* media deletion and administration
check permissions only; an explicit HTTP allowlist is simpler to audit and
mirrors the MCP and provider-route allowlists.

*Alternative rejected:* OAuth loopback (owner decision 1).

### D3. Lifecycle and invalidation

- Expiry: `expires_at = created_at + expiresInDays × 86 400 000`; resolution
  refuses `now >= expires_at`.
- Publish: the application helper `importTokenCapabilities(actor,
  allowPublish)` requires `settings:manage` and adds `content:publish` only
  when `hasPermission(actor, "content:publish")`; otherwise an
  `allowPublish: true` request fails with the shared authorization denial.
  `importTokenExpiry` turns the validated day count into the absolute expiry.
  The persistence port `createImportToken` only stores what it is given.
- `last_used_at`: updated with `where id = ? and (last_used_at is null or
  last_used_at <= now - 60000)`, one statement, no read-modify-write race.
- Invalidation: new shared `importTokenUserInvalidationSql()` in
  `packages/db` (`update api_tokens set revoked_at = coalesce(revoked_at, ?)
  where created_by = ? and capabilities_json like '["content:import"%'`) is
  added beside every `oauthUserInvalidationSql` call on Node and into the same
  D1 batches. Role changes do not revoke; resolution re-reads the role.
- Token-management rate limit (`token`, 20/hour/admin) covers both kinds;
  sensitive-limit mapping gains the import-token routes.

### D4. Content hash in the media use case

`MediaUseCases.create` computes `crypto.subtle.digest("SHA-256", bytes)` after
`detectMediaMimeType`/dimension checks and before `storage.put`, encodes it as
lowercase hex and passes `sha256` to `createMedia`. WebCrypto is available on
Node 24 and Workers, so no port is needed; the package's portable lib types
omit it, so the use case reads it through a narrowly typed `globalThis` view,
as the dispatcher does for timers. Public media SQL keeps its column list;
only admin catalog and by-ID reads select `sha256`. The digest covers the stored bytes, which are exactly the
uploaded bytes (no transcoding).

`MediaListQuery` gains optional `sha256`; shared SQL adds
`m.sha256 = ? and m.status = 'active'` and binds it into the cursor kind like
tags. Index `media_sha256_idx` makes the lookup bounded; equality on a
non-unique index needs no D1 budget change.

### D5. Slug filter in the collection list

`ContentListQuery` gains optional `slug`. The application validates it with the
existing slug rule and refuses it for page/global models (`/slug`). Shared SQL
in `packages/db/src/collection-list.ts` adds an equality predicate on the
current draft snapshot's slug to both the page and totals queries, and the
canonical query bound to the cursor includes it. No index is added: the
predicate is evaluated inside the existing model-scoped scan, which is already
bounded by `content_entries_model_idx`.

### D6. Description route

`GET /api/v1/admin/import-credential` returns the token DTO (from the resolved
token metadata) and `permissions` from the application helper
`effectiveActorPermissions`, which filters `permissionsFor(role)` through
`hasPermission(actor, …)`, so attenuation is reflected. SM4B calls it
first to fail early when `--publish` is requested without the capability.

### D7. Admin Settings

New feature folders mirror the build-token ones: `create-import-token`,
`revoke-import-token`, and `pages/settings/ImportTokenTable`. The plaintext
lives only in the dialog's transient state. The nine-column table scrolls at
320 px, so the shared `Table` gains an optional `scrollRegionLabel` that makes
its scroll container a labelled, focusable region (axe
`scrollable-region-focusable`); other tables are unchanged. "Expired" is derived from
`expiresAt` and the current time. The card is hidden without
`settings:manage`; the publish checkbox renders only with
`can(session, "content:publish")`.

## Package boundaries

`domain` unchanged → `application` (ports, `MediaUseCases`, list query,
security interface) → `db` (schema, migration, shared SQL, invalidation SQL)
→ `platform-node` / `platform-cloudflare` (security service, repositories) →
`auth` (import resolver, depends on application types only) → `contracts` →
`server` (middleware, routes) → `apps/admin`. No new dependency.

## Risks / Trade-offs

- [A leaked token writes as an administrator for up to 7 days] → required
  expiry, no destructive or administrative routes, revocation in Settings,
  invalidation on account-security events, prefix display for identification,
  and no MCP or build access.
- [Kind confusion in a shared table] → every query filters by capability;
  security contract cases present each kind to every verifier.
- [A future admin route accidentally accepts Bearer] → allowlist test compares
  the exported list with the spec; any Bearer request to a non-listed admin
  path is denied in middleware before handlers.
- [Old media duplicate once on import] → accepted by the owner; documented.
- [Upload limit 30/min slows large imports] → unchanged by design; SM4B
  honours `Retry-After`.

## Migration Plan

Migration `0015_import_credentials.sql` (generated with drizzle-kit, checked
on in-memory SQLite, file SQLite and local D1). Template 0.43.0 adds an
`.lace/upgrade-instructions.json` entry with backup, Node and Cloudflare apply
steps and rollback (restore the backup; the columns are additive and unused by
older code, so an older release also runs against the migrated schema).
Hard-coded migration counts in platform-node, CLI and D1 tests move to 15.
