# ADR 0009: Media metadata

- Status: Accepted
- Date: 2026-10-11
- Governing architecture: [section 9.7](../mvp-architecture.md#97-media) and
  [section 12](../mvp-architecture.md#12-rest-api)
- Related: [content and editor roadmap](../content-editor-roadmap.md) step CE3,
  OpenSpec changes `ce03a-media-metadata-storage-api`,
  `ce03b-admin-media-metadata-editing` and `ce03c-public-delivery-contract`

## Context

Media had technical metadata only: filename, MIME type, size and dimensions.
Alt text existed only as a required field of the `image` block, so a reused
image needed its description repeated in every block, the hero block had
none, and public consumers could neither describe an image nor crop it around
its subject. Nothing about a media item could be edited after upload.

## Decision

1. **Fields.** A media item carries optional `alt` (at most 1,000
   characters), `caption` (at most 2,000 characters) and `focalPoint` (`{x, y}`,
   each from 0 to 1). Title and credit are not added. The values are dedicated
   nullable columns with database checks. `metadata_json` stays reserved.
2. **Metadata is global and goes live on the next build.** Every usage of an
   item shares its metadata. Editing an item that a current published
   snapshot references increments `published_state.version` and requests a
   site build (reason `media_metadata`) in the same atomic mutation. Published
   snapshots are not rewritten and no republication is needed.
3. **Alt text is optional.** The effective alt text of a usage is the
   usage-level alt (such as the `image` block's `alt`), then the media item's
   `alt`, then an empty string. Missing alt text never blocks publication; the
   admin warns instead.
4. **Concurrency on `updatedAt`.** A metadata update requires a strong
   `If-Match` tag holding `updatedAt` in Unix milliseconds. Every committed
   update writes `max(now, previous + 1)`, so successive versions always have
   distinct tags. A stale tag fails with `MEDIA_UPDATE_CONFLICT`.
5. **Additive migration.** Migration `0006` adds the columns with
   `ALTER TABLE … ADD … CHECK`. It does not rebuild `media`, which other tables
   reference and which D1 cannot rebuild with foreign keys switched off.
6. **Public delivery resolves media (CE3C).** Public content responses return
   the published entry directly (`{id, modelKey, path, slug?, title, fields,
   blocks, publishedAt}`, no mirrored `draft`) with a `media` dictionary keyed
   by ID that resolves exactly the media referenced by the returned published
   snapshots: `{id, url, mimeType, width, height, alt, caption, focalPoint}`,
   unknown values `null`. Values keep storing IDs. The repository reads the
   dictionary in the same pass as the entries from the reference projection.
7. **One effective-alt rule.** `effectiveAltText` lives in `@lacecms/content`
   and is re-exported by `@lacecms/contracts`, so the SDK `image()` lookup and
   the render-core image describer agree without new package dependencies.
8. **Media URL origin.** The API builds dictionary URLs from its configured
   public base URL, never from the request. A site that configures
   `LACE_PUBLIC_BASE_URL` rebuilds them on that origin; otherwise it keeps the
   API's URLs instead of falling back to the build's API base, which is often
   an internal address.
9. **Pages keep working.** Block props gain `image(mediaId, usageAlt?)`
   (source URL, effective alt, dimensions, focal-point `object-position`) while
   `mediaUrl` and the `LaceBlocks` props stay, so only code that reads REST
   responses or the raw export has to change.

## Alternatives considered

- **Store the values in `metadata_json`.** Rejected: no database
  constraints, JSON extraction on every read, and the column is reserved.
- **Copy media metadata into snapshots at publication.** Rejected: a typo fix
  in alt text would require republishing every entry that uses the image.
- **Require alt text.** Rejected: decorative images legitimately have empty
  alt text, and blocking publication on it would push editors to enter filler.
- **A new integer revision column for media.** Rejected: `updated_at` already
  changes with every write, and forcing it to be monotonic avoids a backfill.
- **Reuse `CONTENT_REVISION_CONFLICT`.** Rejected: its message speaks of
  drafts, and clients branch on the code.
- **Embed resolved media inside block data in public responses.** Rejected:
  values would change meaning and an item used twice would be duplicated.
- **Replace the `LaceBlocks` `mediaUrl` prop with a site prop.** Rejected: it
  would break every user page while the entry can carry its own resolver.

## Consequences

- Since CE3C a metadata edit of published media changes the build-export body
  and ETag, and the rebuilt site shows the new alt text, caption or focal point.
- The public JSON shape changed during alpha (template 0.23.0 upgrade notes).
- Repeated edits of a widely used image coalesce into one pending build per
  debounce window.
- Media used only by drafts can be edited without any build.
- The built-in `image` block makes its alt text optional (CE3B). Under the
  schema-evolution rules this is a block definition change, so `image` moves
  to version 2 with an identity migration, models that allow it raise their
  version, and configuration sync rewrites the stored schema version of
  existing `image` blocks (drafts get a new revision by
  `system:content-sync`). A site built with the new packages refuses
  `image` blocks still stored at version 1, so sync runs before the build.
