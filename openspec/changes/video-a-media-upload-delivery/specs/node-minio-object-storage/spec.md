## MODIFIED Requirements

### Requirement: Node object operations retain bounded streaming semantics
The Node storage adapter SHALL stream object writes and reads through the
portable byte-stream boundary without retaining arbitrary object bodies in
memory. A write SHALL carry the exact byte length declared by the media use
case and SHALL fail without leaving an object under the key when the body
delivers fewer or more bytes than declared or the declared length exceeds the
largest portable media limit (64 MiB). A read MAY request one byte range by
offset and length, in which case only that range SHALL be requested from
MinIO. Every read, delete and buffered write SHALL have the configured bounded
timeout; a streamed write SHALL instead fail when no body bytes arrive, or
MinIO accepts none, for that timeout. Every operation SHALL fail without
returning a partial successful result when MinIO is absent, times out, or
reports an object-store error. A missing object read SHALL be distinguished
from a successful empty object and returned as absent.

#### Scenario: A verified object is streamed through storage
- **WHEN** an allowed media object is written and subsequently read through the
  Node storage capability
- **THEN** its byte stream and stored object length are preserved without
  exposing the bucket credentials or changing the opaque key

#### Scenario: A large video streams to MinIO
- **WHEN** a 60 MiB video is written with its declared length
- **THEN** MinIO receives a body of exactly that length and the adapter never
  holds the complete object in memory

#### Scenario: A byte range is read from MinIO
- **WHEN** the storage capability reads 1,000 bytes at offset 4,000
- **THEN** MinIO is asked for `bytes=4000-4999` and the stream yields those
  bytes

#### Scenario: A body disagrees with its declared length
- **WHEN** a write declares 1,000 bytes and supplies 999
- **THEN** the write fails with a sanitized storage failure and no object is
  stored under the key

#### Scenario: Object storage is unavailable
- **WHEN** an object write, read, or deletion exceeds its timeout or MinIO
  returns an infrastructure error
- **THEN** the caller receives a sanitized failure and no partial response body
  is represented as a successfully stored or retrieved object
