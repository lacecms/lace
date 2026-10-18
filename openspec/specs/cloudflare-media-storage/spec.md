# cloudflare-media-storage Specification

## Purpose
Defines how the Cloudflare Worker stores and verifies media through a native R2
binding and a runtime-neutral image inspector while preserving the media
semantics of the Node/MinIO deployment.

## Requirements

### Requirement: R2 storage preserves portable object semantics
The Cloudflare runtime SHALL store verified media objects in its configured R2
bucket through the native binding, without an S3 client. It SHALL write an
object under exactly the opaque key supplied by the media use case with the
verified content type, reject bodies larger than the portable media byte limit
before writing, and report the stored key, content type, and byte length. A read
SHALL stream the stored bytes through the portable byte-stream boundary; a
missing key SHALL be reported as absent and distinguished from a successful
empty object. Deleting a missing key SHALL succeed.

#### Scenario: A verified object round-trips through R2
- **WHEN** a media object is written and later read through the Cloudflare
  storage capability
- **THEN** its bytes, content type, key, and length are preserved and no bucket
  name or credential appears in the result

#### Scenario: A missing object is read
- **WHEN** the storage capability reads a key that has no R2 object
- **THEN** it returns absent rather than an empty stream or a failure

#### Scenario: An oversized body is written
- **WHEN** a write supplies more bytes than the portable media byte limit
- **THEN** the write fails with a sanitized storage failure and no object is
  stored under the key

### Requirement: R2 failures are bounded and sanitized
Every R2 operation SHALL complete within a bounded timeout. A binding error or
timeout SHALL surface as one sanitized storage failure that contains no bucket
name, key-independent binding detail, or provider message, and SHALL never be
represented as a successfully stored or retrieved object.

#### Scenario: R2 is unavailable
- **WHEN** an R2 write, read, or delete throws or exceeds the storage timeout
- **THEN** the caller receives the sanitized storage failure and the media use
  case applies the same cleanup and error mapping as for MinIO

### Requirement: Public media URLs match the Node deployment
The Cloudflare storage capability SHALL produce the same public read URL shape
as Node: the configured public base URL joined with
`api/v1/public/media/<media id>`, never a direct R2 or bucket URL.

#### Scenario: A published media URL is created
- **WHEN** a media item stored under `media/<id>` is exposed publicly
- **THEN** its URL is `<public base URL>api/v1/public/media/<id>` and is served
  by the Worker's public media endpoint

### Requirement: Worker image inspection matches the portable media policy
The Worker SHALL verify uploaded JPEG, PNG, GIF, WebP, and AVIF images without
a native image library. Inspection SHALL walk the complete container structure of
the declared format, reject a format mismatch, truncated or malformed structure,
missing dimensions, and any trailing bytes after the container's end, and SHALL
return the displayed dimensions after applying the image's embedded orientation,
so a 90- or 270-degree orientation swaps width and height. A GIF SHALL be
walked through its header, logical screen descriptor, optional color tables,
every extension and image block with its data sub-blocks, and its trailer.
Failures SHALL use the same stable invalid-media error as the Node inspector.

#### Scenario: A rotated JPEG is inspected
- **WHEN** a JPEG stored as 400×200 declares an EXIF orientation of 6
- **THEN** inspection reports a width of 200 and a height of 400

#### Scenario: A format mismatch is inspected
- **WHEN** PNG bytes are inspected as `image/jpeg`
- **THEN** inspection fails with the stable invalid-media error

#### Scenario: Trailing data follows a valid image
- **WHEN** otherwise valid image bytes are followed by extra bytes after the
  container end
- **THEN** inspection fails with the stable invalid-media error

#### Scenario: An animated GIF is inspected
- **WHEN** a GIF89a with a 320×240 logical screen, a global color table and
  three frames is inspected
- **THEN** inspection reports a width of 320 and a height of 240
