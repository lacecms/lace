## ADDED Requirements

### Requirement: Media binary responses carry cache validators
Every successful response of `GET /api/v1/public/media/:mediaId` and
`GET /api/v1/admin/media/:mediaId/preview` SHALL carry a strong `ETag` that
identifies the immutable stored bytes of the item and therefore never changes
for that item, including when its descriptive metadata changes. The public
route SHALL send `Cache-Control: public, max-age=86400`; the admin preview
route SHALL send `Cache-Control: private, no-cache`. When a request's
`If-None-Match` lists that tag (weak comparison, or `*`), the route SHALL
answer `304 Not Modified` with the same `ETag` and `Cache-Control` and no body,
without reading object storage. A malformed `If-None-Match` SHALL be ignored
and the complete response returned. Authorization, eligibility and not-found
behavior SHALL be decided before any conditional evaluation, so media that is
unpublished, deleting, deleted or not visible to the caller never receives
`304`.

#### Scenario: A browser revalidates a published image
- **WHEN** a client that received published media with `ETag` `T` requests it
  again with `If-None-Match: T`
- **THEN** the response is `304` with `ETag` `T`, `Cache-Control: public,
  max-age=86400`, no body, and object storage is not read

#### Scenario: Metadata edits keep the binary tag
- **WHEN** a writer changes the alt text of published media and a client then
  requests its binary
- **THEN** the binary response carries the same `ETag` as before the edit

#### Scenario: An unpublished image is revalidated
- **WHEN** a client sends `If-None-Match` with the tag of media that no current
  publication uses any more
- **THEN** the response is the public not-found response, not `304`

#### Scenario: Admin preview revalidates privately
- **WHEN** an authenticated viewer requests a preview with a matching
  `If-None-Match`
- **THEN** the response is `304` with `Cache-Control: private, no-cache`,
  while an anonymous request with the same header receives the authentication
  failure

#### Scenario: A malformed validator is ignored
- **WHEN** a client sends `If-None-Match: not-a-tag` for published media
- **THEN** the response is `200` with the complete body and cache headers
