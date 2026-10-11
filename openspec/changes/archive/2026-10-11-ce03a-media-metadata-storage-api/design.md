## Context

See proposal.md for motivation. Current state that shapes the approach:

- `media` (architecture 9.7) has technical columns only. `metadata_json` is
  written as `'{}'` by both adapters and never read. Media rows change only
  through upload, the deletion lifecycle (`active → deleting →
  delete_failed`) and the dispatcher. `updated_at` is set on each transition.
- The portable `MediaUseCases` (`packages/application/src/media-use-cases.ts`)
  depends on `MediaReadPort & MediaListPort & MediaCatalogPort &
  MediaCommandPort`. Node (`packages/platform-node/src/content-repository.ts`)
  and D1 (`packages/platform-cloudflare/src/d1-content-repository.ts`)
  implement them over shared SQL and row mapping in
  `packages/db/src/sql-content.ts`. `InMemoryContentStore` in
  `@lacecms/test-utils` implements them for application tests.
- Publication-affecting mutations call a private `bumpPublicState` (Node) or
  `addPublicStateBump` (D1). It increments `published_state.version` and
  enqueues or coalesces the single pending `site.build.requested` event. The
  build reason is derived from the requester (`configuration_sync` or
  `publication`). The `site_builds.reason` column is free text, and the admin
  builds page renders it with underscores replaced by spaces.
- "Referenced by a current published snapshot" already has a canonical SQL
  form in `PUBLIC_MEDIA_SQL`: a `content_media_references` row joined to
  `content_entries.published_snapshot_id`, served by the `media_id` index.
- Entry mutations use integer revisions and `If-Match` tags such as `"4"`
  (`entityTagForVersion` and `resolveExpectedRevision` in
  `@lacecms/contracts`). Media has no revision column.
- The Worker's `DISPATCH_PRODUCING_REQUESTS`
  (`packages/platform-cloudflare/src/worker.ts`) lists the requests that get a
  post-commit dispatch pass. CE2A did not add `POST …/unpublish`.

## Goals / Non-Goals

**Goals:**

- Store, validate and edit `alt`, `caption` and `focalPoint` with the same
  atomicity guarantees on Node and D1.
- Make a metadata change of published media reach the site through the
  existing publication-version and build pipeline, without republication.
- Give CE3B a complete, stable admin contract (DTO fields, PATCH route,
  version tag, conflict code).

**Non-Goals:**

- Public responses, the build export payload and the SDK stay unchanged until
  CE3C. In CE3A a version bump therefore rebuilds the site with identical
  output. This is accepted so that the publication rule exists before the
  public contract starts exposing metadata.
- No revision history or audit trail of metadata changes. The `media` table
  has no `updated_by` column, and none is added.
- No Unicode normalization of text values. Text is stored as submitted after
  trimming and line-break normalization.

## Decisions

### D1. Dedicated columns, hand-shaped additive migration

The columns are `alt TEXT`, `caption TEXT`, `focal_x REAL` and
`focal_y REAL`, all nullable, with the checks from the spec. They are
dedicated columns rather than keys in `metadata_json`. Columns let SQLite and
D1 enforce lengths and ranges, and keep `metadata_json` free for later use as
the roadmap requires.

SQLite cannot add a table-level `CHECK` with `ALTER TABLE`, and a Drizzle
table-level `check()` makes drizzle-kit emit a full table rebuild
(`__new_media`, copy, drop, rename). A rebuild of a table referenced by
`content_media_references … ON DELETE RESTRICT` is risky on D1, which does not
allow switching foreign keys off. Migration `0006` therefore uses only
`ALTER TABLE media ADD <column> … CHECK (…)` statements. SQLite allows a
column `CHECK` to reference other columns, so the pairing rule
`(focal_x IS NULL) = (focal_y IS NULL)` sits on `focal_y`, which is added
after `focal_x`. SQLite tests added checks against existing rows, and those
rows are all `NULL`. Procedure: declare the columns and the equivalent
table-level `check()` entries in `schema.ts` so that the Drizzle snapshot
records them. Run `pnpm --filter @lacecms/db db:generate`. Replace the
generated rebuild SQL with the additive statements and keep the generated
snapshot and journal entry. The migration test proves that the result on a
`0005` database refuses the same values that a fresh schema refuses.
`checkedInMigrations` gains the new entry, and the inventory test keeps it in
lockstep with the journal.

*Alternatives:* store the values in `metadata_json`. This was rejected
because it has no database constraints, every read would need JSON
extraction, and the column is reserved. A full table rebuild was rejected
because of the foreign-key and D1 risk. Columns without checks were rejected
because the roadmap requires database constraints.

