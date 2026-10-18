## MODIFIED Requirements

### Requirement: Image upload accepts only verified bounded raster formats
The system SHALL accept an image upload no larger than 10 MiB only when its
binary content is exactly one well-formed JPEG, PNG, WebP, or AVIF image.
It SHALL derive the MIME type from the validated binary format rather than a
filename or caller-supplied header; reject SVG, empty or truncated inputs,
malformed image containers, polyglot/trailing executable content, and every
MIME type that is neither an allowed image format nor an allowed video format.
It SHALL sanitize a display filename to a non-empty safe text value and
generate an opaque, unique storage key that does not disclose that filename.
The system SHALL reject an image wider or taller than 12,000 pixels or
containing more than 100,000,000 total pixels. Every accepted upload SHALL
record a positive integer width and height, measured after the image's
embedded orientation is applied, so the recorded dimensions are the dimensions
at which the image is displayed.

#### Scenario: A valid verified image is accepted
- **WHEN** an authenticated writer uploads a complete 10 MiB-or-smaller JPEG,
  PNG, WebP, or AVIF whose decoded dimensions are within the configured
  limits
- **THEN** the upload is accepted with the binary-derived MIME type, sanitized
  display filename, opaque storage key, and recorded image dimensions

#### Scenario: A rotated photo records display dimensions
- **WHEN** a writer uploads a JPEG whose stored pixels are 400 wide and 200
  high and whose EXIF orientation rotates it by 90 degrees
- **THEN** the created media records width 200 and height 400

#### Scenario: Filename or MIME spoofing cannot bypass validation
- **WHEN** an upload claims an allowed MIME type or extension but its bytes are
  SVG, another format, malformed, empty, truncated, or polyglot content
- **THEN** the upload is rejected before object storage or metadata persistence

#### Scenario: An oversized image is rejected
- **WHEN** an otherwise valid image exceeds the 10 MiB byte limit, either
  per-side dimension limit, or total pixel limit
- **THEN** the upload is rejected without storing an object or metadata row

### Requirement: Authorized binary reads preserve media lifecycle boundaries
The system SHALL resolve a media binary only after the caller has selected an
active metadata record through an authorized admin read or a published-media
read. The binary-read result SHALL retain the verified media MIME type, the
recorded total byte size, and a bounded byte stream while never exposing the
storage key, bucket identity, or storage credentials. A read MAY request one
byte range given as a first byte offset and a length; the system SHALL read
only that range from object storage when the range lies within the recorded
size, SHALL report the served range with the total size, and SHALL refuse a
range that starts at or beyond the recorded size as unsatisfiable without
reading the object. A missing stored object for otherwise eligible metadata
SHALL be an operational failure, not an empty successful media result.

#### Scenario: An eligible media item is read
- **WHEN** an authorized caller requests the binary for active media selected by
  the applicable metadata boundary
- **THEN** the system returns its verified MIME type, total size and object
  stream without revealing its internal object location

#### Scenario: A byte range of a video is read
- **WHEN** a caller reads bytes 1,000 through 1,999 of active published media
  whose recorded size is 5,000 bytes
- **THEN** the result streams exactly those 1,000 bytes and reports the range
  1,000–1,999 of a total of 5,000

#### Scenario: An unsatisfiable range is requested
- **WHEN** a caller requests a range starting at byte 5,000 of media whose
  recorded size is 5,000 bytes
- **THEN** the read reports the range as unsatisfiable with the total size and
  does not read object storage

#### Scenario: Metadata and object storage disagree
- **WHEN** eligible active media has no corresponding object in storage
- **THEN** the binary read fails as an operational error and does not return an
  empty object as though it were the uploaded media

## ADDED Requirements

