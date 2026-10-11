## Why

Media items carry only technical metadata (filename, MIME type, size,
dimensions), and nothing can be edited after upload. Alt text exists only on
the `image` block, the hero block has none, and public consumers cannot
describe an image or crop it around its subject. Step CE3 of
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
adds reusable descriptive metadata. This change is session **CE3A — Metadata
storage and API**: the storage, the update command and the admin transport.
CE3B (admin editing) and CE3C (public delivery) build on it.

## What Changes

- Migration `0006` adds nullable `alt` (at most 1,000 characters), `caption`
  (at most 2,000 characters), `focal_x` and `focal_y` (reals from 0 to 1, both
  set or both null) to `media` on Node SQLite and D1. The columns are
  additive and enforced by database checks. `metadata_json` stays reserved and
  keeps the value `'{}'`.
- New media use case `updateMetadata` (`media:write`) and repository port
  method `updateMediaMetadata`. Values are plain text: trimmed, with an empty
  value meaning "clear", control characters refused (line breaks are allowed
  in the caption only), and length counted in Unicode code points. The focal
  point is a finite `{x, y}` pair within 0–1 or `null`. Only `active` media
  can be edited. A request that changes nothing writes nothing.
- Optimistic concurrency on `updatedAt`. The admin media DTO `updatedAt` and
  a new strong `ETag` header of the form `"<unix milliseconds>"` identify the
  version. A metadata update writes `updated_at = max(now, previous + 1)`, so
  every committed change gets a new tag. A stale tag fails with the new
  stable error `MEDIA_UPDATE_CONFLICT` (HTTP `409`).
- Metadata goes live on the next build (owner decision 2). When a current
  published snapshot references the item, the same atomic mutation increments
  `published_state.version` and enqueues or coalesces a site build with the
  new reason `media_metadata`. Media used only by drafts, or not used at all,
  changes neither.
- `PATCH /api/v1/admin/media/:mediaId` with a required strong `If-Match`
  header and a strict JSON body `{alt?, caption?, focalPoint?}` (at least one
  key; `null` clears). The response is `{media, build}` and reuses the
  existing build dispatch outcome (`queued` with `targetVersion`, or
  `not-dispatched`). `GET /api/v1/admin/media/:mediaId` also returns the
  `ETag`.
- Every admin media DTO (list, detail, upload, deletion, update) carries the
  optional `alt`, `caption` and `focalPoint` values.
- The Cloudflare Worker runs its best-effort post-commit dispatch pass after a
  successful metadata update. The pass also runs after entry unpublication,
  which CE2A left out of the dispatch-producing request list.
- Documentation: architecture section 9.7 (columns, update command,
  publication-version rule), section 12 (route), and a new ADR
  `0009-media-metadata` with the owner decisions for the whole of CE3.

Not in this change: the admin user interface (CE3B), the `image` block alt
relaxation (CE3B), the public entry shape, the resolved media dictionary, the
SDK and the render changes (CE3C). Title and credit fields are not added.
`metadata_json` is not used for the new values.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `media-use-cases`: new metadata update command with validation, the
  `active`-only rule, no-op detection, concurrency and the
  publication-version effect. Lifecycle results carry the descriptive
  metadata.
- `sqlite-schema-and-migrations`: migration `0006` with the descriptive
  metadata columns and checks.
- `node-content-repositories`: atomic metadata update with a guarded
  `updated_at` precondition and a conditional public-state bump.
- `d1-content-repositories`: the same update as one guarded batch.
- `content-repository-contracts`: shared contract cases for the update,
  conflicts and the build request rule on every runtime.
- `rest-contracts`: media DTO fields, the update request and result
  contracts, the media `If-Match` precondition, and the `MEDIA_UPDATE_CONFLICT`
  error.
- `hono-app-factory`: the authenticated `PATCH` media route and the media
  detail `ETag`.
- `cloudflare-scheduled-dispatch`: the post-commit pass also runs after a
  metadata update and an unpublication.

## Impact

- Packages: `@lacecms/domain` (`MediaMetadata` fields, error code),
  `@lacecms/application` (port, use case), `@lacecms/db` (schema, migration
  `0006`, shared SQL and row mapping), `@lacecms/platform-node`,
  `@lacecms/platform-cloudflare` (repository, Worker dispatch list),
  `@lacecms/contracts`, `@lacecms/server`, `@lacecms/test-utils`
  (in-memory store and repository contract suite), and the generated
  OpenAPI document `apps/api/openapi/api-v1.json`.
- Database: one additive migration on both runtimes. Operators run
  `lace db migrate` (Node) or the D1 migration as for any release.
- API: one new admin route and additive optional DTO fields. The admin client
  in `apps/admin` keeps working unchanged. CE3B consumes the route.
- Dependencies: CE1 is complete. No new third-party dependencies.
- Architecture: sections 9.7 and 12 of
  [`docs/mvp-architecture.md`](../../../docs/mvp-architecture.md). Sections 8
  and 13 change in CE3B and CE3C.
