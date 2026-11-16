# outbox-dispatch Specification

## Purpose

Defines durable asynchronous event dispatch behavior so recoverable background
work has exclusive claims, bounded retries, and observable terminal outcomes.

## Requirements

### Requirement: Durable events have exclusive recoverable leases
The system SHALL claim only available, unfinished events through an atomic
conditional operation. Each claim SHALL create a 60-second lease that excludes
other dispatchers until it completes or expires. A later claim SHALL recover
expired unfinished work without treating it as a completed event, and a stale
lease completion SHALL not alter a subsequently recovered claim.

#### Scenario: Concurrent dispatchers claim one event
- **WHEN** two dispatchers concurrently claim an available event
- **THEN** exactly one receives an active lease and the other cannot complete
  or process that event through the first lease

#### Scenario: A crashed dispatcher lease expires
- **WHEN** a dispatcher does not complete its 60-second lease
- **THEN** a later dispatcher can claim the unfinished event and complete it
  without duplicating its durable completion record

### Requirement: Retryable dispatch failures are bounded and visible
The system SHALL record each failed attempt and reschedule retriable work using
bounded exponential backoff with jitter. A finite configured maximum attempt
count SHALL stop automatic retries; the terminal event outcome SHALL retain a
sanitized failure classification and attempt count for operator diagnosis. A
successful completion SHALL prevent all later automatic claims.

#### Scenario: A transient failure is retried
- **WHEN** a dispatcher reports a retriable event failure before the configured
  maximum attempt count
- **THEN** the event remains unfinished, its attempt count increases once, and
  its next availability is delayed by the configured bounded jittered backoff

#### Scenario: Attempts reach the terminal limit
- **WHEN** an event fails at its configured maximum attempt count
- **THEN** it is not automatically claimed again and its durable terminal
  outcome exposes only the sanitized failure classification and attempt count

### Requirement: Site-build dispatch uses fixed recovery timings
The system SHALL use a 60-second exclusive lease, full-jitter exponential retry delay starting from 5 seconds and capped at 15 minutes, and eight total attempts for site-build dispatch. Timing values SHALL be centralized and deterministic under an injected clock and random sample.

#### Scenario: Expired build lease is recovered
- **WHEN** a site-build dispatcher terminates with an unfinished lease and 60 seconds pass
- **THEN** a later dispatcher can reclaim that event while the old lease can no longer complete it

#### Scenario: Retry delay is bounded
- **WHEN** a failed attempt schedules a retry
- **THEN** its delay lies within the full-jitter exponential bound for that attempt and never exceeds 15 minutes

### Requirement: Registered outbox events have versioned payload contracts
The system SHALL use a shared registry for the persisted `site.build.requested`
and `media.delete.requested` types. Each type SHALL have a payload contract and
a version. The existing type names and unversioned JSON payloads SHALL be read
as version 1 on both runtimes.

The version 1 build payload SHALL carry `targetVersion` as a nonnegative safe
integer, `requestedAt` as a safe integer in milliseconds, `reason` and
`requestedBy` as nonempty strings, and optional `retryOfBuildId` as a nonempty
string. `publishedSnapshotId` SHALL accept a nonempty string or `null` and MAY
be absent on read. The version 1 media payload SHALL carry a nonempty
`mediaId`. It SHALL carry a nonempty `requestedBy` on new writes and MAY omit
it on read for existing events. Readers SHALL tolerate extra fields on valid
version 1 rows and SHALL derive dispatch inputs only from defined fields.

#### Scenario: Upgrade with existing work
- **WHEN** a deployment starts with a version 1 build row without explicit
  version metadata and a media deletion row carrying only `mediaId`
- **THEN** both can be dispatched using their persisted target and media ID
  without rewriting either payload or resetting its lease or attempt count

### Requirement: Registered event enqueue is atomic with its producer

Application use cases SHALL declare the registered event type and
request-owned payload in the portable mutation command. An event request
SHALL carry no SQL, database row or commit-time build target. Both
repositories SHALL validate those fields against the registry and enqueue
the supplied events through the shared write-plan boundary in the same
SQLite transaction or D1 batch as the producer's guarded state changes.
Advancing public state SHALL have no implicit enqueue effect.

A rejected or rolled-back mutation SHALL leave both the state and outbox
unchanged. The committed-work receipt SHALL report an affected insert or
coalesce only after commit. It SHALL exclude replays, guard misses, event
requests whose write condition did not hold, and outbox lease or outcome
changes.

An authorized media deletion request or explicit media deletion retry
SHALL supply a `media.delete.requested` event with the selected media ID and
requesting actor ID. It SHALL insert a distinct event available at the
request time, atomically with the eligible transition to `deleting`. The
write SHALL retain the existing lifecycle and reference guards.

#### Scenario: A mutation queues the event supplied by its use case

- **WHEN** an authorized producer supplies a registered event request and
  its mutation and event guards pass
- **THEN** the repository commits that event with the mutation, preserving
  the supplied request-owned values under the event's enqueue rules

#### Scenario: Invalid request data cannot create durable work

- **WHEN** a mutation command supplies an event with request-owned data
  that fails its registry contract
- **THEN** the mutation fails without any committed state or outbox change
  and the Worker registers no post-commit dispatch pass

#### Scenario: An authorized event loses admission

- **WHEN** a command proposing an event is rejected by a revision, retry
  eligibility or reference guard, or an idempotency record yields a replay
- **THEN** it commits no new event or coalesce and reports no committed
  outbox work

#### Scenario: Deletion enqueue fails

- **WHEN** the media state is eligible for deletion but inserting its event
  fails inside the atomic write
- **THEN** the media state and outbox stay unchanged and the Worker registers
  no post-commit dispatch pass

#### Scenario: Media deletion events stay independent

- **WHEN** two eligible media deletions commit, or an administrator retries a
  failed media deletion
- **THEN** each committed request has a distinct event available at its own
  request time

### Requirement: Registered dispatch validates and isolates invalid events
On Node and the Worker, the system SHALL resolve handlers by registered
event type and validate the persisted payload before calling the build
provider or object storage. Regular dispatch passes SHALL leave unregistered
types untouched. An eligible row of a registered type with invalid JSON or
a payload that fails its version 1 contract SHALL be retired under a guard matching the
observed row and current claim eligibility or lease. Retirement SHALL record
one failed attempt, clear the lease and mark the event processed with
`invalid_build_event` or `invalid_media_deletion_event` as appropriate. It
SHALL leave related build history, media metadata and stored objects
untouched. Diagnostics SHALL expose only the closed reason and safe event
correlation. Invalid candidates SHALL count toward the claim bounds.

#### Scenario: Malformed event precedes valid work
- **WHEN** a due registered row has invalid JSON, a non-object payload or an
  invalid field, and a later candidate of that type is valid
- **THEN** the invalid row is retired without external work, and dispatch
  proceeds with valid work within the normal claim and invocation bounds

#### Scenario: Invalid candidate changes after selection
- **WHEN** a selected invalid candidate's payload changes or another
  dispatcher acquires its lease before retirement
- **THEN** the stale candidate changes neither the new payload nor its lease

#### Scenario: Unregistered type is due
- **WHEN** a regular dispatch pass encounters available work of an
  unregistered type alongside a registered event
- **THEN** only the registered event is eligible for that dispatch pass
