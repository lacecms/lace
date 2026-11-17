## MODIFIED Requirements

### Requirement: Local security verification is reproducible and fails closed
One documented command SHALL run required Node/SQLite/SILO and local Worker/D1/R2 security and resilience phases using isolated owned state and controlled provider/proxy responses. It SHALL report each required scenario, reject failed, skipped, empty or unavailable phases, and clean owned processes/containers/state on success, failure and interruption. It SHALL NOT delete ordinary development data, use infrastructure credentials or mutate a remote installation. Dependency metadata access SHALL be explicitly distinguished from infrastructure access.

#### Scenario: Required local phase cannot execute
- **WHEN** a runtime, local service or required test is unavailable or skipped
- **THEN** verification records failed or incomplete status and subsequent unexecuted phases remain not-run
