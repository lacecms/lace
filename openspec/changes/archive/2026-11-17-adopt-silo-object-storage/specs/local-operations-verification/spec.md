## MODIFIED Requirements

### Requirement: Operations verification is reproducible and isolated
One documented local command SHALL verify Node/SQLite/SILO and local Worker/D1/R2 operations using isolated owned state and controlled external-provider responses. Required phases SHALL include documented setup paths, health/readiness and structured logs, coordinated backup/restore, forward migration/upgrade preservation, credential rotation and build recovery. Results SHALL identify each required phase and fail completion on failed, skipped, unavailable or empty required phases; phases not executed SHALL remain not-run. Success, failure and interruption SHALL clean owned processes and temporary runtime resources without deleting normal development state, retained evidence or user files. The command SHALL NOT select remote resources, require production secrets or perform registry publication.

#### Scenario: Required local service is unavailable
- **WHEN** Docker, local Worker execution or another required prerequisite is unavailable
- **THEN** verification exits unsuccessfully with incomplete evidence rather than marking the phase passed

#### Scenario: Two drills or an interruption occur
- **WHEN** isolated verification runs concurrently or is interrupted
- **THEN** resource ownership prevents collisions and cleanup affects only resources owned by that run

### Requirement: Coordinated restore drills compare metadata and objects
Local SQLite/SILO and local D1/R2 backup/restore drills SHALL establish a quiescent consistency point by stopping writes, builders, scheduled/background dispatch and asynchronous deletion and settling in-flight work. Backups SHALL include SQL state, required object bytes and project/configuration/ownership metadata. SQLite backup SHALL be WAL-safe; copying only a live main database file SHALL NOT count as a backup. Each drill SHALL restore to separate isolated state with matching engine/migrations, reconstruct private settings separately and avoid original deploy hooks. Verification SHALL compare account roles/statuses, draft and published snapshots, block order, media metadata/references and object byte hashes; then sign in and rebuild static output from the restored published data. Evidence SHALL record duration, snapshot point, consistency caveats and original-installation resumption. Local D1/R2 persistence/export mechanisms SHALL be labelled simulator-specific and SHALL NOT be represented as proof of remote backup tooling.

#### Scenario: Complete coordinated backup is restored
- **WHEN** a quiescent SQLite/SILO or local D1/R2 backup is restored into separate state
- **THEN** comparison, sign-in, media delivery and static rebuild match the recorded backup without affecting the original installation

#### Scenario: Required object is missing or differs
- **WHEN** SQL restore succeeds but a referenced object is missing or has different bytes
- **THEN** restore verification fails instead of reporting database success as complete recovery
