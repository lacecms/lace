## Context

See proposal.md for motivation and scope. Current state that shapes the
approach:

- `MediaUseCases.create` (`packages/application/src/media-use-cases.ts`)
  collects the whole upload into one `Uint8Array` (`collectMediaBytes`), sniffs
  JPEG/PNG/WebP/AVIF, runs the `ImageInspector`, then calls
  `ObjectStorage.put`, which both adapters buffer again (R2 needs a body of
  known length; MinIO concatenates into a `Buffer`). Peak memory is about 2×
  the file. Fine at 10 MiB, fatal at 64 MiB in a 128 MB Worker isolate.
- The upload route parses multipart with `@mjackson/multipart-parser` 0.10,
  which only yields fully buffered parts (`part.content: Uint8Array[]`).
- `binaryResponse` in `packages/server/src/app.ts` streams the whole object
  with `content-type` and `content-disposition` only: no `Content-Length`, no
  range support, no `nosniff`. Safari refuses to play `<video>` from a server
  that does not answer range requests.
- `CompleteImageContainerInspector` (`image-container.ts`) is the
  runtime-neutral inspector used directly by the Worker and before sharp on
  Node. Image formats are unchanged by this change (GIF is out of scope).
- Media references are checked for `active` status during draft
  normalization (`content-use-cases.ts`, `loadMediaMany`), which already loads
  the referenced rows, including `mimeType`.
- `media.mime_type` is unconstrained `TEXT`; width/height are nullable. No
  migration is needed.
- The VPS proxy body limit is fixed by the separate change
  `fix-vps-media-upload-limit` (a prerequisite): it gives the exact
  `/api/v1/admin/media` location its own `client_max_body_size`, streams the
  body, and adds a test that ties that value to the API's upload ceiling.

## Goals / Non-Goals

**Goals:**

- Bounded memory for every upload: images ≤ 10 MiB may be buffered once;
  videos are never held whole.
- One portable verification implementation for both runtimes (Node parity is
  an architecture invariant), extending the existing pure-TypeScript inspector
  pattern.
- Range delivery good enough for `<video>` in every evergreen browser.
- Zero change for configurations, stored content and clients that do not opt
  into video.

**Non-Goals:**

- Admin UI changes (step C) and blocks/rendering (step B).
- Presigned direct-to-bucket uploads, resumable or multipart-to-bucket
  uploads, transcoding, codec checks, duration, poster extraction.
- `Cache-Control`/ETag for media responses.

## Decisions

### D1. Media kinds and limits are shared constants

`packages/application` exports `MEDIA_KINDS = ["image", "video"]`,
`IMAGE_MIME_TYPES` (the four current formats), `VIDEO_MIME_TYPES`
(`video/mp4`, `video/webm`), `ALLOWED_MEDIA_MIME_TYPES` (their union),
`mediaKindOf(mimeType)`, `MAX_IMAGE_BYTES = 10 MiB`,
`MAX_VIDEO_BYTES = 64 MiB`, `MAX_MEDIA_UPLOAD_BYTES = MAX_VIDEO_BYTES` and
`MAX_VIDEO_DIMENSION = 8192`. `MAX_MEDIA_BYTES` stays as a deprecated alias of
`MAX_IMAGE_BYTES` for one release because platform packages import it.
`packages/contracts` mirrors the MIME list in `mediaMimeTypeSchema` and adds
`mediaKindSchema`; `MediaMimeType` widens accordingly. The DTO keeps
`mimeType: string`, so public and SDK schemas need no change.

*Alternative:* a `kind` column on `media`. Rejected: derivable from the
verified MIME type, and it would need a migration on both dialects.

### D2. Upload transports: keep multipart, add a streamed binary body

`POST /api/v1/admin/media` dispatches on the request media type:

- `multipart/form-data` → today's path, unchanged parser cap of
  `MAX_IMAGE_BYTES`. The parsed chunks feed the same streamed creation with a
  declared length equal to their sum, so a small video also works here.
- `application/octet-stream` → `filename` query parameter (validated by
  Valibot, sanitized later by `sanitizeMediaFilename`), `Content-Length`
  parsed as a safe positive integer and checked against
  `MAX_MEDIA_UPLOAD_BYTES` before reading. The raw `ReadableStream` is adapted
  to `ByteStream` and handed to the use case.

Admin keeps sending multipart until step C switches it to the binary form
(XHR `send(file)` keeps upload progress).

*Alternatives:* (a) a streaming multipart parser — the pinned parser cannot,
and a hand-written one adds risk for no gain since we control the client;
(b) presigned PUT to R2/MinIO plus a finalize call — needs R2 S3 credentials
(the binding cannot presign), bucket CORS, an orphan sweeper, and
finalize-time verification via ranged reads. Better for >100 MB files, which
are out of scope; recorded as a future option.

### D3. One creation pipeline with a declared length

