## MODIFIED Requirements

### Requirement: D1 build claims and outcomes use guarded batches
The D1 adapter SHALL claim site-build work and create or recover its build row as `running` in the same batch as the outbox lease, using a guarded update that succeeds only from `pending` or `running` and keeps the original start time. A claim SHALL return at most 10 site-build leases per call, whatever larger valid limit is requested, so that its four guarded statements per claim stay within the mutation statement budget; the unreturned events SHALL stay claimable by a later call. An unprocessed event whose build row is already terminal SHALL be completed in that batch without being returned for dispatch. Every outcome SHALL be one guarded batch requiring the same live lease and a `running` build row, and SHALL record retry (`pending`), `failed`, `succeeded`, `accepted`, or tracked `running` together with the event. Tracked completion SHALL be guarded by build ID, provider ID, `running` status, and a completed event, and SHALL be idempotent for the same outcome. Results SHALL match the Node adapter for every transition.

#### Scenario: Batch claim marks running
- **WHEN** the scheduled Worker claims an available build event
- **THEN** the lease and the `running` build row with its start time are committed together

#### Scenario: Stale Worker records after reclaim
- **WHEN** an expired claim is recovered by another invocation and the stale invocation records acceptance
- **THEN** the batch changes nothing and the recovered build remains `running`

#### Scenario: Tracked completion after restart
- **WHEN** a new Worker invocation completes a tracked build with its provider ID
- **THEN** only that build becomes terminal, and a repeated identical completion is a no-op

#### Scenario: Many recoverable builds stay within the statement budget
- **WHEN** more than ten site-build events with expired leases are available and a claim requests 50
- **THEN** the claim returns ten leases in one batch within the statement budget and a later claim returns the rest
