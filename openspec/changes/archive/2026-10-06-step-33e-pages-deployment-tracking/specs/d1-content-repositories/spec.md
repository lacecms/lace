## ADDED Requirements

### Requirement: D1 tracking checks use guarded leases
The D1 adapter SHALL select due tracked builds (`running`, provider ID present, next check due, outbox event completed) in next-check order and lease them in one batch with updates guarded by build ID, provider ID, `running`, and the selected next-check value, returning only rows whose update changed one row together with the event completion time as tracking start and the last successful check time. Check records and completions SHALL be single guarded statements, and results SHALL match the Node adapter.

#### Scenario: Two invocations claim the same check
- **WHEN** two Worker invocations claim due tracking checks at the same time
- **THEN** each due build is returned to at most one of them until its check lease expires
