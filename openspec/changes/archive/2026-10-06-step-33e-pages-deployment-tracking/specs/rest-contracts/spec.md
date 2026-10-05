## ADDED Requirements

### Requirement: Admin build DTOs expose tracking progress and reasons
Admin build history and detail DTOs SHALL accept optional `providerStage` as one of `queued`, `initialize`, `clone_repo`, `build`, or `deploy` and optional `providerCheckedAt` as an ISO timestamp, in shared runtime validation and generated OpenAPI. The closed `error` vocabulary SHALL include `provider_build_failed`, `provider_deploy_failed`, `provider_cancelled`, `provider_skipped`, `tracking_forbidden`, `tracking_not_found`, `tracking_rejected`, `tracking_timeout`, and `tracking_unconfigured`, none of which may carry `errorPath`. An unrecognized stored stage SHALL be omitted. Node and Worker SHALL return identical DTOs, and no DTO SHALL contain provider response data or credentials.

#### Scenario: Tracked build detail
- **WHEN** an authenticated reader requests a tracked build at the build stage
- **THEN** the DTO carries status `running`, its provider ID, `providerStage: "build"`, and `providerCheckedAt`

#### Scenario: Invalid stage
- **WHEN** a build DTO carries `providerStage: "upload"`
- **THEN** shared contract validation rejects it
