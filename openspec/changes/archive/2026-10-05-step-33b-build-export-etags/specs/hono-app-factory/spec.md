## MODIFIED Requirements

### Requirement: Build export supports version-derived conditional reads
The system SHALL derive the build-export ETag from the current published-state
version. On a matching `If-None-Match` value, it SHALL return `304 Not
Modified` with the ETag and SHALL not load the complete export. On a missing or
non-matching value, it SHALL return the validated build-export representation
and its version-derived ETag. A malformed conditional tag SHALL be rejected as
a shared validation error.

Both Node and Worker composition roots SHALL accept strong and weak version-derived `If-None-Match` values and compare their encoded versions. The origin SHALL return a strong current ETag on both `200` and `304`. Authorization SHALL be checked before a conditional response, and a `200` ETag SHALL encode the version of the returned export, including if publication occurs after the initial version lookup.

#### Scenario: A build consumer already has the current export
- **WHEN** `If-None-Match` encodes the current published-state version
- **THEN** the build-export endpoint returns `304` without loading the full
  export payload

#### Scenario: Publication has advanced the version
- **WHEN** `If-None-Match` encodes an older valid version
- **THEN** the endpoint loads and returns the current export with the new ETag

#### Scenario: Weak conditional read skips export loading
- **WHEN** an authorized consumer sends a weak tag encoding the current version
- **THEN** each runtime returns an empty `304` without loading the export

#### Scenario: A publication follows a weak conditional read
- **WHEN** a consumer received `304` for a weak tag and another publication advances the version
- **THEN** its next read with that tag returns `200`, the new published content and its new strong version tag

#### Scenario: A conditional read lacks authorization
- **WHEN** a caller without a valid build credential supplies the current weak tag
- **THEN** the protected export denies access rather than returning `304`

