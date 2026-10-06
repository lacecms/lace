## ADDED Requirements

### Requirement: Builds detail shows provider tracking progress
The Builds detail view SHALL show the provider stage in human-readable form and the last successful check time when present, SHALL refresh while the selected build is `pending` or `running`, and SHALL show fixed explanation and next action text for each tracking reason: Pages build or deploy failure, cancellation, skip, missing Pages Read permission, deployment not found, rejected request, tracking timeout (naming the timeout setting), and tracking not configured. Reasons for `cancelled` and `unknown` builds SHALL be presented as guidance rather than as a failure, and no text SHALL claim publication for any status other than `succeeded`.

#### Scenario: Running tracked build
- **WHEN** an administrator views a `running` build at Pages stage `deploy`
- **THEN** the detail shows the provider ID, stage "Deploy", the last check time, and updates when the build finishes

#### Scenario: Unknown after timeout
- **WHEN** a user views an `unknown` build with `tracking_timeout`
- **THEN** the detail explains that tracking stopped at the deadline, tells them to check the deployment in Pages and retry or raise the timeout, and an administrator sees the retry action
