## MODIFIED Requirements

### Requirement: Node build claims and outcomes are atomic
The Node SQLite adapter SHALL claim site-build work and create or recover its build row as `running` in one transaction. A site-build claim SHALL return at most 10 leases per call, the same per-call cap as the D1 adapter, and its lease update SHALL require the event payload read by the claim to be unchanged, as on D1. Recovery SHALL be a guarded update that succeeds only from `pending` or `running` and keeps the original start time; an unprocessed event whose build row is already terminal SHALL be completed without dispatch. It SHALL preserve the target version captured at claim, use lease- and status-guarded transitions from `running`, and atomically record retry, terminal, accepted, tracked, or succeeded outcome with the event. Tracked completion SHALL require the same provider ID, a `running` row, and a completed event. A new publication after claim SHALL enqueue separate unclaimed work. Generic dispatcher event claims SHALL return at most 20 leases per call, as on D1.

#### Scenario: Two workers race to claim a build
- **WHEN** two Node workers concurrently claim one available build event
- **THEN** only one holds the lease and exactly one `running` build row is created for that event

#### Scenario: Old worker completes after reclaim
- **WHEN** an expired build lease is reclaimed and its former worker reports success
- **THEN** the former worker changes neither the recovered event nor its build row

#### Scenario: Claimed row is not running
- **WHEN** a claimed lease records an outcome for a row that is no longer `running`
- **THEN** the transaction is rejected and neither the event nor the build changes

#### Scenario: A large claim limit is capped
- **WHEN** a Node worker requests 50 leases while more than 10 site-build events, or more than 20 dispatcher events, are available
- **THEN** it receives 10 site-build leases, or 20 dispatcher leases, and the remaining events stay unclaimed
