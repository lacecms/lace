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

Node and Cloudflare mount the same v1 sub-application once at `/api/v1`.
Route declarations bind the HTTP method and path to credential mode, body
handling and rate-limit policy. Authentication challenges and OpenAPI security
use the same credential mode. Live OpenAPI describes the routes mounted in the
current composition.

### Authorization boundaries

| Path | Caller | Rule |
| --- | --- | --- |
| `/api/auth/*` | browser | Better Auth sign-in and session. |
| `/api/v1/public/*` | anonymous | Published snapshots only; cacheable. |
| `/api/v1/public/build-export` | build token | A build-token verifier is required for registration. |
| `/api/v1/public/build-media/:mediaId/thumbnail` | build token | Published media eligibility and a build-token verifier are required. |
| `/api/v1/admin/*` | session actor | Permissions are checked by the use cases. |
| `/api/v1/admin/*` | import token | Only a fixed route allowlist accepts it. |
| `/api/v1/account/*` | session actor | Each actor manages their own account. |
| `/api/v1/invitations/*`, `/api/v1/password-reset/*` | token in body | Completed without a session. |
| `/mcp` (optional) | authenticated actor | Closed tool set, per-call authorization. |

Protected REST routes answer `401 AUTHENTICATION_REQUIRED` for missing or rejected credentials, with a no-store response and a challenge for the accepted credential types. Permission denials, unsupported credential kinds, and origin or CSRF refusals answer `403 AUTHORIZATION_DENIED`.

Build tokens are random opaque credentials stored only as hashes, carry only
`content:build:read`, and cannot be exchanged for a browser session. Import
tokens reach only the allowlist in
[hono-app-factory](../../openspec/specs/hono-app-factory/spec.md)
([ADR 0016](../adr/0016-import-credentials.md)).

### Public endpoints

