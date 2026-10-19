## Why

Two media gaps block an image-heavy designer portfolio before the build-time
image pipeline (step B) can start:

- The architecture's media allowlist (§9.7) names GIF, but the code accepts
  only JPEG, PNG, WebP and AVIF, so animated GIFs, common in design work,
  cannot be uploaded.
- Media binary responses carry no caching headers. Every page view, admin
  thumbnail and (after step B) every site build re-downloads each file in
  full from the API, which on Cloudflare is a Worker invocation per request.

## Roadmap unit

**Step A of the three-change image-delivery plan** recorded in `backlog.md`
(selected on 2026-10-18; it replaces CE11):

- **A — `images-a-media-format-caching` (this change):** GIF upload and cache
  validators on media responses.
- **B — build variants:** blurred 64 px placeholder, WebP at 960/1920 px,
  `srcset`, lazy loading, full-screen original behind a per-block setting.
- **C — deploy caching:** long caching of hashed site assets and persistent
  build caches.

A is verifiable alone through the API, the admin library and both storage
runtimes.

## What Changes

- Accept **GIF** (GIF87a and GIF89a, static or animated) as an image upload
  within the existing 10 MiB and dimension limits; the recorded dimensions are
  the logical screen. Verified by the portable container inspector on both
  runtimes and by sharp on Node.
- The admin library accepts, labels and filters GIF; the media-list `type`
  query accepts `image/gif`.
- `GET /api/v1/public/media/:mediaId` sends `Cache-Control: public,
  max-age=86400` and a strong `ETag` that identifies the immutable bytes of the
  item; a matching `If-None-Match` receives `304 Not Modified` without reading
  object storage.
- `GET /api/v1/admin/media/:mediaId/preview` sends `Cache-Control: private,
  no-cache` with the same `ETag` and the same `304` behavior, after the usual
  authorization.
- Eligibility is always checked first: unpublished, deleted or unauthorized
  media never receive `304`.

No breaking change, no migration, no new configuration.

## Non-goals

- Converting or resizing GIFs (they are delivered as uploaded; step B copies
  them into the site unchanged).
- Byte ranges, `nosniff` and other video-related response changes (draft
  change `video-a-media-upload-delivery`).
- Long-lived or `immutable` caching (rejected by the owner), CDN purging,
  `Last-Modified`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `media-use-cases`: GIF joins the verified image formats.
- `cloudflare-media-storage`: Worker image inspection covers GIF.
- `rest-contracts`: the admin media-list `type` accepts `image/gif`.
- `hono-app-factory`: media binary routes send cache headers and answer
  conditional requests.
- `admin-media-library`: the library accepts and filters GIF uploads.

## Impact

- Code: `packages/application` (`detectMediaMimeType`, `image-container.ts`
  GIF parser, MIME lists, media binary resolution without a storage read),
  `packages/platform-node` (sharp `gif`), `packages/contracts` (MIME
  picklist), `packages/server` (binary response headers and `304`),
  `apps/admin` (`media-limits.ts`, library type filter options), `apps/api`
  OpenAPI document.
- Docs: `docs/mvp-architecture.md` §9.7 and §12, `docs/cloudflare-worker.md`.
- Draft change `video-a-media-upload-delivery` modifies the same image and
  Worker-inspection requirements and must be rebased on this change's synced
  specs before it is applied.
