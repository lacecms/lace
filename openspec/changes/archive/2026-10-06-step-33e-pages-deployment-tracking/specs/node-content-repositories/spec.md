## ADDED Requirements

### Requirement: Node tracking checks use guarded leases
The Node SQLite adapter SHALL implement tracking check claims, check records, and stage-aware tracked completion with the same guards, ordering, lease, and results as the D1 adapter, inside transactions, so the shared repository contract proves parity.

#### Scenario: Lease expiry makes a check due again
- **WHEN** a claimed tracking check is not recorded before its lease expires
- **THEN** a later claim returns the same build with its unchanged provider ID and tracking start