Public routes cover pages, globals, collection lists and items, lookup by
path, media, the build export and build thumbnails. Content reads return
published snapshots only, never a draft, revision, editor name or other editorial key. The shapes are in
[rest-contracts](../../openspec/specs/rest-contracts/spec.md) ("Public content
responses return published entries").

Public model reads use the family selected by the model kind descriptor and
the configured route. Shared export queries use descriptor eligibility and
the route of the published snapshot to assign entries to export sections.
[Content-model kinds](content-configuration.md#content-model-kinds)

Each page, global, collection item, by-path lookup and collection or records
list response comes from one committed database state. A republish at the same
address can return the complete earlier or later publication. The selected
items, visible blocks, local link manifests, media and continuation cursor all
come from that state. Each list page request sees its own committed state.
The build export pins its sequence to a published-state version.

- `blocks` hold visible blocks only and never carry `hidden`. Media referenced
  only by hidden blocks are absent from `media` dictionaries and not served by
  the public media route, yet keep their reference rows and stay protected by
  the deletion guard.
- The globals read is anonymous, reads by model key without
  `published_routes`, and answers `404` for an unknown key, a page or
  collection key, or an unpublished global. `records/:modelKey` lists route-less
  collection entries the same way, newest publication first.
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

The application registers build export only when its composition supplies a
build-token verifier. Without one, the path returns the standard API `404`
and live OpenAPI omits the operation. A registered export verifies the token
before reading a page or the published-state version used for conditional
responses.

`build-export` returns all routed published entries, every published global,
the export SEO section and referenced media in one build-efficient sequence, so
Astro generation avoids an N+1 request pattern. It is paged so that no single
request builds, validates or serializes the whole site
([rest-contracts](../../openspec/specs/rest-contracts/spec.md), "The build
export is delivered in bounded keyset pages"):

- Entries are ordered by `published_routes.path` and paged by an opaque keyset
  cursor that binds the published-state version and the last delivered path;
  additive format-2 `records` (route-less entries) follow by model key and ID.
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
short-lived R2/S3 URL, so static HTML keeps a durable URL while storage
credentials and object keys stay private.

The public media route serves an object only when a currently published
snapshot references it; admin media endpoints provide draft previews. Knowing
an unreferenced media ID does not publish it.

Stored originals never change, so original binary responses carry a strong ETag
derived from the media ID alone (`"m-<mediaId>"`), separate from the metadata
ETag used for `If-Match`. Authorization, eligibility and not-found are decided
before conditional evaluation, so unpublished or deleted media never receives
`304` ([hono-app-factory](../../openspec/specs/hono-app-factory/spec.md),
"Media binary responses carry cache validators"). The public route caches for
one day, so a browser may keep media up to a day after it stops being
published; unbounded or `immutable` caching is deliberately not used.

The build thumbnail route verifies the build token before media or storage
work. It uses the public original's current eligibility before and after
reading the same bounded, private derivative used by the admin. It returns
WebP or a conditional `304` with `Cache-Control: private, no-cache` and a
derivative ETag. Ineligible media returns the public media `404`. Unavailable
derivatives return `503 MEDIA_THUMBNAIL_UNAVAILABLE` with `Cache-Control:
no-store`. Build thumbnails are served directly and their URLs stay out of
the export and static site.

### Admin endpoints

Admin resources are content models, entries and their lifecycle commands,
media and media tags, site builds, the session summary, users, invitations,
settings status, build tokens, import tokens and the import-credential
description.

`GET /api/v1/admin/media/:mediaId/thumbnail` requires a browser session,
`content:read` and an active media item. It can serve unpublished media. A
successful response delivers the private WebP with `Cache-Control: private,
no-cache` and a strong validator derived from the derivative bytes. Conditional
requests are evaluated after authorization, eligibility and availability. An
unavailable derivative returns `503 MEDIA_THUMBNAIL_UNAVAILABLE` with
`Cache-Control: no-store`. The existing preview endpoint serves the original.

- Entry detail returns the quoted draft revision in `ETag` with
  `Cache-Control: no-store`. Save, publish, revert, delete and duplicate
  accept that tag through `If-Match`. A supplied body revision must agree
  with the header. Media metadata uses its monotonic `updatedAt` tag.
  Unpublish guards the observed publication with `expectedPublishedSnapshotId`.
- The draft `PUT` takes a revision precondition plus the complete editable draft
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
- Entry reference discovery and direct impact require a browser session with
  `content:read`. Discovery uses the current published snapshot to identify
  published targets, including route-less records. Impact pages identify the
  source snapshot and field or block pointer. Delivered published uses block
  deletion and unpublication. Draft-only deletion review and existing URL
  review use separate receipts. Content validation may include a bounded cycle
  witness and a verified source to publish first for an authorized reader.
- Media deletion with `detach=drafts` uses the session-authenticated DELETE
  route for admission, one named entry and revision per request, and finish.
  Every request requires both write permissions. HTTP 200 carries progress,
  and HTTP 202 carries the deleting item after the outbox commit.
- Media tags are read with `content:read` and changed with `media:write`; tag
  filters and the tag catalog are bounded reads
  ([media-use-cases](../../openspec/specs/media-use-cases/spec.md), "Media
  lists filter by tags and expose a tag catalog").
- Import lookups are list parameters: exact draft `slug` on collection entry
  lists and `sha256` on media lists, both applied before paging and bound into
  continuation cursors.
- Users, invitations and build history use bounded keyset pages with an
  opaque `after` and an optional `nextCursor`. User pages also provide counts
  over all accounts. MCP connections use the same page contract with cursors
  scoped to the session owner. Admin entry and media lists, these operational
  lists and MCP `list_entries` share the 1–100 page limit and default of 50.

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
- The versioned handlers infer validated inputs from their schemas. The
  return type of `createLaceApp` carries the declared routes, response
  formats and handler status codes for Hono clients. Capability checks
  decide which optional routes are available in each deployment.
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
