## ADDED Requirements

### Requirement: Admin build failure DTOs expose closed reasons and safe entry paths
Admin build history and detail SHALL retain optional `error` as a closed failure reason under the site-build diagnostic vocabulary and SHALL add optional `errorPath` carrying only a source-relative entry under the builder diagnostic path contract. `errorPath` SHALL be absent unless `error` is a source reason. Shared runtime validation and generated OpenAPI SHALL describe the same constraints. Existing build IDs, lifecycle, reason, target version, requester and timestamps SHALL retain their shapes. No failure diagnostic SHALL include raw provider responses, commands, credentials, output, configured roots or absolute paths. Node and Worker SHALL use identical DTOs. Anonymous reads SHALL remain denied; admin, editor and viewer SHALL retain read access without configuration authority.

#### Scenario: Source failure in list and detail
- **WHEN** an authenticated reader requests history and detail for a failed or retrying source build
- **THEN** both return the persisted specific `error` and safe optional `errorPath` with the same build ID

#### Scenario: Existing reason-only record
- **WHEN** a stored build has a recognized error without a path
- **THEN** its DTO remains valid with `error` and no `errorPath`

#### Scenario: Invalid diagnostic payload
- **WHEN** a build DTO contains an unknown error, unsafe path, orphaned path, or a path attached to `install_failed`
- **THEN** shared contract validation rejects it

#### Scenario: Anonymous request
- **WHEN** an anonymous client requests build history or detail
- **THEN** the API returns the existing authentication error without diagnostic data
