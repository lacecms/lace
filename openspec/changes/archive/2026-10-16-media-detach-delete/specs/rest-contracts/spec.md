## ADDED Requirements

### Requirement: Admin media deletion accepts a draft detach option
`DELETE /api/v1/admin/media/:mediaId` SHALL accept an optional `detach` query
parameter whose only valid value is `drafts`. Any other value, or a repeated
parameter, SHALL fail with `422` `VALIDATION_FAILED` at the issue path
`/detach` before any read. With `detach=drafts` the route SHALL request
deletion with the draft detach option; without the parameter it SHALL request
an ordinary deletion. Both forms SHALL answer an accepted request with `202`
and the media DTO, and SHALL report refusals with the existing stable error
pairs (`MEDIA_IN_USE` and `CONTENT_REVISION_CONFLICT` as `409`,
`AUTHORIZATION_DENIED` as `403`, `CONTENT_INVALID_STATE` as `422`). The
OpenAPI document SHALL describe the parameter.

#### Scenario: A detaching deletion is accepted
- **WHEN** an editor sends `DELETE /api/v1/admin/media/:mediaId?detach=drafts`
  for an image used only by drafts
- **THEN** the API returns `202` with the media DTO in status `deleting` and
  `usageCount` 0

#### Scenario: An unsupported detach value is rejected
- **WHEN** a client sends `detach=all`
- **THEN** the API returns `422` `VALIDATION_FAILED` with the issue path
  `/detach` and no draft or media changes
