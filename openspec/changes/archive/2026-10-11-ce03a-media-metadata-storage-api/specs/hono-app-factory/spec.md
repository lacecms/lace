## ADDED Requirements

### Requirement: Media metadata HTTP route enforces write permission and precondition
The HTTP application SHALL expose authenticated
`PATCH /api/v1/admin/media/:mediaId`, requiring the media lifecycle write
permission, a strict JSON body and the media `If-Match` precondition defined by
the REST contract. It SHALL parse and validate the body and header before
calling the media metadata update use case, SHALL return `404` `NOT_FOUND` for
an unknown media ID, and SHALL return `200` with the update result and the new
`ETag` header. `GET /api/v1/admin/media/:mediaId` SHALL also return the item's
`ETag` header. Neither response SHALL expose a storage key.

#### Scenario: An editor updates metadata
- **WHEN** an editor patches an active item's alt text with its current tag
- **THEN** the route returns `200`, the updated DTO with the new alt text, the
  build outcome, and the new `ETag`

#### Scenario: A viewer cannot update metadata
- **WHEN** a viewer sends a valid metadata update
- **THEN** the route returns `403` `AUTHORIZATION_DENIED` and the item is
  unchanged

#### Scenario: The detail read returns the version tag
- **WHEN** a viewer reads media details
- **THEN** the response carries an `ETag` equal to the quoted Unix
  milliseconds of the DTO's `updatedAt`

#### Scenario: An unknown item is not found
- **WHEN** an editor patches a media ID that does not exist
- **THEN** the route returns `404` `NOT_FOUND`
