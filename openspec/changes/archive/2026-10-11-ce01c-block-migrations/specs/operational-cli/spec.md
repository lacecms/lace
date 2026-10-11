## MODIFIED Requirements

### Requirement: Sync uses the accepted guarded synchronization policy
`lace content sync` SHALL use the existing application synchronization planner and guarded apply operation for Node and Cloudflare, with the block registry of the project configuration. `--check` SHALL never write; it SHALL return success only when the stored identities and structure baselines match the normalized configuration, and SHALL return a distinct nonzero exit code when changes are pending or invalid. A normal sync SHALL report operations, structural change classes, affected draft and published counts and planned writes, including planned block migrations, and SHALL refuse incompatible changes, including failing or invalid block migrations, without writing. After a successful apply it SHALL report the number of migrated drafts, published snapshots and blocks. A sync that stops as stale during block migration SHALL fail with a message to rerun it, and a rerun SHALL complete the remaining work.

#### Scenario: CI check finds a pending change
- **WHEN** `content sync --check` sees a valid pending plan
- **THEN** it reports the plan, exits with the pending-change code, and leaves persistent state unchanged

#### Scenario: Incompatible change
- **WHEN** a model change is incompatible with stored entries
- **THEN** sync reports the affected model and leaves the database unchanged

#### Scenario: First check after upgrade reports pending baselines
- **WHEN** `content sync --check` runs against an installation whose models have no structure baseline
- **THEN** it lists one `record-baseline` operation per model, exits with the pending-change code, and a following `content sync` records the baselines without requesting a build

#### Scenario: Block migration is applied and reported
- **WHEN** `content sync` runs with a configuration whose block moves from version 1 to version 3 with valid migrations
- **THEN** it reports the planned migration, applies it, prints the migrated draft, published and block counts, and exits successfully

#### Scenario: Throwing migration blocks sync
- **WHEN** a declared block migration throws for a stored block
- **THEN** `content sync` reports `BLOCK_MIGRATION_FAILED` with the entry and block key, exits with the operation failure code, and leaves the database unchanged
