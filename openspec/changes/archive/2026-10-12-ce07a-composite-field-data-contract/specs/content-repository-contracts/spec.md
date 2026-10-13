## ADDED Requirements

### Requirement: Composite lifecycle and media behavior have cross-runtime parity
Shared contracts SHALL prove composite model fields and block data behavior on
the in-memory fake, Node SQLite and D1 for save/load, publish, revert, duplicate,
and versioned block migration. Reorder/removal SHALL atomically replace media
locations. Usage counts, deletion guards, metadata-triggered builds, published
media dictionaries and hidden-block filtering SHALL agree with scalar rules.
Reference paths SHALL not require a new database table or reinterpret legacy
rows. Failures and stale guards SHALL leave the affected atomic unit unchanged.
D1 SHALL retain single guarded batches, ≤100 binds per statement and the existing
≤50-query maximum complete-draft save budget; no query SHALL be issued per item.

#### Scenario: Lifecycle copies
- **WHEN** a collection containing nested fields and blocks is saved, published, edited, reverted and duplicated on each implementation
- **THEN** values/order/references match, publication stays immutable to draft edits, and the duplicate's new block keys own its references

#### Scenario: Hidden and published media behavior
- **WHEN** media is used only in a hidden published block's nested field
- **THEN** usage and deletion protection remain, public output omits it, and its metadata edit retains the existing published-reference build behavior

#### Scenario: Media released only after the final stored reference
- **WHEN** an item is removed from a draft list while its publication still references it, then the last publication reference is removed
- **THEN** deletion is initially refused and becomes permitted only after no current snapshot location remains

#### Scenario: Chunk failure rolls back
- **WHEN** a nested reference becomes unavailable in the last insert chunk or a failure is injected between JSON and reference writes
- **THEN** the old snapshot JSON, references, revision, publication and build state remain intact

#### Scenario: D1 maximum content budget
- **WHEN** a valid snapshot with 200 blocks, 200 nested media references and 500 list elements is saved
- **THEN** it commits atomically within the existing query and bind budgets and reloads with the exact nested data
