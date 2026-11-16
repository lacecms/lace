## ADDED Requirements

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
Production writes SHALL enqueue registered events through a shared write-plan
boundary. The boundary SHALL validate the request-owned payload fields and
write the event within the same SQLite transaction or D1 batch as the
producer's guarded state changes. A rejected or rolled-back mutation SHALL
leave both the state and outbox unchanged. The committed-work receipt SHALL
include an affected insert or coalesce, and SHALL exclude replays, guard
misses and outbox lease or outcome changes. A media deletion request or
explicit retry SHALL insert its own event and make it available at the
request time.

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
