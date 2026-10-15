## MODIFIED Requirements

### Requirement: Build export supports version-derived conditional reads
The system SHALL derive every build-export page's ETag from the
published-state version of that page. On a first-page request (no `after`)
with a matching `If-None-Match` value, it SHALL return `304 Not Modified`
with the ETag and SHALL NOT load export content. On a first-page request with
a missing or non-matching value, it SHALL return the validated first page and
its version-derived ETag. A continuation request (`after` present) SHALL
ignore `If-None-Match` and SHALL return the validated continuation page or the
version-changed error. A malformed conditional tag SHALL be rejected as a
shared validation error on every page request.

Both Node and Worker composition roots SHALL accept strong and weak
version-derived `If-None-Match` values and compare their encoded versions.
The origin SHALL return a strong current ETag on `200` and `304`.
Authorization SHALL be checked before a conditional response and before any
page read. A `200` ETag SHALL encode the version of the returned page,
including when a publication happens after the initial version lookup.

#### Scenario: A build consumer already has the current export
- **WHEN** a first-page request's `If-None-Match` encodes the current
  published-state version
- **THEN** the build-export endpoint returns `304` without loading export
  content

#### Scenario: Publication has advanced the version
- **WHEN** a first-page request's `If-None-Match` encodes an older valid
  version
- **THEN** the endpoint loads and returns the current first page with the new
  ETag

#### Scenario: Weak conditional read skips export loading
- **WHEN** an authorized consumer sends a weak tag encoding the current
  version on a first-page request
- **THEN** each runtime returns an empty `304` without loading the export

#### Scenario: A publication follows a weak conditional read
- **WHEN** a consumer received `304` for a weak tag and another publication
  advances the version
- **THEN** its next first-page read with that tag returns `200`, the new
  published content and its new strong version tag

#### Scenario: A continuation page ignores the conditional header
- **WHEN** a continuation request with a valid cursor for the current version
  also carries `If-None-Match` for that version
- **THEN** the endpoint returns `200` with the continuation page and its
  version ETag

#### Scenario: A conditional read lacks authorization
- **WHEN** a caller without a valid build credential supplies the current weak
  tag
- **THEN** the protected export denies access rather than returning `304`
