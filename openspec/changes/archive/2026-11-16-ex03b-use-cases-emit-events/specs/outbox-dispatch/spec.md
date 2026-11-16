## MODIFIED Requirements

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
