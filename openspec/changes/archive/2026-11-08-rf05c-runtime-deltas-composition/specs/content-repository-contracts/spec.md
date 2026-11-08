## ADDED Requirements

### Requirement: Repository contract fixtures pin runtime write-path deltas
The shared repository contract SHALL pin the observable result of every
write path whose Node and D1 implementations differ in mechanism. The entry
returned by a committed publication, by its idempotent replay and by a
committed unpublication SHALL equal the entry returned by a subsequent `load`
of the same entry, including published fields, blocks, block data, slug,
title, revision, timestamps, actor and the SEO group. A publication whose
expected revision is stale SHALL be refused with `CONTENT_REVISION_CONFLICT`
before its internal-link targets are validated, and SHALL change no snapshot,
route, published-state version, outbox event or idempotency record. A
site-build claim SHALL return at most 10 leases and a dispatcher event claim at
most 20 leases per call, whatever larger valid limit is requested, in
available-time then identifier order, and the unreturned events SHALL stay
claimable by a later call.

#### Scenario: Publication result equals a later load
- **WHEN** an entry with SEO values is published, once without and once with
  a conditional projection, on SQLite and on D1
- **THEN** each returned entry equals the entry returned by `load` immediately
  afterwards, and the published snapshot carries the draft's SEO values

#### Scenario: Idempotent replay equals a later load
- **WHEN** a publication with an idempotency key is replayed from a second
  repository over the same database
- **THEN** the replayed entry equals the entry returned by `load`

#### Scenario: Unpublication result equals a later load
- **WHEN** a published entry is unpublished
- **THEN** the returned entry has no publication and equals the entry returned
  by `load`

#### Scenario: Stale publication is a revision conflict before link validation
- **WHEN** a publication names a stale expected revision for a draft whose
  internal links target an unpublished entry
- **THEN** the repository refuses with `CONTENT_REVISION_CONFLICT`, not a link
  failure, and the published-state version, routes, snapshots, outbox and
  idempotency records are unchanged

#### Scenario: Claims honor the per-call cap
- **WHEN** eleven site-build events with expired leases, or twenty-one
  dispatcher events, are available and a claim requests a limit of 50
- **THEN** the claim returns exactly ten site-build leases, or twenty dispatcher
  leases, for the earliest events, and a second claim returns the remaining
  event
