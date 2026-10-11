## ADDED Requirements

### Requirement: Portable entry lifecycle commands encode their guards
The content command port SHALL expose a guarded unpublication command, a
guarded draft-revert command, and an optional duplicate-source guard on entry
creation, each without a generic transaction callback, HTTP value, or database
row. The unpublication command SHALL carry the entry identity, the expected
published snapshot identity, the actor and time, and an optional idempotency
scope bound to the entry, actor, and complete input; its result SHALL
distinguish a fresh unpublication with its target published-state version from
an idempotent replay. The revert command SHALL carry the entry identity, the
expected draft revision, the expected published snapshot identity, and the
actor and time, and SHALL return the complete reverted entry. The
duplicate-source guard SHALL carry the source entry identity and the source
draft revision on which creation depends. A failed guard SHALL return the
stable failure and make no change.

#### Scenario: An unpublication crosses runtimes
- **WHEN** an application caller unpublishes through a runtime adapter
- **THEN** the command declares the expected publication and complete state
  change for one atomic persistence operation and returns a portable result

#### Scenario: An identical unpublish retry is atomic
- **WHEN** an application caller retries unpublication with the same entry,
  actor, idempotency key, and expected snapshot identity
- **THEN** the command returns the original complete result without another
  version increment or build request

#### Scenario: A guarded duplicate creation fails without an entry
- **WHEN** creation carries a duplicate-source guard whose source draft revision
  no longer matches
- **THEN** the command fails with `CONTENT_REVISION_CONFLICT` and no entry,
  snapshot, block, or media reference is created

## MODIFIED Requirements

### Requirement: In-memory parity doubles preserve content invariants

The system SHALL provide in-memory application test doubles for the content,
infrastructure, and dispatch capability contracts. The content double SHALL
enforce page singleton cardinality, expected-revision conflicts, globally unique
published routes, exactly one mutable draft per committed entry, and detached
immutable publications. It SHALL make a complete draft save, a guarded
publication, a guarded unpublication, a guarded draft revert, and a guarded
duplicate creation appear atomically: failures SHALL leave all stored
aggregates, routes, and public projections unchanged. Returned aggregates and
projections SHALL be detached from future caller mutation.

#### Scenario: A competing page creation is rejected
- **WHEN** an in-memory content double receives a second successful-create request for the same page model
- **THEN** it rejects the request with the stable page-cardinality conflict and retains the original entry unchanged

#### Scenario: Publication retains the previous public value after a draft edit
- **WHEN** an in-memory content double publishes an entry and subsequently saves a changed draft
- **THEN** public reads and build export retain the detached published snapshot while the draft receives exactly one revision increment

#### Scenario: A route conflict does not partially publish
- **WHEN** guarded publication resolves to a route owned by another entry
- **THEN** it rejects the request with the stable route-conflict failure and leaves the candidate draft, existing route owner, and all public projections unchanged

#### Scenario: In-memory unpublication and revert match the adapters
- **WHEN** an in-memory content double unpublishes an entry, or reverts a
  changed draft
- **THEN** public reads, the published-state version, the draft, and the
  derived status match the SQL adapters' results for the same inputs
