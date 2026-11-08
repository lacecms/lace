# REST API

Part of the [Lace architecture](README.md).

## 12. REST API

REST product endpoints are versioned under `/api/v1` ([ADR 0022](../adr/0022-hono-rest-valibot-schemas.md)); Better Auth
keeps its conventional `/api/auth` base path. Endpoint inventory,
parameters and response schemas live in the generated OpenAPI document
`apps/api/openapi/api-v1.json`; detailed behavior lives in
[rest-contracts](../../openspec/specs/rest-contracts/spec.md) and
[hono-app-factory](../../openspec/specs/hono-app-factory/spec.md). This
section keeps resource ownership, authorization boundaries, contract rules and
the limits that shape design.

### Authorization boundaries

| Path | Caller | Rule |
| --- | --- | --- |
| `/api/auth/*` | browser | Better Auth sign-in and session. |
| `/api/v1/public/*` | anonymous | Published snapshots only; cacheable. |
| `/api/v1/public/build-export` | build token | Accepted only by build-oriented endpoints. |
| `/api/v1/admin/*` | session actor | Permissions are checked by the use cases. |
| `/api/v1/admin/*` | import token | Only a fixed route allowlist accepts it. |
| `/api/v1/account/*` | session actor | Each actor manages their own account. |
| `/api/v1/invitations/*`, `/api/v1/password-reset/*` | token in body | Completed without a session. |
| `/mcp` (optional) | authenticated actor | Closed tool set, per-call authorization. |

Build tokens are random opaque credentials stored only as hashes, carry only
`content:build:read`, and cannot be exchanged for a browser session. Import
tokens reach only the allowlist in
[hono-app-factory](../../openspec/specs/hono-app-factory/spec.md)
([ADR 0016](../adr/0016-import-credentials.md)).

### Public endpoints

