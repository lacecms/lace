## MODIFIED Requirements

### Requirement: Content cardinality, paths, and block ordering
The system SHALL permit exactly one entry for a `page` model and any number of
entries for a `collection` model. A page's public path SHALL be its fixed
canonical model path. A collection entry SHALL resolve its canonical route from
the model's single `:slug` segment only when it has a valid lowercase ASCII
slug of letters or digits separated by single hyphens. A resolved public path
SHALL conflict when it is already owned by a different entry.

Blocks SHALL form one flat ordered list with unique stable keys and positive,
strictly increasing safe-integer positions. New or normalized positions SHALL
use sparse increments of 1,000; insertion SHALL use a safe in-between position
when one exists and SHALL require normalization when no integer gap remains.
Normalization SHALL preserve block order.

Invalid non-positive, unsafe, duplicate, or descending positions SHALL be rejected
with `CONTENT_INVALID_STATE` before persistence on both runtimes. The ordering
message SHALL identify the zero-based offending block index, include its key
only when it is a bounded safe identifier, and explain that positions must be
positive safe integers in strictly increasing order. It SHALL advise resubmitting
positions in displayed order, without exposing block data or arbitrary key text.
The domain SHALL NOT sort or normalize invalid client input into acceptance.

#### Scenario: Detect a page singleton race
- **WHEN** a second entry is created for a `page` model that already has its
  singleton entry
- **THEN** the operation is rejected with the stable page-cardinality conflict
  code

#### Scenario: Resolve a published collection path
- **WHEN** a collection with route `/blog/:slug` publishes an entry with slug
  `release-notes`
- **THEN** its public path is `/blog/release-notes`

#### Scenario: Reject a conflicting public path
- **WHEN** an entry resolves to a public path owned by a different entry
- **THEN** the operation is rejected with the stable public-route conflict code

#### Scenario: Normalize exhausted block positions
- **WHEN** an insertion has no integer position between adjacent ordered blocks
- **THEN** the system normalizes the complete list into increasing 1,000-step
  positions without changing block order

#### Scenario: Reject invalid ordering without changing state
- **WHEN** a writer submits non-positive, unsafe, duplicate or descending positions
- **THEN** the request fails with the offending index and a safe reason, and draft revision, published snapshot and build state remain unchanged

#### Scenario: Diagnostics exclude arbitrary key text and block data
- **WHEN** an invalid ordered aggregate carries an unsafe or oversized key or sensitive block data
- **THEN** the ordering error includes the index and recovery instruction without echoing that key or data
