## REMOVED Requirements

### Requirement: Uploads record a content hash for deduplication
**Reason**: Media stored before the hash column cannot exist in a baseline database (owner decision 11).
**Migration**: Replaced by "Every upload records a content hash for deduplication", which keeps the current behavior.

## ADDED Requirements

### Requirement: Every upload records a content hash for deduplication
Every successful upload SHALL record the SHA-256 digest of the exact stored
bytes as 64 lowercase hexadecimal characters, computed after format
verification and before metadata is committed, identically on Node and
Cloudflare. A failed upload SHALL record nothing. The hash SHALL never change
after creation; metadata and tag updates SHALL keep it. Identical
bytes uploaded twice SHALL create two items with the same hash; the hash SHALL
NOT be unique and SHALL NOT refuse an upload. A media list SHALL be able to
restrict results to `active` items with a given hash, requiring `content:read`
like every media list. Hashes SHALL NOT be counted as usage and SHALL NOT
change the published-content version or build work.

#### Scenario: Upload records the hash
- **WHEN** an editor uploads a PNG whose bytes have SHA-256 `h`
- **THEN** the created item carries `h`, and a list filtered by `h` returns it

#### Scenario: Deleting item is not a match
- **WHEN** an item with hash `h` is marked `deleting` and a client lists by `h`
- **THEN** the item is not returned