Public routes cover pages, globals, collection lists and items, lookup by
path, media and the build export. They return published snapshots only, never
a draft, revision, editor name or other editorial key; the shapes are in
[rest-contracts](../../openspec/specs/rest-contracts/spec.md) ("Public content
responses return published entries").

- `blocks` hold visible blocks only and never carry `hidden`. Media referenced
  only by hidden blocks are absent from `media` dictionaries and not served by
  the public media route, yet keep their reference rows and stay protected by
  the deletion guard.
- The globals read is anonymous, reads by model key without
  `published_routes`, and answers `404` for an unknown key, a page or
  collection key, or an unpublished global.
- Entries of SEO-enabled models carry `seo` even when nothing is set; other
  entries and globals never carry it.
- `media` resolves exactly the media referenced by the returned published
  snapshots (from `content_media_references`). Field and block values keep
  storing media IDs, and dictionaries never carry storage keys, filenames,
  uploaders or lifecycle status.
- Media metadata edits (§9.7) and changes to the export SEO section (a
  [configuration projection](content-configuration.md#configuration-projection)
  change applied by sync) advance the published-state version, so the
  build-export ETag changes with them.

### Build export

`build-export` returns all routed published entries, every published global,
the export SEO section and referenced media in one build-efficient sequence, so
Astro generation avoids an N+1 request pattern. It is paged so that no single
request builds, validates or serializes the whole site
([rest-contracts](../../openspec/specs/rest-contracts/spec.md), "The build
export is delivered in bounded keyset pages"):

- Entries are ordered by `published_routes.path` and paged by an opaque keyset
  cursor that binds the published-state version and the last delivered path.
- A page ends at `limit` entries (default and maximum 100) or before its stored
  JSON (fields, SEO, visible block data and settings; on the first page also
  the globals) would exceed a fixed 4,000,000-byte budget. An oversized entry
  is delivered alone.
- `globals` and `seo` appear on the first page only; each page's `media`
  covers only that page.
- Every page is read from one published state. A stale cursor version, or a
  publication during a page read, fails with
  `409 BUILD_EXPORT_VERSION_CHANGED`; clients restart from the first page.
- The sum of the pages of one sequence is what other sections call "the
  export".
- The ETag derives from `published_state.version`. `If-None-Match` applies to
  the first page only and answers `304` without loading content.
- The export carries a required `formatVersion`; the strict schema accepts
  only the current version and the SDK rejects a newer one with an upgrade
  message.

### Public media delivery

Content DTOs expose a stable absolute media URL: the configured
`LACE_PUBLIC_BASE_URL` plus `/api/v1/public/media/:mediaId`, never a
short-lived signed URL. The base URL is validated at startup and never
inferred from `Host` or forwarded headers; an API composed without it serves
no public content routes. The endpoint may stream the object or redirect to a
short-lived R2/MinIO URL, so static HTML keeps a durable URL while storage
credentials and object keys stay private.

The public media route serves an object only when a currently published
snapshot references it; admin media endpoints provide draft previews. Knowing
an unreferenced media ID does not publish it.

Stored media bytes never change, so binary responses carry a strong ETag
derived from the media ID alone (`"m-<mediaId>"`), separate from the metadata
ETag used for `If-Match`. Authorization, eligibility and not-found are decided
before conditional evaluation, so unpublished or deleted media never receives
`304` ([hono-app-factory](../../openspec/specs/hono-app-factory/spec.md),
"Media binary responses carry cache validators"). The public route caches for
one day, so a browser may keep media up to a day after it stops being
published; unbounded or `immutable` caching is deliberately not used.

### Admin endpoints

Admin resources are content models, entries and their lifecycle commands,
media and media tags, site builds, the session summary, users, invitations,
settings status, build tokens, import tokens and the import-credential
description.

- The draft `PUT` takes `expectedRevision` plus the complete editable draft
  (title, slug, fields, ordered blocks and, for SEO-enabled models, `seo`),
  validates and persists it atomically, and returns the incremented revision.
  The admin edits blocks locally but saves through this aggregate endpoint.
  Granular block endpoints may be added only if they preserve the same
  snapshot-revision invariant.
- Collection list queries (system and configured field sorts, typed filters,
  search) are defined in
  [collection-query-options](../../openspec/specs/collection-query-options/spec.md).
  They read current drafts; their search limits are runtime metadata
  (`listQueryLimits`, differing between Node and Cloudflare), not model
  configuration or content-hash input. Invalid input fails before SQL with
  value-free `422` issues and is never truncated. Public, export and SDK
  ordering are unaffected.
- Media tags are read with `content:read` and changed with `media:write`; tag
  filters and the tag catalog are bounded reads
  ([media-use-cases](../../openspec/specs/media-use-cases/spec.md), "Media
  lists filter by tags and expose a tag catalog").
- Import lookups are list parameters: exact draft `slug` on collection entry
  lists and `sha256` on media lists, both applied before paging and bound into
  continuation cursors.

`lace import <dir>` is a client of these routes
([ADR 0017](../adr/0017-content-import-client.md),
[content-import-cli](../../openspec/specs/content-import-cli/spec.md)). It
checks local and server configuration match, plans from hash and slug lookups,
saves drafts with expected revisions and, with `--publish`, publishes in
link-dependency order with idempotency keys. Draft normalization is the shared
application function, so a rerun writes nothing. Import never deletes or
unpublishes.

### Account endpoints

Invitation and reset tokens travel only in JSON bodies, never in paths or
queries. An invalid token returns one `410` envelope without distinguishing
unknown, expired, consumed or revoked tokens. A reset request always returns
`202` with the same body and schedules delivery without awaiting it
([hono-app-factory](../../openspec/specs/hono-app-factory/spec.md), "Account
routes keep their actor, token and rate-limit boundaries").

### MCP adapter

The optional stateless Streamable HTTP `/mcp` adapter exposes a closed tool set
([mcp-content-server](../../openspec/specs/mcp-content-server/spec.md),
[ADR 0015](../adr/0015-mcp-publication-scope.md)). It reuses the admin content
contracts, complete-draft validation, runtime query budgets and explicit
revision guards without loopback HTTP. Draft writes never publish or queue
builds.

### Contract rules

- Requests and responses use shared Valibot runtime schemas, validated in Hono
  through `@hono/standard-validator` (Standard Schema). OpenAPI is generated
  from the same route contracts through `hono-openapi` and
  `@valibot/to-json-schema`, never maintained separately.
- Database rows are never exposed directly as API DTOs.
- Public read representations are defined once in a **strict** variant
  (rejects unknown keys; the API validates every public response with it and
  OpenAPI describes it) and a **tolerant** variant (strips unknown keys; the
  SDK parses with it so a newer API does not break an older site build).
  Consumer-owned JSON passes through unchanged. A delivered block carrying
  `hidden` is rejected by both, never stripped. Request and admin schemas are
  strict only.
- Composite values stay plain objects and arrays with media IDs in every
  contract; nested issues use exact JSON Pointers such as
  `/blocks/0/data/images/2/image`.
- Errors use one stable envelope `{ error: { code, message, details? } }`.
  Validation failures, including content validation on create, save and
  publish, return `422 VALIDATION_FAILED` with one issue per failure whose
  message never repeats the submitted value.
- Portable failures extend `LaceError` and carry a stable code; one
  classification table (`classifyError`) maps them for REST and MCP, and
  unknown or internal errors return generic `500 INTERNAL_ERROR`
  ([ADR 0019](../adr/0019-error-model.md)).
- Collection lists use opaque cursors bound to the query that produced them.
- Admin DTOs name editors and uploaders with `id` and `displayName`, so lists
  never render raw user IDs; public and export DTOs never carry them.
- Mutable operations use optimistic concurrency through a revision or
  `If-Match`; publish operations are idempotent.
- Dates in JSON are ISO 8601 UTC strings.
