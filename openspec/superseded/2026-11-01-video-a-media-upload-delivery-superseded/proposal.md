## Why

A designer portfolio built on Lace (the reference case is a Framer site with
autoplaying muted loops and Vimeo embeds in every case study) cannot be built
today: the media library accepts only JPEG, PNG, GIF, WebP and AVIF images up to
10 MiB, every upload is buffered whole in memory, and public media responses
cannot serve byte ranges, which Safari requires to play video. This change
lays the media foundation for video; the blocks and the admin follow in two
later changes.

## Roadmap unit

This is **step A of a three-change video plan** recorded in `backlog.md`. The
plan is a post-roadmap selection (not one of CE10–CE12):

- **A — `video-a-media-upload-delivery` (this change):** media formats, limits,
  streamed upload, ranged delivery, field-level accepted kinds.
- **B — video blocks:** the built-in `video` block (uploaded media, image
  poster, autoplay/loop/muted/controls settings) and `videoEmbed` block
  (Vimeo/YouTube), the URL-field embed-provider option, render-core
  describers and Astro registry components.
- **C — admin video:** library and picker support for video (tiles, preview
  player, kind filter, per-kind local checks, streamed upload transport).

A is verifiable alone through the REST API, the storage adapters and the
public media endpoint, which is why it is not combined with B or C.

## What Changes

- Accept **MP4** (ISO BMFF, H.264/H.265/AV1 agnostic) and **WebM** videos,
  verified by a new portable streaming container inspector that records the
  displayed width and height and rejects QuickTime, malformed or truncated
  containers and files without a video track.
- Separate size limits: images stay at **10 MiB**, videos get **64 MiB**.
- A second, **streamed binary upload transport** on the existing
  `POST /api/v1/admin/media` route (`Content-Type: application/octet-stream`,
  required `Content-Length`, `filename` query parameter) that writes to object
  storage without buffering the file. The multipart transport stays and keeps
  its 10 MiB buffered cap.
- `ObjectStorage` gains streamed writes with a declared length and an idle
  timeout, and ranged reads. R2 and MinIO adapters implement both.
- Public and admin-preview media responses support a single HTTP byte range
  (`206`, `416`), send `Accept-Ranges`, `Content-Length` and
  `X-Content-Type-Options: nosniff`.
- `field.media({ accept: ["image", "video"] })`: media fields declare accepted
  kinds; the default stays images only, so every existing media field, the
  built-in blocks and the SEO image keep rejecting video. Draft saves reject a
  reference whose media kind the field does not accept.
- Admin media list accepts `kind=image|video` and the new MIME types in `type`.
- Raise the VPS proxy's media-route body limit to the new upload ceiling.
  The proxy requirement and its config-consistency test come from the
  separate change `fix-vps-media-upload-limit`, which this change depends on;
  here only the configured value follows the new API limit.
- Architecture §8 and §9.7 describe the video formats, limits, transports and
  the `accept` option.

No breaking change: existing DTO shapes, stored rows and configuration hashes
of configurations that do not use `accept` stay the same; no migration is
needed because `media.mime_type` has no CHECK constraint.

## Non-goals

- GIF support: moved to `images-a-media-format-caching`, which also adds
  `ETag`/`Cache-Control`/`304` to media responses. That change modifies the
  same image-upload and Worker-inspection requirements, so before this change
  is applied its `media-use-cases`, `cloudflare-media-storage` and
  `rest-contracts` deltas must be rebased on the synced specs (keep GIF), and
  ranged responses must keep the cache headers.
- The VPS proxy body-limit fix itself: change `fix-vps-media-upload-limit`.
- Video blocks, posters, embeds and site rendering (step B).
- Admin UI for video (step C); the admin keeps uploading images through
  multipart until then.
- Transcoding, thumbnails generated from frames, duration or codec
  inspection, QuickTime `.mov`, audio-only files, HLS/DASH streaming.
- Direct-to-bucket (presigned) uploads, resumable uploads, CDN caching or
  `Cache-Control` for media, deployment-configurable limits.
- Narrowing `accept` with existing stored references is reported as
  `breaking`; a data-aware `validated` scan is a later candidate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `media-use-cases`: image upload no longer rejects videos as "another MIME
  type"; video upload with its own limit and verification; streamed creation with a declared length; ranged
  binary reads.
- `hono-app-factory`: the media upload route has two transports with per-kind
  limits; media binary responses serve byte ranges with safe headers.
- `rest-contracts`: the media transport describes the binary upload; the
  media-list query accepts `kind` and the new MIME types.
- `cloudflare-media-storage`: R2 streamed writes with a declared length and
  per-kind limit, ranged reads, idle timeout; the Worker verifies videos with
  the portable video inspector.
- `node-minio-object-storage`: streamed writes with a declared length, ranged
  reads, idle timeout for streamed writes.
- `field-descriptors`: media fields declare accepted media kinds.
- `content-use-cases`: draft saves reject media of a kind the field does not
  accept.
- `schema-evolution`: widening `accept` is compatible, narrowing is breaking.

## Impact

- Architecture: `docs/mvp-architecture.md` §8 (field types), §9.7 (media),
  §12 (media routes).
- Code: `packages/application` (media use cases, `image-container.ts`, new
  `video-container.ts`, ports, limits), `packages/content` (media field
  option and normalization), `packages/config` projection, configuration
  evolution in `packages/application`, `packages/contracts` (media schemas),
  `packages/server` (upload route, binary responses), `packages/db`
  (media-list `kind` filter), `packages/platform-cloudflare` (R2 adapter),
  `packages/platform-node` (MinIO adapter), the media-route value in both
  `deploy/nginx.conf` copies (with a template version bump),
  `apps/api` OpenAPI snapshot.
- APIs: additive only (new upload transport, `kind` query, `type` values,
  range headers). OpenAPI document regenerated.
- Operations: Cloudflare Free/Pro request bodies are capped at 100 MB, which
  the 64 MiB limit respects; each ranged video request is a Worker invocation.
