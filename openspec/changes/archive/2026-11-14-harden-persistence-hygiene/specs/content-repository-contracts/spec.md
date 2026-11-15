## ADDED Requirements

### Requirement: Idempotency records expire and are purged

A publication or unpublication idempotency record SHALL replay only while its
expiry time is later than the command's clock time.

- An expired record SHALL be treated as absent. The retry SHALL go through the
  normal guards as a new request.
- On commit, the mutation SHALL replace the expired record with the new
  request's record in the same atomic mutation.
- If the mutation fails or is refused, the expired record SHALL remain
  unchanged.
- Reusing an expired key with different input SHALL NOT fail as an
  idempotency conflict.

Maintenance SHALL delete expired idempotency records:

- in bounded batches of at most a fixed per-call limit;
- through the same statement on Node SQLite and D1;
- on each runtime's existing maintenance schedule; on the Worker, in its
  own scheduled phase, only on the runs whose other maintenance leaves the
  invocation within 50 D1 queries;
- without deleting an unexpired record.

The shared repository contract SHALL pin this behavior on every SQL runtime.

#### Scenario: Unexpired key replays

- **WHEN** a publication is retried with the same actor, key and input before
  the record expires
- **THEN** the original result is replayed, and no snapshot, version
  increment or build request is added

#### Scenario: Expired key is processed as a new request

- **WHEN** a publication is retried with the same actor and key after the
  record expired, with a current expected revision
- **THEN** the repository commits a new publication and increments the
  published-state version once. It stores one record for that scope and key,
  carrying the new result and a new expiry

#### Scenario: Expired key with stale input changes nothing

- **WHEN** an unpublication is retried after its record expired and its
  expected published snapshot no longer names the current publication
- **THEN** it fails with `CONTENT_REVISION_CONFLICT`, and the expired record
  and all content state remain unchanged

#### Scenario: Purge is bounded and keeps live records

- **WHEN** maintenance runs with more expired records than its per-call limit,
  plus unexpired records
- **THEN** it deletes exactly the limit of expired records and no unexpired
  record. A later run deletes the remaining expired records

### Requirement: Publication removes superseded snapshots identically on every runtime

A committed publication SHALL leave the entry with exactly two snapshots:

- its current draft;
- the new published snapshot.

Every other snapshot of the entry SHALL be deleted in the same atomic
mutation, along with its blocks and media and link references. Node SQLite
and D1 SHALL express this rule with one shared statement. A replayed or
refused publication SHALL delete no snapshot.

#### Scenario: Republication keeps only current snapshots

- **WHEN** a published entry is edited and published again on Node SQLite or
  local D1
- **THEN** the entry owns exactly its draft and the new published snapshot,
  and no block, media-reference or link-reference row of the previous
  publication remains

#### Scenario: Refused publication deletes nothing

- **WHEN** a publication is refused for a stale revision or a route conflict
- **THEN** every snapshot of the entry, with its blocks and references,
  remains unchanged
