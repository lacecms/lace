## ADDED Requirements

### Requirement: Exact 1.1.0 acceptance proves both populated upgrades and restores

The 1.1.0 exact-artifact acceptance SHALL require fresh-install coverage and populated upgrades from verified 1.0.0 artifacts on Node/file-backed SQLite with SILO and on Worker/local D1 with R2. Each journey SHALL use the candidate packages and selected image identities from the verified inventory. It SHALL record original IDs, sign-in and roles, distinct draft and published values and pointers, gallery and link behavior, outstanding durable work and original-media checksums. It SHALL verify these through upgrade and restart, then build and serve the upgraded site and exercise thumbnail behavior without changing original media. A recovery drill SHALL restore the coordinated 1.0.0 state in isolation and verify sign-in, media and served output. The receipt SHALL identify source and target artifacts, runtime and completed stages without secrets, backup bytes or production data. Local D1 evidence SHALL be reported as local evidence.

#### Scenario: Both runtime upgrades pass
- **WHEN** the exact 1.1.0 inventory passes the fresh-install journeys and both 1.0.0 upgrades and restores
- **THEN** the receipt records both source and target identities, both zero-migration results and restore outcomes alongside the candidate inventory identity

#### Scenario: Persistence or restore fails on one runtime
- **WHEN** either runtime reports an unexpected ledger change, lost content, a changed original-media checksum, a failed build or a failed restore
- **THEN** qualification fails with sanitized diagnostics and withholds the success receipt
