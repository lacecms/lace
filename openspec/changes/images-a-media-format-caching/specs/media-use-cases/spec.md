## MODIFIED Requirements

### Requirement: Image upload accepts only verified bounded raster formats
The system SHALL accept uploads no larger than 10 MiB only when their binary
content is exactly one well-formed JPEG, PNG, GIF, WebP, or AVIF image. It SHALL
derive the MIME type from the validated binary format rather than a filename or
caller-supplied header; reject SVG, empty or truncated inputs, malformed image
containers, polyglot/trailing executable content, and every other MIME type.
It SHALL sanitize a display filename to a non-empty safe text value and generate
an opaque, unique storage key that does not disclose that filename. The system
SHALL reject an image wider or taller than 12,000 pixels or containing more
than 100,000,000 total pixels. Every accepted upload SHALL record a positive
integer width and height, measured after the image's embedded orientation is
applied, so the recorded dimensions are the dimensions at which the image is
displayed. A GIF's recorded dimensions SHALL be its logical screen width and
height; an animated GIF SHALL be accepted as one image without decoding its
frames.

#### Scenario: A valid verified image is accepted
- **WHEN** an authenticated writer uploads a complete 10 MiB-or-smaller JPEG,
  PNG, GIF, WebP, or AVIF whose decoded dimensions are within the configured limits
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
- **WHEN** an otherwise valid image exceeds the byte limit, either per-side
  dimension limit, or total pixel limit
- **THEN** the upload is rejected without storing an object or metadata row

#### Scenario: An animated GIF is accepted
- **WHEN** a writer uploads a complete 3 MiB animated GIF89a whose logical
  screen is 640 by 360 pixels
- **THEN** the created media has MIME type `image/gif`, width 640 and height
  360

#### Scenario: A GIF without its trailer is rejected
- **WHEN** a writer uploads GIF bytes whose final trailer byte is missing, or
  whose frame lies outside the logical screen
- **THEN** the upload is rejected with the stable invalid-media error and no
  object or metadata row exists
