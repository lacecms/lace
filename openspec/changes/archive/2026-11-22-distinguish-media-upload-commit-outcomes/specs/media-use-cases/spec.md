## MODIFIED Requirements

### Requirement: Object and metadata creation preserve a recoverable boundary

On Node and Cloudflare, the system SHALL write the verified binary to its opaque key before committing an active media row. The row SHALL contain the media identity, opaque storage key, sanitized display filename, binary-derived MIME type, byte size, image dimensions, actor and timestamps. The hash and any normalized tags SHALL commit atomically with the row. Binary bytes SHALL reside only in object storage.

After a successful object write, a confirmed failure to commit the metadata for this upload SHALL cause best-effort deletion of its unreferenced object and a failed response. After the metadata commits, any failure to read the created metadata or construct the response SHALL preserve the committed record and the exact stored bytes. If the commit outcome is uncertain, the system SHALL check authoritative metadata for the allocated media identity and object key before any cleanup. It SHALL delete the object only when it can establish that the create has finished without committing and that no media row owns the key. An inconclusive check SHALL leave the object in place. Recovery SHALL NOT repeat the upload or metadata insert.

An operational error SHALL identify confirmed creation failure or unresolved outcome by a safe code and the opaque key. A failed cleanup attempt SHALL be recorded separately. Diagnostics SHALL exclude uploaded bytes, caller secrets, filenames and raw provider errors. Logging or cleanup failure SHALL NOT mask the original operation failure.

#### Scenario: Object write precedes active metadata

- **WHEN** a verified upload completes successfully
- **THEN** the object exists before its active metadata becomes observable and the stored metadata contains no binary payload

#### Scenario: Metadata persistence fails after an object write

- **WHEN** storage accepts a verified object and the database rolls back the create, including a failure while inserting tags
- **THEN** no media row, tags or hash from the attempt remain, the system reports failure and records the opaque key, and successful cleanup removes the object

#### Scenario: Reading the result fails after commit

- **WHEN** the upload's row, tags and hash have committed and the repository's read of that row or the subsequent catalog read fails while producing the response
- **THEN** the request reports failure without deleting the object, and a later authorized read finds the active item with its tags, hash and byte-for-byte original image

#### Scenario: Commit acknowledgment is lost but metadata is found

- **WHEN** the create reports an uncertain outcome and reconciliation finds the allocated media identity with its object key
- **THEN** the request reports the original failure, leaves the row and file in place, and performs no second insert or object write

#### Scenario: Reconciliation confirms the write did not commit

- **WHEN** a write reports an uncertain outcome and an authoritative check establishes that it has finished, no row was committed for this upload and its object key is unreferenced
- **THEN** the request follows the confirmed-failure cleanup path and records the failure

#### Scenario: Reconciliation cannot establish the outcome

- **WHEN** reconciliation fails, finds inconsistent identity or ownership, or observes an absent row while the original write might still commit
- **THEN** the request reports failure, records the unresolved outcome and opaque key, and leaves the uploaded bytes untouched

#### Scenario: Cleanup itself fails after rollback

- **WHEN** the metadata transaction rolls back and object storage rejects deletion of the unreferenced upload
- **THEN** the database contains no media row or tags for the attempt, the file can remain in storage, and the operational evidence distinguishes the cleanup failure from the original write failure

### Requirement: Every upload records a content hash for deduplication
Every successful upload SHALL record the SHA-256 digest of the exact stored
bytes as 64 lowercase hexadecimal characters, computed after format
verification and before metadata is committed, identically on Node and
Cloudflare. An upload rejected before metadata creation or whose metadata write rolls back SHALL record no hash. A failure to return the result after commit SHALL preserve the stored hash. The hash SHALL never change
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

#### Scenario: Hash remains discoverable after a failed response

- **WHEN** an upload commits with hash `h`, the response read fails, and an authorized reader later lists active items by `h`
- **THEN** the committed item is returned and its stored bytes have digest `h`