### Requirement: Video upload accepts only verified bounded MP4 and WebM containers
The system SHALL accept a video upload no larger than 64 MiB only when its
binary content is exactly one well-formed MP4 (ISO base media file) or WebM
container with at least one video track, and SHALL record the MIME type
`video/mp4` or `video/webm` derived from the bytes. An MP4 SHALL begin with a
`ftyp` box whose major or compatible brands include an ISO, MP4, AVC or DASH
brand and whose major brand is neither QuickTime (`qt  `) nor an image brand;
its top-level boxes SHALL be well-sized and SHALL end exactly at the end of
the input; it SHALL contain exactly one `moov` box of at most 16 MiB and at
least one `mdat` box, in either order. A WebM SHALL begin with an EBML header
whose document type is `webm`, followed by one segment whose track list
precedes its first cluster; a segment with a declared size SHALL end exactly
at the end of the input, and an unknown-size segment SHALL be accepted. The
system SHALL reject QuickTime, Matroska that is not WebM, audio-only, empty,
truncated, malformed and trailing content. Every accepted video SHALL record
the positive integer displayed width and height of its first enabled video
track; an MP4 track whose transformation matrix rotates it by 90 or 270
degrees SHALL record swapped dimensions. A video wider or taller than 8,192
pixels SHALL be rejected. Videos SHALL use the same sanitized filename, opaque
storage key, metadata, usage, deletion and descriptive-metadata lifecycle as
images. Codecs SHALL NOT be inspected.

#### Scenario: A valid MP4 is accepted
- **WHEN** a writer uploads a complete 40 MiB MP4 whose `moov` follows its
  `mdat` and whose video track is 1920 by 1080
- **THEN** the created media has MIME type `video/mp4`, width 1920, height
  1080 and the uploaded byte size

#### Scenario: A rotated phone video records display dimensions
- **WHEN** a writer uploads an MP4 whose video track is 1920 by 1080 with a
  90-degree rotation matrix
- **THEN** the created media records width 1080 and height 1920

#### Scenario: A WebM from a screen recorder is accepted
- **WHEN** a writer uploads a WebM whose segment has an unknown size and whose
  track list declares a 1280 by 720 video track before the first cluster
- **THEN** the created media has MIME type `video/webm`, width 1280 and height
  720

#### Scenario: A QuickTime movie is rejected
- **WHEN** a writer uploads a `.mov` file whose `ftyp` major brand is `qt  `
- **THEN** the upload is rejected with the stable invalid-media error and no
  object or metadata row exists

#### Scenario: An audio-only MP4 is rejected
- **WHEN** a writer uploads an MP4 whose only track has the `soun` handler
- **THEN** the upload is rejected with the stable invalid-media error

#### Scenario: An oversized video is rejected
- **WHEN** an otherwise valid MP4 is larger than 64 MiB or its video track is
  8,193 pixels wide
- **THEN** the upload is rejected without leaving an object or metadata row

#### Scenario: A video larger than the image limit is accepted
- **WHEN** a writer uploads a valid 20 MiB WebM
- **THEN** it is accepted, while a valid 20 MiB PNG is rejected for exceeding
  the 10 MiB image limit

### Requirement: Streamed media creation enforces a declared length
The system SHALL support creating media from a byte stream whose exact length
the caller declares before the first byte. It SHALL refuse, before reading the
stream, a declared length of zero or above the 64 MiB video limit. It SHALL
identify the format from the leading bytes and SHALL refuse an image whose
declared length exceeds the 10 MiB image limit before storing anything. An
image SHALL be verified completely before its object is written. A video SHALL
be written to object storage as it arrives, with no more than one bounded
inspection window held in memory, while it is verified; a verification
failure, a stream that delivers fewer or more bytes than declared, or a
storage failure SHALL leave neither active metadata nor a stored object. When
verification fails only after the object write completed, the system SHALL
delete that object before reporting the failure and SHALL record an
operational error naming the opaque storage key if deletion fails. The
existing object-then-metadata ordering and metadata-failure cleanup SHALL
apply unchanged.

#### Scenario: A streamed video is created without buffering
- **WHEN** a writer streams a valid 60 MiB MP4 with a declared length of
  62,914,560 bytes
- **THEN** the object is written while bytes arrive, active metadata is
  created afterwards, and the process never holds the complete file in memory

#### Scenario: The declared length exceeds the video limit
- **WHEN** a caller declares a length of 70 MiB
- **THEN** creation is refused as too large before any byte is read or stored

#### Scenario: The stream ends early
- **WHEN** a caller declares 10,000,000 bytes and the stream ends after
  9,000,000
- **THEN** creation fails, no object remains under the generated key and no
  metadata exists

#### Scenario: A video fails verification after storage
- **WHEN** the final bytes of a streamed MP4 reveal that it has no `moov` box
  after the object write completed
- **THEN** the object is deleted, the stable invalid-media error is returned,
  and no metadata exists
