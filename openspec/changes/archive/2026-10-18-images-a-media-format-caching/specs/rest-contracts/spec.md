## MODIFIED Requirements

### Requirement: Admin media-list queries are validated and query-bound
The admin media-list route SHALL accept optional `q`, `type`, `sort`, `limit`,
and `after` query parameters. `q` SHALL be trimmed; an empty result SHALL mean
no search, and a term longer than 200 characters SHALL be rejected. A search
SHALL match media whose display filename contains the term, case-insensitively
for ASCII letters, as a literal substring. `type` SHALL be one of `image/avif`,
`image/gif`, `image/jpeg`, `image/png`, or `image/webp` and SHALL restrict items to that
MIME type. `sort` SHALL be one of `createdAt`, `-createdAt`, `filename`,
`-filename`, `size`, or `-size`. A leading `-` means descending, and the
default SHALL be `-createdAt`. Filename ordering SHALL be case-insensitive for
ASCII letters. Every order SHALL break ties by media ID in the same direction.
An unsupported type or sort, an over-long term, or an invalid limit SHALL return
the stable `VALIDATION_FAILED` envelope with a JSON Pointer naming the
parameter. A continuation cursor SHALL be accepted only with the same search
term, type, and sort that produced it; otherwise the request SHALL fail
validation without returning a page. The generated OpenAPI document SHALL
describe these parameters.

#### Scenario: Search, filter, and sort the library
- **WHEN** an editor requests `q=Cover&type=image/png&sort=-size`
- **THEN** the response contains only PNG items whose filename contains
  `cover` in any ASCII case, ordered from largest to smallest

#### Scenario: The default order is newest first
- **WHEN** a client lists media without `sort`
- **THEN** items are ordered by creation time descending and then media ID
  descending

#### Scenario: Reject an unsupported media-list query
- **WHEN** a client requests `type=image/svg+xml`, `sort=width`, or a
  201-character `q`
- **THEN** the API returns `422` `VALIDATION_FAILED` with the pointer `/type`,
  `/sort`, or `/q` and no list content

#### Scenario: Reject a media cursor from a different query
- **WHEN** a client reuses a cursor from a `sort=filename` page with
  `sort=-createdAt`, a different `type`, or a different `q`
- **THEN** the API rejects the request with a validation failure instead of
  returning an inconsistent page

#### Scenario: Filter the library to GIF
- **WHEN** an editor requests `type=image/gif`
- **THEN** the response contains only GIF items