`MediaUseCases.create` becomes `create({ actor, body, declaredSize, filename })`
(the route always knows the size). Flow:

1. Reject `declaredSize` ≤ 0 or > `MAX_MEDIA_UPLOAD_BYTES` (`PAYLOAD_TOO_LARGE`).
2. Read leading bytes into a sniff buffer of up to 64 bytes (fewer if the
   declared size is smaller); `detectMediaMimeType` now also recognizes
   MP4 (`ftyp` at offset 4 with a non-image brand) and WebM/EBML
   (`1A 45 DF A3`). AVIF detection keeps precedence for
   `avif`/`avis` brands.
3. Image: reject `declaredSize > MAX_IMAGE_BYTES`, collect the rest
   (bounded), check the exact length, run `ImageInspector`, then
   `storage.put` with the buffer as today.
4. Video: create a `VideoContainerInspector` for the detected type and call
   `storage.put({ key, contentType, size: declaredSize, body })` where `body`
   is a pass-through generator that (re)yields the sniff buffer and each
   chunk, feeds the inspector, counts bytes and throws on overrun, inspector
   failure or early end. The adapter fails the write when the generator
   throws, so no object is created. After the put resolves the use case calls
   `inspector.finish()`; on failure it deletes the object (existing
   `cleanupAfterMetadataFailure`-style helper, operational error
   `MEDIA_OBJECT_CLEANUP_FAILED` if that fails) and throws the stable
   invalid-media error.
5. Metadata creation and its cleanup path stay exactly as today.

Errors thrown inside the body generator are domain errors; the adapters must
rethrow the original domain error rather than wrapping it as a storage failure
(adapters already distinguish their own errors; they will pass through
`DomainError`). This keeps "invalid media" (422) distinct from "storage
unavailable" (503).

### D4. Portable streaming video inspector

New `packages/application/src/video-container.ts`, pure TypeScript, exported
for both runtimes (Worker re-exports it the way it re-exports the image
inspector; Node uses it as is — no ffprobe dependency). Interface:
`push(chunk: Uint8Array): void`, `finish(): VideoDimensions`.

- **MP4:** a top-level box state machine reading 8/16-byte headers
  (`size==1` → 64-bit size, `size==0` → only valid as the last box and
  extends to the declared size). `ftyp` must be first, major brand not
  `qt  `, `avif`, `avis`, `heic`, `heix`, `mif1`, `msf1`, and the major or a
  compatible brand in {`isom`, `iso2`–`iso9`, `mp41`, `mp42`, `avc1`, `dash`,
  `M4V `, `mmp4`}. `mdat`, `free`, `skip`, `wide`, `uuid` and other top-level
  boxes are skipped by count without buffering. `moov` (exactly one, ≤ 16 MiB)
  is buffered and parsed: `trak` → `tkhd` (flags enabled bit, width/height in
  16.16, 3×3 matrix) and `mdia/hdlr` handler `vide`. The first enabled video
  track wins; matrices `(0,1,-1,0)`/`(0,-1,1,0)` swap axes. The box sizes must
  sum exactly to the declared size (no trailing bytes). At least one `mdat`.
- **WebM:** EBML variable-length IDs/sizes. EBML header (≤ 4 KiB) with
  `DocType` `webm`; then one `Segment` (known or unknown size). Inside, child
  elements are skipped by size except `Tracks` (≤ 1 MiB, buffered), which must
  appear before the first `Cluster`; the first `TrackEntry` with `TrackType`
  1 supplies `Video/PixelWidth` and `PixelHeight`. With an unknown-size
  segment, clusters may also have unknown size; the parser then stops
  structural walking after the first cluster and only counts bytes (the
  header and tracks are already verified). A known-size segment must end
  exactly at the declared size.
- Dimensions must be integers 1…`MAX_VIDEO_DIMENSION`.

Memory bound: the larger of the `moov` cap (16 MiB) or one chunk. Typical
`moov` for a one-minute 1080p clip is under 1 MiB.

*Alternative:* `ffprobe` on Node and a WASM probe on the Worker. Rejected:
breaks parity, adds a native dependency and a large WASM bundle.

### D5. Object storage port

```ts
interface PutObjectInput { body; contentType; key; size: number }
interface GetObjectOptions { range?: { offset: number; length: number } }
interface ObjectStorage { get(key, options?): Promise<ByteStream | null>; … }
```

- **R2:** `put` pipes the `ByteStream` into `new FixedLengthStream(size)` and
  passes the readable side to `bucket.put`; overrun/underrun error the
  stream so R2 stores nothing. `get` passes `{ range: { offset, length } }`.
  The structural `R2Bucket` type widens to accept `ReadableStream` and the
  range option. Images keep using a `Uint8Array` body (no behavior change).
