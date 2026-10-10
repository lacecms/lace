## MODIFIED Requirements

### Requirement: Sync uses the accepted guarded synchronization policy
`lace content sync` SHALL use the existing application synchronization planner and guarded apply operation for Node and Cloudflare. `--check` SHALL never write; it SHALL return success only when the stored identities and structure baselines match the normalized configuration, and SHALL return a distinct nonzero exit code when changes are pending or invalid. A normal sync SHALL report operations, structural change classes, affected draft and published counts and planned writes, and SHALL refuse incompatible changes without partial application.

#### Scenario: CI check finds a pending change
- **WHEN** `content sync --check` sees a valid pending plan
- **THEN** it reports the plan, exits with the pending-change code, and leaves persistent state unchanged

#### Scenario: Incompatible change
- **WHEN** a model change is incompatible with stored entries
- **THEN** sync reports the affected model and leaves the database unchanged

#### Scenario: First check after upgrade reports pending baselines
- **WHEN** `content sync --check` runs against an installation whose models have no structure baseline
- **THEN** it lists one `record-baseline` operation per model, exits with the pending-change code, and a following `content sync` records the baselines without requesting a build
