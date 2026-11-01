# local-operations-verification Specification

## Purpose
Defines reproducible account-free operations verification, coordinated restore evidence and traceable owner handoff for the locally verified Lace MVP.

## Requirements

### Requirement: Operations verification is reproducible and isolated
One documented local command SHALL verify Node/SQLite/MinIO and local Worker/D1/R2 operations using isolated owned state and controlled external-provider responses. Required phases SHALL include documented setup paths, health/readiness and structured logs, coordinated backup/restore, forward migration/upgrade preservation, credential rotation and build recovery. Results SHALL identify each required phase and fail completion on failed, skipped, unavailable or empty required phases; phases not executed SHALL remain not-run. Success, failure and interruption SHALL clean owned processes and temporary runtime resources without deleting normal development state, retained evidence or user files. The command SHALL NOT select remote resources, require production secrets or perform registry publication.

#### Scenario: Required local service is unavailable
- **WHEN** Docker, local Worker execution or another required prerequisite is unavailable
- **THEN** verification exits unsuccessfully with incomplete evidence rather than marking the phase passed

#### Scenario: Two drills or an interruption occur
- **WHEN** isolated verification runs concurrently or is interrupted
- **THEN** resource ownership prevents collisions and cleanup affects only resources owned by that run

### Requirement: Operations guides state verified commands and their limits
Delivered generated guides and repository references SHALL cover local development, generated projects, VPS deployment, Cloudflare deployment, coordinated backup/restore, forward migrations, key rotation, build recovery and troubleshooting. Account-free command paths SHALL be executed locally. Remote-only procedures SHALL be clearly labelled owner-operated and linked to the owner plan and Cloudflare handoff. The operator checklist SHALL identify how to inspect engine release, installed migrations, configuration hash/sync state, object access and latest build, distinguishing direct observations from inferred or unverified conditions. Health/readiness and doctor SHALL NOT be presented as proof of storage availability, configuration synchronization, build-token authorization or deployment success.

#### Scenario: Installation is ready but static build failed
- **WHEN** migration/database readiness passes while storage or build verification has not passed
- **THEN** the checklist records those independent checks separately without declaring the full installation healthy

### Requirement: Health and logs have attributable local evidence
Both runtime paths SHALL locally verify liveness and readiness separately, including a failed database/migration readiness condition, and document their actual response codes and safe configuration-failure behavior. Request completion evidence SHALL verify request identifier, method/path, status, duration and actor identifier where resolved; operational build/dispatch evidence SHALL identify safe correlation fields and sanitized reasons actually emitted. The documentation SHALL distinguish current fields from desired fields, and SHALL NOT claim absent mutation identifiers are logged. Captured evidence SHALL exclude credentials, raw bodies, private connection settings and raw provider/SQL/exception data.

#### Scenario: Readiness fails
- **WHEN** an initialized runtime cannot confirm required database/migration state
- **THEN** readiness returns not-ready while process liveness remains independently observable, with documented startup-validation exceptions

#### Scenario: Authenticated request completes
- **WHEN** a local authenticated operation completes or fails
- **THEN** evidence correlates its response request ID with the structured completion record and validates safe fields without credential disclosure

### Requirement: Coordinated restore drills compare metadata and objects
Local SQLite/MinIO and local D1/R2 backup/restore drills SHALL establish a quiescent consistency point by stopping writes, builders, scheduled/background dispatch and asynchronous deletion and settling in-flight work. Backups SHALL include SQL state, required object bytes and project/configuration/ownership metadata. SQLite backup SHALL be WAL-safe; copying only a live main database file SHALL NOT count as a backup. Each drill SHALL restore to separate isolated state with matching engine/migrations, reconstruct private settings separately and avoid original deploy hooks. Verification SHALL compare account roles/statuses, draft and published snapshots, block order, media metadata/references and object byte hashes; then sign in and rebuild static output from the restored published data. Evidence SHALL record duration, snapshot point, consistency caveats and original-installation resumption. Local D1/R2 persistence/export mechanisms SHALL be labelled simulator-specific and SHALL NOT be represented as proof of remote backup tooling.

#### Scenario: Complete coordinated backup is restored
- **WHEN** a quiescent SQLite/MinIO or local D1/R2 backup is restored into separate state
- **THEN** comparison, sign-in, media delivery and static rebuild match the recorded backup without affecting the original installation

#### Scenario: Required object is missing or differs
- **WHEN** SQL restore succeeds but a referenced object is missing or has different bytes
- **THEN** restore verification fails instead of reporting database success as complete recovery

### Requirement: Rotation and recovery procedures have local evidence
Local operations verification SHALL exercise build-token replacement/revocation, authentication-secret rotation, and Node builder/storage credentials using disposable installations. Old credentials SHALL fail at their applicable boundary after rotation, replacement credentials SHALL work, and session invalidation consequences SHALL be documented and verified. Provider/hook-token rotation SHALL use controlled local endpoints and SHALL remain distinct from owner verification of real credentials. Forward migrations and filesystem upgrade/rollback procedures SHALL retain their existing supported boundaries and preserve user-owned source. Corrected publication/build retries SHALL preserve the last successful static release until successful replacement.

#### Scenario: Build token is replaced
- **WHEN** a replacement token is configured and the previous token revoked
- **THEN** old-token export is denied, replacement-token export succeeds and static rebuilding recovers

#### Scenario: Authentication secret is rotated
- **WHEN** an isolated installation restarts with a replacement authentication secret
- **THEN** pre-rotation sessions are rejected, fresh sign-in succeeds and content remains intact

### Requirement: Traceability and candidate identity control completion claims
One maintained verification document SHALL map every Included item in architecture §3 and security requirements in §14 to the concrete tests, runners, acceptance stages and guides that cover it, with explicit gaps and owner-check references for external checks. Each verification run SHALL record source identity, tool versions, commands, phase results and, when artifacts are used, the exact artifact checksums/image identities in its own result directory rather than in the maintained document. Shipped code or managed-template changes SHALL require a coherent clean-source candidate and exact-artifact acceptance on clean generated Node and Cloudflare-local consumers, including the starter and independent user-owned Astro ownership cases. Historical run records SHALL NOT be kept in the repository; the archived release changes hold each release's readiness evidence. Local checks SHALL NOT close remote deployment, remote capacity, remote restore, publication or stable-release approval, which remain pending until their own evidence exists.

#### Scenario: Source changes after the previous candidate
- **WHEN** version display or guide changes pass workspace checks but packed artifacts predate them
- **THEN** candidate acceptance stays pending until refreshed artifacts pass the required exact-artifact journeys

#### Scenario: Roadmap local acceptance completes
- **WHEN** all required local phases pass and every §3 and §14 item has a row in the verification document
- **THEN** local completion is recorded while unperformed external checks retain pending status

#### Scenario: Coverage row loses its evidence
- **WHEN** a test, runner phase or acceptance stage named in a coverage row is removed
- **THEN** the verification document is updated in the same change so that no row names evidence that does not exist
