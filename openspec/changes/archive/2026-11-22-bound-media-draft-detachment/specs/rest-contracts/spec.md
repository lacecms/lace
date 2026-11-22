## MODIFIED Requirements

### Requirement: Admin media deletion accepts a draft detach option

`DELETE /api/v1/admin/media/:mediaId` without detach SHALL keep ordinary deletion. With `detach=drafts` it SHALL support the following session-authenticated requests, each requiring both write permissions. Responses SHALL be validated against the published OpenAPI schemas.

| Query in addition to `detach=drafts` | Success | Meaning |
| --- | --- | --- |
| None | `200 {state:"drafts", drafts:[{entryId, expectedRevision}]}` for 1–50 distinct entries, or `202` with the deleting media DTO for zero uses | Admit the current set or queue an unused item |
| `step=entry&entryId=…&expectedRevision=…` | `200 {state:"entry-complete", entryId}` | The specified draft no longer uses this active item |
| `step=finish` | `202` with the deleting media DTO and `usageCount: 0` | The guarded deletion event committed |

Only `drafts` SHALL be valid for `detach`. Repeated protocol parameters, unsupported values, nonpositive or unsafe integer revisions, missing required entry arguments and illegal combinations (including step arguments without detach) SHALL return `422 VALIDATION_FAILED` at the offending or missing query field before application reads or writes. Existing session, origin and error contracts SHALL apply. Published usage, excess usage or any use at finish SHALL return `409 MEDIA_IN_USE`. A stale revision of a still-using eligible draft SHALL return `409 CONTENT_REVISION_CONFLICT`, a denied permission `403 AUTHORIZATION_DENIED`, and missing or inactive media `422 CONTENT_INVALID_STATE`. A progress response SHALL never imply a queued deletion.

#### Scenario: A detaching deletion is accepted
- **WHEN** an editor requests detaching deletion for two draft-only entries, follows both returned entry steps and sends finish
- **THEN** the API returns a two-entry plan, two matching acknowledgments, then the existing `202` media DTO with status `deleting` and zero usage

#### Scenario: An unsupported detach value is rejected
- **WHEN** a client sends `detach=all` or repeats `detach`
- **THEN** the API returns `422 VALIDATION_FAILED` at `/detach` before application reads or writes

#### Scenario: An incomplete step cannot become an ordinary deletion
- **WHEN** a client sends `step=entry` without detach, or omits the expected revision from an entry step
- **THEN** the request fails validation and leaves media, drafts and outbox untouched

#### Scenario: Permissions expire between requests
- **WHEN** an admitted editor loses a required permission before an entry or finish request
- **THEN** that request returns the authorization refusal before accessing content or registering deletion work