### D2. Version tag = `updatedAt` in milliseconds, forced monotonic

The concurrency token is the existing `updated_at`. The strong tag is
`entityTagForVersion(updatedAt)`, for example `"1791647444998"`, and is
parsed with the existing `versionFromEntityTag`. The admin DTO already
carries `updatedAt` as an ISO string with milliseconds, so a client can
derive the tag from either the header or the DTO. A metadata update writes
`updated_at = max(now, expectedUpdatedAt + 1)`. Two edits in the same
millisecond, or a clock that runs behind, still produce distinct tags. The
deletion-lifecycle transitions keep writing `now`. They also make an item
non-editable, so a tag collision there cannot hide a conflict.

The media `If-Match` is required, unlike entry mutations, which also accept
a body `expectedRevision`. Media has no body precondition, and the roadmap
names `If-Match`. A new helper `resolveMediaPrecondition(ifMatch)` in
`@lacecms/contracts` refuses absent, weak, `*`, list and malformed values.
The server maps the refusal to `VALIDATION_FAILED` through the existing
`invalid()` helper (empty issue path), exactly as the entry `revision()`
helper reports a bad `If-Match`.

*Alternatives:* a new integer `revision` column. This was rejected because
the roadmap specifies `updatedAt`, and a revision column would need a
backfill and would duplicate an existing monotonic-enough value.
`If-Unmodified-Since` was rejected because it has only second precision.

### D3. Use case owns validation, merge and no-op detection

`MediaUseCases.updateMetadata(input)` runs these steps:

1. `requirePermission(actor, "media:write")`.
2. Normalize and validate the patch with a pure `normalizeMediaMetadataPatch`.
   The text and coordinate rules (`normalizeMediaText`,
   `isMediaFocalCoordinate` and the length limits) live in `@lacecms/domain`,
   so the contracts request schema and the use case share one definition
   without contracts depending on the application layer. It trims, maps empty text to
   `null`, normalizes caption line breaks, refuses controls (`\p{Cc}`, with
   `\n` allowed in the caption) and lone surrogates (`\p{Cs}`), and counts
   code points with `[...value].length`, which matches SQLite `length()` for
   text. Failures raise `CONTENT_INVALID_STATE`.
3. Call `loadMedia`. `null` makes the use case return `null`, which the
   transport maps to `404`.
4. Status other than `active`: `CONTENT_INVALID_STATE`. Stored `updatedAt`
   differs from expected: `MEDIA_UPDATE_CONFLICT`. The repository re-checks
   both atomically, so this early check only produces the error before a
   write.
5. Merge the patch over the stored values. If the merged values equal the
   stored values (focal points compared by both coordinates), return the
   catalog view with build `not-dispatched`.
6. Call `media.updateMediaMetadata({mediaId, expectedUpdatedAt, updatedAt:
   max(now, expected + 1), alt, caption, focalPoint, requestedBy: actor})`
   with the complete merged values, then reload the catalog view.

The port receives complete values rather than a patch, so each adapter runs
one plain guarded `UPDATE` with no SQL `coalesce` logic, and lost updates are
impossible because the guard pins the version the merge was based on.

The result type is `{ media: MediaView; build: { status: "queued";
targetVersion } | { status: "not-dispatched" } }`. It mirrors the
publication results so that the existing `buildDispatchOutcomeSchema` is
reused.

*Alternative:* detect no-ops in SQL. This was rejected as needless
complexity in the D1 batch. A concurrent change between the read and the
no-op return is harmless, because the response describes a consistent
earlier state and nothing is written.

### D4. Repository port and adapter mutations

The new method on `MediaCommandPort`:

```ts
updateMediaMetadata(input: UpdateMediaMetadataInput): Promise<UpdateMediaMetadataResult>;
// input: mediaId, expectedUpdatedAt, updatedAt, alt|null, caption|null,
//        focalPoint|null, requestedBy: Actor
// result: { media: MediaMetadata; targetVersion?: number }
```

`MediaMetadata` (domain) gains `alt?`, `caption?` and `focalPoint?:
{x, y}`. The shared `mediaMetadata(row)` maps and validates them. A
half-set focal point or an out-of-range value in a row raises an
invalid-state error rather than being passed through. `MEDIA_COLUMNS_SQL`
selects the new columns, so the list, catalog, detail, by-ID, public-media
and batch reads all carry them without further changes.

`bumpPublicState`/`addPublicStateBump` take an explicit `reason`. Existing
callers keep their current reasons, and the new caller passes
`media_metadata` with `snapshotId: null`.

