## MODIFIED Requirements

### Requirement: R2 storage preserves portable object semantics
The Cloudflare runtime SHALL store verified media objects in its configured R2
bucket through the native binding, without an S3 client. It SHALL write an
object under exactly the opaque key supplied by the media use case with the
verified content type and report the stored key, content type, and byte
length. A write SHALL carry the exact byte length declared by the media use
case, SHALL stream the body to R2 without assembling the complete object in
memory, and SHALL fail without leaving an object under the key when the body
delivers fewer or more bytes than declared or when the declared length exceeds
the largest portable media limit (64 MiB). A read SHALL stream the stored bytes
through the portable byte-stream boundary and MAY request one byte range by
offset and length, in which case only that range SHALL be read from R2. A
missing key SHALL be reported as absent and distinguished from a successful
empty object. Deleting a missing key SHALL succeed.

#### Scenario: A verified object round-trips through R2
- **WHEN** a media object is written and later read through the Cloudflare
  storage capability
- **THEN** its bytes, content type, key, and length are preserved and no bucket
  name or credential appears in the result

#### Scenario: A large video streams to R2
- **WHEN** a 60 MiB video is written with its declared length
- **THEN** the binding receives a stream of exactly that length and the
  adapter never holds the complete object in memory

#### Scenario: A byte range is read from R2
- **WHEN** the storage capability reads 1,000 bytes at offset 4,000 of a stored
  object
- **THEN** the binding is asked for exactly that range and the stream yields
  those 1,000 bytes

#### Scenario: A missing object is read
- **WHEN** the storage capability reads a key that has no R2 object
- **THEN** it returns absent rather than an empty stream or a failure

#### Scenario: An oversized body is written
- **WHEN** a write declares more than 64 MiB
- **THEN** the write fails with a sanitized storage failure and no object is
  stored under the key

#### Scenario: A body disagrees with its declared length
- **WHEN** a write declares 1,000 bytes and supplies 1,001
- **THEN** the write fails with a sanitized storage failure and no object is
  stored under the key

### Requirement: R2 failures are bounded and sanitized
Every R2 read, delete and buffered write SHALL complete within a bounded
timeout. A streamed write SHALL fail when no body bytes arrive, or R2 accepts
none, for the storage timeout, so a stalled upload cannot hold the request
indefinitely while a slow but progressing upload completes. A binding error or
timeout SHALL surface as one sanitized storage failure that contains no bucket
name, key-independent binding detail, or provider message, and SHALL never be
represented as a successfully stored or retrieved object.

#### Scenario: R2 is unavailable
- **WHEN** an R2 write, read, or delete throws or exceeds the storage timeout
- **THEN** the caller receives the sanitized storage failure and the media use
  case applies the same cleanup and error mapping as for MinIO

#### Scenario: A slow upload keeps progressing
- **WHEN** a streamed write receives a chunk at least once per storage timeout
  and takes four times the timeout in total
- **THEN** the write completes successfully

#### Scenario: An upload stalls
- **WHEN** a streamed write receives no bytes for longer than the storage
  timeout
- **THEN** it fails with the sanitized storage failure and no object remains

### Requirement: Worker image inspection matches the portable media policy
The Worker SHALL verify uploaded JPEG, PNG, GIF, WebP, and AVIF images without
a native image library. Inspection SHALL walk the complete container structure
of the declared format, reject a format mismatch, truncated or malformed
structure, missing dimensions, and any trailing bytes after the container's
end, and SHALL return the displayed dimensions after applying the image's
embedded orientation, so a 90- or 270-degree orientation swaps width and
height. A GIF SHALL be walked through its header, logical screen descriptor,
optional color tables, every extension and image block with its data
sub-blocks, and its trailer. Failures SHALL use the same stable invalid-media
error as the Node inspector. The Worker SHALL verify videos with the same
portable streaming video inspector as Node.

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

#### Scenario: The Worker verifies a video
- **WHEN** a valid WebM is uploaded to the Worker
- **THEN** it is accepted with the same MIME type and dimensions as on Node,
  and a truncated copy fails with the same stable invalid-media error
