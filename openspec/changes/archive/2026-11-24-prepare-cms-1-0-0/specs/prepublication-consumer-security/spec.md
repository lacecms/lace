## MODIFIED Requirements

### Requirement: Acceptance consumes one verified artifact inventory
Release acceptance SHALL require a complete clean-source inventory, verify archive checksums, package contents and selected platform image identity/version/revision, and generate using the packed generator. It SHALL install the exact packed dependency graph outside the engine checkout with test-only resolution overrides, reject source-workspace resolution, and leave delivered templates and ownership metadata unchanged. Each run SHALL isolate its project, ports and volumes and clean them on success or failure.

#### Scenario: Exact clean artifacts
- **WHEN** a complete clean-source stable or prerelease inventory and supported platform are supplied
- **THEN** acceptance uses its exact packages and API/builder image IDs and records their source identity and versions

#### Scenario: Ineligible or altered artifacts
- **WHEN** the inventory is partial, preview, checksum-mismatched or has mismatched image metadata
- **THEN** acceptance fails before advertising release acceptance success

## ADDED Requirements

### Requirement: Exact stable acceptance proves the RC5 cutover

The stable acceptance receipt SHALL require both a fresh consumer and a populated RC5 upgrade on Node/SQLite with private object storage and Worker/local D1/R2. The upgrade SHALL originate from authenticated RC5 artifacts and use the exact target inventory. It SHALL verify existing sign-in and roles, distinct draft and published values and pointers, gallery version 6, URL targets, durable build state, original media bytes and a successful post-upgrade build. A disposable restore SHALL verify the coordinated recovery point with the compatible RC5 services. The receipt SHALL identify the source/target artifacts and completed stages without secrets, production data or backups.

#### Scenario: Both runtime journeys pass

- **WHEN** the packed target upgrades both populated RC5 consumers and builds from the upgraded content
- **THEN** their original identifiers, published output and media checksums match the recorded expectations, and the run records both runtime outcomes and successful restore checks

#### Scenario: A media object changes or a recovery check fails

- **WHEN** an original object's checksum differs or a restored RC5 installation cannot serve the saved content
- **THEN** acceptance stops with sanitized diagnostics, leaves the release unapproved and writes no success receipt
