## Context

See proposal.md for motivation. Current state:

- `media` rows hold technical and descriptive metadata (`packages/db/src/schema.ts`);
  the latest migration is `0013_oauth_verification_indexes`.
- `MediaUseCases` (`packages/application/src/media-use-cases.ts`) implement list,
  get, create, delete-request, retry and metadata update with `media:write` /
  `content:read` checks; the update uses `updatedAt` optimistic concurrency and
  bumps the published version only when a current publication references the item.
- `ListMediaInput` is `{after, limit, q, sort, type}`; Node and D1 share SQL
  helpers in `packages/db/src/sql-content.ts`, including `mediaCursorKind`, which
  binds cursors to `[sort, type, q]`.
- D1 metadata updates run as one guarded `batch()`; Node uses a transaction.
  Node opens SQLite with `foreign_keys = ON`; final deletion removes the media
  row in a guarded statement on both runtimes.
- REST: list uses `mediaListQuerySchema`; upload parses multipart and accepts
  only a `file` part; the update uses `updateMediaMetadataRequestSchema` and
  strong `If-Match`; DTOs use the strict `mediaMetadataSchema`.

## Goals / Non-Goals

**Goals:**

- One normalization function shared by contracts, application, both
  repositories and later SM3B/SM4 clients.
- Tags stored, filtered and counted with indexed SQL that behaves identically on
  SQLite and D1.
- No effect on published content, build export, public DTOs or builds.

**Non-Goals:**

- Admin UI beyond keeping the admin client type-correct with the new DTO.
- Tag administration across items (rename, merge, delete).

## Decisions

### D1. Join table, not a JSON column

`media_tags (media_id, tag)` with primary key `(media_id, tag)` and index
`(tag, media_id)`. AND filtering, catalog counts and prefix search become
indexed queries; a JSON column in `metadata_json` would need `json_each` scans
and could not be counted or prefix-searched efficiently on D1. The foreign key
cascades on Node, but every runtime also deletes tag rows explicitly in the
guarded final-deletion statement group, so D1 correctness never depends on the
foreign-key pragma.

### D2. Shared normalization in `@lacecms/domain`

`normalizeMediaTag(value): string | undefined` and
`normalizeMediaTags(values): {tags} | {issue: index}` live in
`packages/domain` next to `normalizeMediaText`, which contracts and the
application already import. Steps: reject control characters before trimming → trim surrounding spaces →
convert ASCII A–Z to a–z → require `[a-z0-9-]{1,40}`. Do not apply NFKC,
transliteration or whitespace-to-hyphen conversion. Reject internal whitespace,
Cyrillic, full-width letters, emoji, commas, other punctuation and unpaired
surrogates. Output is deduplicated and sorted by ordinary JavaScript string
order, identical to SQLite BINARY order for this ASCII alphabet. Retain limits
of 20 distinct tags per item and five input tags per filter. Input strings are
bounded to 200 code points before normalization at the transport boundary.

### D3. Update and create carry tags in the existing atomic operations

`UpdateMediaMetadataInput` gains optional `tags`. The use case computes
`changed` across all values; a tags-only change sets `updatedAt` like other
changes but passes `publishedEffect: false`, so the repository skips the
version increment and build enqueue. The repository port's metadata update
receives the full desired tag set and replaces rows inside the same transaction
(Node) or guarded batch (D1): `delete from media_tags where media_id = ? and
<guard>` then one multi-row `insert ... select ... where <guard>` (≤ 20 rows,
≤ 41 bound parameters). Create stores tags in the same batch as the metadata
row. Stored tags are returned by re-reading or from the normalized input after
a successful guard.

### D4. Filter and cursor binding

`ListMediaInput` gains `tags?: readonly string[]` (normalized, sorted, ≤ 5).
SQL adds one `exists (select 1 from media_tags t where t.media_id = media.id
and t.tag = ?)` per tag; with the `(tag, media_id)` index each is a point
lookup. `mediaCursorKind` becomes `["media", sort, type, q, tags]`, so cursors
from a different tag set fail the existing kind check. Unknown tags simply match
nothing.

Alternative rejected: `media_id in (select media_id from media_tags where tag in
(...) group by media_id having count(*) = n)`. Equivalent, but it complicates the
existing keyset pagination and is harder to keep within D1 budgets.

### D5. Catalog query

`select tag, count(*) from media_tags where tag >= ? and tag < ? group by tag
order by tag limit ?` for a prefix (upper bound = prefix with its last code
point incremented, avoiding `LIKE` escaping), with keyset continuation `tag > ?`.
The cursor kind binds the normalized prefix. Counts include every media status
because rows exist until final metadata removal.

### D6. Transport

- `mediaListQuerySchema`: `tag` accepts a string or array (Hono `queries`),
  normalized and deduplicated; pointers `/tag/<index>`.
- Upload: the multipart loop accepts text parts named `tags` (≤ 20 parts,
  ≤ 200 code points each) besides the single `file`; validation runs after
  parsing and before `media().create`, so no object is written on failure.
- `updateMediaMetadataRequestSchema` gains `tags`; `mediaMetadataSchema` gains
  required `tags: string[]`. The admin client compiles against the new DTO;
  rendering tags is SM3B.
- New route `GET /api/v1/admin/media/tags` with `mediaTagCatalogSchema` and
  OpenAPI entries; it uses the ordinary session actor resolution, so MCP and
  build tokens are refused as on every admin route.

### D7. Public isolation

Public media DTOs, the media dictionary and the build export are built from
separate projections that never select `media_tags`; contract tests assert the
absence. Tags do not participate in `content_media_references` or usage.

## Risks / Trade-offs

- [Normalization differs between clients] → one shared ASCII-only normalizer;
  SQL compares stored normalized strings exactly.
- [Catalog of a large tag set] → keyset pagination with limit ≤ 100 and an
  index on `tag`.
- [Required `tags` key breaks a mismatched admin build] → admin and API ship
  together (existing release rule); the strict DTO surfaces mismatches early in
  tests rather than silently.
- [Upload part ordering] → all parts are parsed before validation; the file is
  already buffered by the current implementation, so no new memory cost.

## Migration Plan

1. Ship migration `0014` with the engine; operators run the documented
   migration step on Compose and Cloudflare before starting the new API.
2. No backfill: existing media start without tags.
3. Rollback: the older engine ignores `media_tags`; restoring a pre-`0014`
   database backup removes tags. Drizzle journal and the release notes record
   the migration.