- **MinIO:** `PutObjectCommand` with `Body` = Node `Readable.from(generator)`
  and `ContentLength: size`; an aborted body aborts the request so no object
  is committed (S3 single PUT is atomic). `get` sends
  `Range: bytes=offset-(offset+length-1)`.
- **Timeouts:** reads, deletes and buffered writes keep the total
  `timeoutMs`. Streamed writes use an idle watchdog reset on every chunk
  pulled; on expiry the adapter aborts and throws its sanitized error.
- The adapters' own `MAX_MEDIA_BYTES` checks become `size >
  MAX_MEDIA_UPLOAD_BYTES` plus exact-length enforcement.

### D6. Ranged binary responses

`readPublic`/`preview` accept an optional parsed range and return
`{ body, filename, mimeType, size, range? }` using the recorded `media.size`
(no `HEAD`). Range parsing lives in `packages/server` (`parseByteRange(header,
size)` → `full | partial(offset,length) | unsatisfiable`) because it is HTTP
syntax. Rules follow RFC 9110: single `bytes` range only; `If-Range` present
→ full response (no validator to compare); otherwise invalid → full.
`binaryResponse` adds `Accept-Ranges`, `Content-Length`, `Content-Range`,
`X-Content-Type-Options: nosniff` and sets status 200/206/416. The OpenAPI
route descriptions document `Range` and the three statuses.

### D7. `accept` on media fields and the save-time kind check

`packages/content`: `buildStringValueField("media", …)` allows `accept`;
normalization validates, sorts and drops `["image"]`. Metadata and
`isFieldMetadata` carry it. `collectFieldMedia` already yields the declaring
path; it will also yield the field's accepted kinds so the save path can
check them. In `content-use-cases.ts` the existing `loadMediaMany` result is
reused: a reference is valid when `active` **and** `mediaKindOf(mimeType)` is
in the field's accepted kinds (`$seo` → `["image"]`). The error is the same
`CONTENT_INVALID_STATE` "Media … is unavailable." family with a
kind-specific message.

Configuration evolution (`configuration-evolution.ts`): a media-field
difference whose old/new `accept` sets differ is `compatible` when the new set
is a superset, otherwise `breaking`. Block definitions keep their existing
`migration` classification.

*Alternative:* data-aware `validated` narrowing (scan stored references
joined to `media.mime_type`). Deferred: the snapshot scanner works on JSON
pages without media rows; adding a media lookup to the scan port is a
separate change.

### D8. Media list `kind`

`mediaListQuerySchema` gains `kind`; the use case validates `type ∈ kind`.
SQL: `kind=image` → `mime_type LIKE 'image/%'`, `kind=video` →
`mime_type LIKE 'video/%'` (both dialects; the `media(status, created_at)`
indexes still drive the order). The cursor fingerprint becomes
`["media", sort, kind, type, q]`; cursors issued before this change carry a
four-element fingerprint and are rejected as from a different query — they
are short-lived admin cursors, so this is acceptable.

### D9. VPS proxy value

`fix-vps-media-upload-limit` sets the media location's
`client_max_body_size` to the image ceiling plus a multipart allowance and
adds a test comparing it with the API constant. This change raises the API
ceiling to `MAX_MEDIA_UPLOAD_BYTES`, so that test fails until both
`nginx.conf` copies (repository and managed template) are raised to `70m`, and
the proxy timeouts are lengthened to `300s` for slow video uploads. The
template version bump and upgrade instruction follow the managed-file
process.

## Risks / Trade-offs

- [Worker invocation per ranged request makes video delivery cost more on
  Cloudflare] → documented; CDN caching (`Cache-Control`, ETag) is a backlog
  candidate. Typical portfolio clips are short loops.
- [An MP4 with `moov` at the end can only be verified after the object is
  written] → D3 deletes the object on late failure; the orphan exists only for
  the duration of one request, and cleanup failure is logged with the key.
- [Hand-written container parsers can accept malformed media] → strict size
  accounting, exact-end checks, fixture corpus (valid files from ffmpeg in
  several layouts plus truncated/mutated variants) and a fuzz-style mutation
  test in the unit suite.
- [A slow client keeps a Worker request open] → Worker HTTP requests have no
  wall-clock limit; the idle watchdog bounds stalled uploads.
- [Cloudflare plans other than Free/Pro allow larger bodies, VPS has none] →
  the 64 MiB limit is product-wide; configurable limits are out of scope.
- [HEVC MP4 does not play in every browser] → codec checks are out of scope;
  step B/C docs recommend H.264 MP4 or VP9/AV1 WebM.

## Migration Plan

No database migration. Deploy is backward compatible: old admin builds keep
using multipart. Rollback: redeploying the previous API leaves uploaded
`video/*` rows that the previous `toMediaView` rejects as an
unsupported MIME type, so media list reads would fail. Before rolling back,
delete those items (or keep the new API). Generated projects receive the
raised proxy value through the managed `deploy/nginx.conf` and a template
upgrade.