- **Node:** one `transaction()`. Checkpoint `media.metadata`, then `update
  media set alt=?, caption=?, focal_x=?, focal_y=?, updated_at=? where id=?
  and status='active' and updated_at=?`. With zero changes, re-read and throw
  `CONTENT_INVALID_STATE` for an existing item that is not `active`, or
  `MEDIA_UPDATE_CONFLICT` otherwise. Then, if `exists(published reference)`,
  call `bumpPublicState`, whose `public-state` and `build-outbox`
  checkpoints already exist. Return `targetVersion` only when bumped.
- **D1:** one batch. A `guard()` with the precondition `exists (select 1
  from media where id=? and status='active' and updated_at=?)`. Then the
  `UPDATE … where id=? and GUARD`. Then a second condition, `GUARD and
  exists(published reference)`, passed to `addPublicStateBump`. Then a
  trailing `select` that reports whether the guard and the reference held,
  issued before `releaseGuard`. The existing `addSiteBuildEnqueue` select
  returns the target version. Zero rows from the guard insert is classified
  after the batch with the Node rule. The statement count (about 8) is far
  inside the batch budget.
- **InMemoryContentStore:** the same guards, codes, version and build
  behavior, so the application tests describe adapter behavior.

### D5. Errors and transport

The new domain code `MEDIA_UPDATE_CONFLICT` maps to `409` with the message
"The media was modified by another request." `CONTENT_REVISION_CONFLICT` is
not reused, because its message speaks of drafts and clients branch on the
code. `@lacecms/contracts` adds `updateMediaMetadataRequestSchema` (strict,
non-empty, with the same limits through valibot `v.check` on code-point
length and character classes), `updateMediaMetadataResultSchema` (`{media:
mediaMetadataSchema, build: buildDispatchOutcomeSchema}`) and the optional
`alt`, `caption` and `focalPoint` on `mediaMetadataSchema`, with
`toMediaMetadataDto` extended. The server route parses the body with the
schema, then calls the use case, which normalizes again. That keeps the
portable layer safe for other transports. The detail `GET` and the `PATCH`
set `ETag`. The OpenAPI document is regenerated with `pnpm openapi:generate`
and checked by `pnpm openapi:check`.

### D6. Worker post-commit pass

The change adds `["PATCH", /^\/api\/v1\/admin\/media\/[^/]+$/u]` and
`["POST", /^\/api\/v1\/admin\/entries\/[^/]+\/unpublish$/u]` to
`DISPATCH_PRODUCING_REQUESTS`. A metadata update that returns
`not-dispatched` still triggers a pass. The pass finds no due event and
costs one claim query, which is cheaper than inspecting the response body.
The unpublish entry closes the CE2A gap, in which unpublication builds
waited for the next scheduled run.

## Risks / Trade-offs

- [In CE3A, a metadata edit of published media triggers a build with
  identical output] → Accepted and documented. CE3C makes the output depend
  on metadata. Build coalescing limits the cost of repeated edits to one
  build per debounce window.
- [The edited migration SQL can drift from the Drizzle snapshot] → The D1
  and Node migration tests assert the column set and the check behavior. The
  journal inventory test stays green, and a later `db:generate` sees no diff
  because the snapshot comes from the generator.
- [`updated_at + 1` can move `updatedAt` slightly ahead of the wall clock] →
  Only when edits arrive within the same millisecond as the previous write or
  the clock moves backwards. It has no user-visible effect, and media list
  sorting does not use `updatedAt`.
- [Writers who edit alt text of heavily used published media cause rebuilds]
  → This is the intended owner decision 2. The admin shows the queued
  outcome in CE3B.
- [The rule for clients that send an `If-Match` derived from an ISO timestamp
  with lost precision] → The DTO schema keeps milliseconds. The tag is also
  returned as a header, which the CE3B client uses directly.

## Migration Plan

1. Deploy the engine release containing migration `0006`. Node operators run
   `lace db migrate`, and D1 operators apply the checked-in migrations as for
   `0005`. The migration is additive. Older engines keep starting against a
   migrated database because they check only their own migrations.
2. No data backfill. All existing items start without descriptive metadata.
3. Rollback: an older engine ignores the new columns. A metadata value set
   by the new engine stays stored and unused. Dropping the columns is not
   required.

`docs/database-migrations.md` gains a section for `0006`. Architecture
sections 9.7 and 12 are updated before the code, and ADR
`0009-media-metadata` records the CE3 owner decisions and decisions D1–D3.
