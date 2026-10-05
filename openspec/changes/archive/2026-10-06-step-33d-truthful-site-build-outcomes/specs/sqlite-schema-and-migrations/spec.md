## ADDED Requirements

### Requirement: Site-build status migration reclassifies unproven outcomes
The shared schema SHALL restrict `site_builds.status` to `pending`, `running`, `accepted`, `succeeded`, `failed`, `cancelled`, and `unknown`, and SHALL store nullable provider tracking stage, last-check time, and next-check time with an index for selecting due tracked builds. A single forward migration shared by Node SQLite and D1 SHALL introduce these without losing any build row, identity, target version, requester, timestamps, provider ID, or stored diagnostic. Existing `running` rows SHALL become `accepted` with a completion time, because no runtime tracked them. On D1, `succeeded` rows without a provider ID SHALL become `accepted`, because deploy-hook acceptance never proved publication. On Node SQLite, `succeeded` rows SHALL remain `succeeded`, because the self-hosted builder proved the release. `pending` and `failed` rows, outbox events, attempts, leases, and coalescing state SHALL be unchanged. The migration SHALL be recorded like every other checked-in migration and SHALL be refused by no supported runtime.

#### Scenario: D1 history is reclassified
- **WHEN** a migrated D1 database containing `running` rows with provider IDs and `succeeded` rows without provider IDs applies the migration
- **THEN** all of those rows become `accepted`, keep their provider IDs and timestamps, and gain a completion time when absent

#### Scenario: Node builder history is preserved
- **WHEN** a Node SQLite database containing builder `succeeded`, `failed`, and `pending` rows applies the migration
- **THEN** each row keeps its status, timestamps, and diagnostics

#### Scenario: New status values are enforced
- **WHEN** a write stores `accepted`, `cancelled`, or `unknown` after migration, or an unsupported status value
- **THEN** the three new values are accepted and the unsupported value is rejected
