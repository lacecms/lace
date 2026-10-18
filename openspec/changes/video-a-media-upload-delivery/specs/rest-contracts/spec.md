## MODIFIED Requirements

### Requirement: Media transport preserves verified metadata and safe binary headers
The shared REST contract SHALL expose bounded media list and metadata responses
without storage keys, and define two upload request forms: a multipart upload
field named `file` with a non-empty filename, and a binary upload whose body is
the file, whose `filename` query parameter is a non-empty string of at most
255 characters, and whose `Content-Length` is required. Every media DTO SHALL
name its uploader as `createdBy` with an `id` and a non-empty `displayName`,
and SHALL carry `usageCount`, a non-negative integer counting the distinct
entries that use the item. Media created by upload, image or video, SHALL
carry positive integer `width` and `height` display dimensions. The transport
SHALL treat the verified binary format, not a caller-supplied `Content-Type`
or filename, as authoritative. Binary responses SHALL use the verified MIME
type, `X-Content-Type-Options: nosniff` and a safely encoded display filename;
no filename-derived value may create, split, or override an HTTP response
header. The generated OpenAPI document SHALL describe both upload forms and
the range behavior of binary responses.

#### Scenario: A claimed MIME type disagrees with bytes
- **WHEN** a multipart or binary upload declares an allowed MIME type but its
  bytes are another, unsafe, or malformed format
- **THEN** the API returns the stable validation envelope and creates neither
  an object nor a metadata record

#### Scenario: A hostile display filename is delivered
- **WHEN** valid media has a filename containing controls or header-like text
- **THEN** its binary response contains only safe media headers and no injected
  response header or unvalidated content type

#### Scenario: An uploaded item is described without raw user IDs alone
- **WHEN** an editor uploads a valid image
- **THEN** the created media DTO contains `createdBy` with the editor's ID and
  display name, `usageCount` 0, and the image's display width and height

#### Scenario: An uploaded video is described like an image
- **WHEN** an editor uploads a valid 1280 by 720 WebM through the binary form
- **THEN** the created media DTO has `mimeType` `video/webm`, `width` 1280,
  `height` 720 and the same fields as an image DTO

### Requirement: Admin media-list queries are validated and query-bound
The admin media-list route SHALL accept optional `q`, `kind`, `type`, `sort`,
`limit`, and `after` query parameters. `q` SHALL be trimmed; an empty result
SHALL mean no search, and a term longer than 200 characters SHALL be rejected.
A search SHALL match media whose display filename contains the term,
case-insensitively for ASCII letters, as a literal substring. `kind` SHALL be
`image` or `video` and SHALL restrict items to the MIME types of that kind.
`type` SHALL be one of `image/avif`, `image/jpeg`, `image/png`, `image/webp`,
`video/mp4`, or `video/webm` and SHALL restrict items to that MIME type; a
`type` outside the requested `kind` SHALL be rejected. `sort`
SHALL be one of `createdAt`, `-createdAt`, `filename`, `-filename`, `size`, or
`-size`. A leading `-` means descending, and the default SHALL be
`-createdAt`. Filename ordering SHALL be case-insensitive for ASCII letters.
Every order SHALL break ties by media ID in the same direction. An unsupported
kind, type or sort, an over-long term, or an invalid limit SHALL return the
stable `VALIDATION_FAILED` envelope with a JSON Pointer naming the parameter.
A continuation cursor SHALL be accepted only with the same search term, kind,
type, and sort that produced it; otherwise the request SHALL fail validation
without returning a page. The generated OpenAPI document SHALL describe these
parameters.

#### Scenario: Search, filter, and sort the library
- **WHEN** an editor requests `q=Cover&type=image/png&sort=-size`
- **THEN** the response contains only PNG items whose filename contains
  `cover` in any ASCII case, ordered from largest to smallest

#### Scenario: Filter by media kind
- **WHEN** an editor requests `kind=video`
- **THEN** the response contains only `video/mp4` and `video/webm` items

#### Scenario: The default order is newest first
- **WHEN** a client lists media without `sort`
- **THEN** items are ordered by creation time descending and then media ID
  descending

#### Scenario: Reject an unsupported media-list query
- **WHEN** a client requests `type=image/svg+xml`, `kind=audio`,
  `kind=video&type=image/png`, `sort=width`, or a 201-character `q`
- **THEN** the API returns `422` `VALIDATION_FAILED` with the pointer `/type`,
  `/kind`, `/type`, `/sort`, or `/q` and no list content

#### Scenario: Reject a media cursor from a different query
- **WHEN** a client reuses a cursor from a `sort=filename` page with
  `sort=-createdAt`, a different `kind`, a different `type`, or a different
  `q`
- **THEN** the API rejects the request with a validation failure instead of
  returning an inconsistent page
