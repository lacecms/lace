## MODIFIED Requirements

### Requirement: Build commands and trigger outcomes remain portable
The application SHALL expose actor-checked build request/retry commands and portable ports for claiming build work, recording trigger outcomes, and completing tracked provider deployments. Trigger outcomes SHALL distinguish proven synchronous success, untracked provider acceptance with an optional provider ID, tracked provider acceptance with a required provider ID, and failure, without exposing HTTP or database row types. Only proven success SHALL map to `succeeded`; untracked acceptance SHALL map to `accepted`; tracked acceptance SHALL keep the build `running`. The tracked completion port SHALL accept only `succeeded`, `failed`, `cancelled`, or `unknown`. Publication result and durable build-dispatch status SHALL remain independent.

#### Scenario: Publication trigger is unavailable
- **WHEN** publication commits and subsequent site-build triggering is unavailable
- **THEN** publication remains successful and its durable build event remains recoverable

#### Scenario: Runtime reports a synchronous trigger result
- **WHEN** a runtime trigger returns proven synchronous success
- **THEN** the application can persist a succeeded build without requiring a provider ID

#### Scenario: Runtime reports untracked acceptance
- **WHEN** a runtime trigger returns acceptance without tracking, with or without a provider ID
- **THEN** the application persists an `accepted` build and never a `succeeded` one
