## ADDED Requirements

### Requirement: Admin build DTOs expose the seven-status lifecycle
Admin build history and detail DTOs SHALL validate `status` as exactly one of `pending`, `running`, `accepted`, `succeeded`, `failed`, `cancelled`, or `unknown`, in shared runtime validation and in generated OpenAPI. All other build fields, the 33C `error`/`errorPath` rules, and authorization SHALL be unchanged. Node and Worker SHALL return identical DTOs for identical persisted builds.

#### Scenario: New statuses are readable
- **WHEN** an authenticated reader requests history containing `accepted`, `cancelled`, and `unknown` builds
- **THEN** each DTO validates and carries its status, provider ID when present, and completion time

#### Scenario: Unsupported status
- **WHEN** a build DTO carries a status outside the seven values
- **THEN** shared contract validation rejects it
