## ADDED Requirements

### Requirement: Root scripts and script files reference each other completely

Every `node scripts/<file>` target of a root `package.json` script SHALL exist, and every file under `scripts/` (excluding `scripts/fixtures/`) SHALL be referenced by a root `package.json` script, another script, a CI workflow, a Dockerfile or a test. A repository test SHALL enforce both directions so that an orphaned or dangling script fails the root test command. Root scripts, script files, acceptance stage names, result directories and verification environment variables SHALL be named by what they run or verify and SHALL NOT encode a prerelease number or roadmap step identifier. `DEVELOPMENT.md` SHALL catalog every root script with its group and when to run it.

#### Scenario: Script file loses its last reference
- **WHEN** a contributor deletes the only root script, workflow step or import that referenced a file under `scripts/`
- **THEN** the root test fails naming the orphaned file

#### Scenario: Root script points at a deleted file
- **WHEN** a root `package.json` script names a `scripts/` file that does not exist
- **THEN** the root test fails naming the script

#### Scenario: Catalog is incomplete
- **WHEN** a root script is added without a catalog row in `DEVELOPMENT.md`
- **THEN** the root test fails naming the uncataloged script

## REMOVED Requirements

### Requirement: Explicit unavailable-command behavior
**Reason**: Written for milestone 1, when documented commands existed before their features. Every documented root command now runs its feature; the only remaining placeholder (`test:integration`, printing "not implemented") verifies nothing and is deleted.
**Migration**: None. Integration-level verification is provided by the documented `verify:*` and `acceptance:*` commands; new commands are added together with their implementation.
