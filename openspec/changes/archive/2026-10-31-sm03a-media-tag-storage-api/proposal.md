## Why

A real portfolio holds hundreds of images and GIFs (tatianae.com: roughly 65
projects with several media each). The media library is a flat list searchable
only by filename and type, so editors cannot group or find media by project or
theme. The owner selected tags, not folders, as the first organization tool.
This session delivers the storage and API that the admin tagging UI (SM3B) and
`lace import` (SM4) build on.

## Roadmap unit

Session **SM3A** of step SM3 in
[`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md).
SM3B (admin tagging) and SM3C (multi-select picker) are separate sessions.
Depends on CE3 media metadata and the existing media list, detail and update
contracts.

## What Changes

- Media items carry an unordered set of ASCII tags: trim surrounding spaces,
  lowercase ASCII letters, then require `[a-z0-9-]{1,40}`. Reject control
  characters before trimming; reject internal spaces, non-ASCII characters and
  punctuation other than the ordinary hyphen. Do not transliterate, apply NFKC
  or replace spaces with hyphens. At most 20 distinct tags per item; duplicates
  after normalization collapse silently.
- Additive migration `0014` creates `media_tags (media_id, tag)` with a
  composite primary key, a `(tag, media_id)` index and a cascading foreign key,
  identical on Node SQLite and D1.
- The metadata update (`PATCH /api/v1/admin/media/:mediaId`) accepts `tags` as a
  full replacement under the existing `If-Match` concurrency. A tag change
  advances `updatedAt` but never changes the published-content version or
  requests a build; combined updates keep today's build rule for alt, caption
  and focal point.
- Upload (`POST /api/v1/admin/media`) accepts optional repeated `tags` text
  parts, validated before any object is stored.
- `GET /api/v1/admin/media` accepts up to five `tag` parameters with AND
  semantics; cursors are bound to the normalized tag set.
- New `GET /api/v1/admin/media/tags` lists tags with their media counts in
  ascending order, with an optional normalized prefix `q` and cursor
  pagination, for autocomplete and filters.
- Every admin media DTO gains a required `tags` array, sorted ascending.
- Tags are admin organization only: absent from public DTOs, the build export
  and MCP; final media deletion removes its tags.

## Scope, Dependencies and Non-goals

Admin REST and application only. Non-goals: admin UI (SM3B), picker
multi-select (SM3C), import (SM4), folders, tag rename/merge/delete across
items, tag colors or descriptions, bulk tagging, public tag delivery, tags on
content entries, MCP media tools.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `media-use-cases`: tag model and normalization; the metadata update accepts
  tags without build effects; list filtering and a tag catalog read.
- `rest-contracts`: media-list `tag` parameters, DTO `tags`, update `tags`,
  upload tags, and the tag catalog endpoint.
- `sqlite-schema-and-migrations`: migration `0014` and its constraints.
- `content-repository-contracts`: shared Node/D1 cases for tags.
- `d1-content-repositories`: tag writes inside the existing guarded metadata
  batch and bounded tag reads.

## Impact

- Architecture §9.7 *Media* (tags table and rules), §12 *Admin endpoints*
  (new route, parameters), §16 D1 budgets for filtered lists. No invariant
  changes: tags are admin metadata and never reach published content.
- Code: `packages/db` (schema, migration), `packages/application` (ports,
  use cases, normalization), `packages/contracts` (schemas, OpenAPI),
  `packages/server` (routes, multipart), `packages/platform-node` and
  `packages/platform-cloudflare` (repositories), `packages/test-utils`
  (contract cases), `apps/admin` (DTO typing only, no UI), `docs/`.
- Operators run migration `0014` on upgrade; template notes record it.
