## ADDED Requirements

### Requirement: Entry write plans report typed guard outcomes and committed work
Node SQLite and D1 SHALL use the same ordered write plan for entry creation
(including guarded duplication), complete-draft save, deletion, publication
and unpublication. Expected admission failures SHALL be classified from
typed guard outcomes before any persistent mutation takes effect and SHALL
retain the established repository error codes and diagnostics. A false
guard SHALL leave content, link and media projections, public state,
idempotency records and outbox work unchanged. Unexpected statement and commit
failures SHALL roll back the unit and retain the stable invalid-state error.

The execution result SHALL distinguish a committed mutation from a guard
miss and identify newly inserted or coalesced outbox work from committed
statement results. Draft-only mutations, a replay, a guard miss and a rollback
SHALL report no committed outbox work. Worker dispatch registration SHALL use
this result and retain the existing coalescing of wake-ups per request.
Internal failure reasons SHALL NOT expose SQLite or D1 error messages.

#### Scenario: A typed singleton collision leaves the first entry intact
- **WHEN** two creation commands target the same page or global singleton
- **THEN** only one commits, and the other returns
  `CONTENT_MODEL_CARDINALITY_CONFLICT` without a new entry, snapshot or projections

#### Scenario: A stale command has no effects
- **WHEN** a complete-draft save, a guarded duplicate or a deletion names
  an outdated draft revision with other preconditions satisfied, or a
  deletion or unpublication names an older snapshot while a newer one is
  published
- **THEN** it returns `CONTENT_REVISION_CONFLICT` and leaves the winning
  mutation's draft, publication, projections, version and outbox work intact

#### Scenario: Media unavailability rejects the whole draft
- **WHEN** a complete-draft save would reference a missing or inactive media
  item, including an item in the final reference chunk
- **THEN** it returns `CONTENT_INVALID_STATE` for the unavailable media and
  retains the previous draft revision, values, blocks and reference projections

#### Scenario: A concurrent draft change takes precedence over invalid targets
- **WHEN** the draft revision changes after publication has read the candidate
  and a delivered link target is also invalid at admission
- **THEN** the attempted publication returns `CONTENT_REVISION_CONFLICT`
  and creates no snapshot, route, version, idempotency record or outbox work

#### Scenario: Inserting or coalescing a build reports committed work
- **WHEN** a publication, unpublication or published-entry deletion commits
  and inserts a build event or coalesces into a pending build event
- **THEN** its execution reports committed outbox work after commit and the
  event carries the version committed by the same mutation

#### Scenario: A failed commit reports no work
- **WHEN** the mutation fails after preparing or writing outbox work and
  the atomic unit rolls back
- **THEN** no outbox work is reported, no Worker dispatch pass is registered
  for that mutation, and a retry can commit the mutation once

#### Scenario: Authorization still applies to public mutations
- **WHEN** an actor with draft-write permission but without publication
  permission attempts to publish, unpublish or delete a published entry
- **THEN** the application rejects the command before persistence, and the
  entry, public state and outbox remain unchanged
