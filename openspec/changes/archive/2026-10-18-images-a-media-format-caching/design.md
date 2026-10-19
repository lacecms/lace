## Context

See proposal.md for motivation. Current state:

- `detectMediaMimeType` and `ALLOWED_MEDIA_MIME_TYPES`
  (`packages/application/src/media-use-cases.ts`, `index.ts`) know four
  formats; `CompleteImageContainerInspector` (`image-container.ts`) parses
  each format completely without decoding pixels and is used directly by the
  Worker and before sharp on Node (`packages/platform-node/src/image-inspector.ts`,
  `expectedFormat`).
- `mediaMimeTypeSchema` in `packages/contracts` validates the media-list
  `type` query; the admin mirrors the list in
  `apps/admin/src/entities/media/media-limits.ts` (local check, `accept`
  attribute, labels, constraint text) and `widgets/media-library/library-query.ts`
  (filter options).
- `binaryResponse` in `packages/server/src/app.ts` sends only `content-type`
  and `content-disposition`; `readPublic`/`preview` load metadata and then
  always open the object stream.
- The build-export route already implements `If-None-Match` → `304` with a
  version tag; the media metadata routes use `mediaEntityTag(updatedAt)` for
  `If-Match` on metadata updates.

## Goals / Non-Goals

**Goals:** GIF parity on both runtimes; cheap revalidation of media binaries
without a storage read; no change for clients that ignore caching.

**Non-Goals:** GIF transcoding, ranges, CDN configuration, long-lived caching.

## Decisions

### D1. GIF parsing

`parseGif` in `image-container.ts`: 6-byte signature (`GIF87a`/`GIF89a`),
logical screen descriptor (width, height ≥ 1), optional global color table
(`3 × 2^(n+1)` bytes), then a block loop until the trailer `0x3B`:
extension `0x21` + label + data sub-blocks (length-prefixed, ending with a
zero-length block); image descriptor `0x2C` (left, top, width, height,
optional local color table, LZW minimum code size 2–8, data sub-blocks).
Each frame's rectangle must lie inside the logical screen, at least one image
descriptor must exist, and the trailer must be the last byte. GIF has no
orientation. sharp already reads GIF (`metadata.format === "gif"`); Node adds
`image/gif → "gif"` to `expectedFormat`. Pixel and dimension limits apply to
the logical screen, unchanged.

### D2. MIME lists in one place per package

`image/gif` is added to `ALLOWED_MEDIA_MIME_TYPES`, `MediaMimeType`,
`mediaMimeTypeSchema` and the admin `mediaTypes`, extension regex, labels and
filter options. The admin constraint text becomes "JPEG, PNG, GIF, WebP, or
AVIF. Maximum 10 MiB." The OpenAPI document picks the picklist up
automatically and is regenerated.

### D3. Binary tag = media identity

Stored bytes of a media item never change: uploads create a new item and
metadata edits never touch the object. The binary tag is therefore derived
from the item identifier alone, `"m-<mediaId>"` (strong, quoted), independent
of `updatedAt`. This is deliberately different from the metadata `ETag`
(`updatedAt`) used for `If-Match` on metadata updates: a metadata edit must
not invalidate cached image bytes. The tag is built only from the stored
identifier, which both runtimes generate as a UUID, never from the request
path, so it needs no escaping.

*Alternative:* hash of the bytes. Rejected: requires reading or storing a
digest; identity already guarantees uniqueness.

### D4. Eligibility first, then the conditional check, then storage

`MediaUseCases` gains `resolvePublic(mediaId)` / `resolvePreview(actor,
mediaId)` that return the eligible metadata (or `null`), and `openBinary(media)`
that opens the object stream; `readPublic`/`preview` keep their behavior by
composing them. The route: resolve (authorization and eligibility errors and
`404` unchanged) → compare `If-None-Match` against the tag → `304`, or open
the stream and send `200`. `If-None-Match` parsing in `packages/server`:
comma-separated list, `*` matches, weak comparison (`W/` ignored), any
unparseable member makes the header ignored.

### D5. Header values

- Public: `Cache-Control: public, max-age=86400`. One day bounds how long a
  browser keeps media after unpublication without revalidating; the owner
  rejected unbounded caching. After expiry, a revalidation is a metadata read
  plus `304`.
- Preview: `Cache-Control: private, no-cache` so shared caches never store
  authenticated responses and browsers always revalidate (cheap `304`).
- `ETag` on both, also on `304`. No `Vary` is needed: the public response does
  not depend on request headers, and the preview is private.

## Risks / Trade-offs

- [Unpublished media remains in browser caches for up to a day] → accepted
  by the owner; documented in architecture §12.
- [A malformed GIF variant passes the hand-written parser] → strict size
  accounting, sharp on Node as a second check, fixture tests for truncated,
  out-of-bounds-frame and trailing-data cases on both runtimes.
- [Draft change `video-a-media-upload-delivery` modifies the same image and
  Worker-inspection requirements] → after this change is archived, its deltas
  must be rebased to keep GIF; that change's proposal records this.

## Migration Plan

No database or configuration migration. Rollback: an older API rejects
stored `image/gif` items when building media views (`toMediaView` checks the
allowlist), so GIF items must be deleted before rolling back.
