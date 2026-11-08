## REMOVED Requirements

### Requirement: Query metadata synchronization uses a guarded public identity
**Reason**: Legacy hash-equality proofs and rollback-era rules served databases older than rc1 (owner decision 11).
**Migration**: Replaced by "Query metadata synchronization records a guarded public identity", which keeps the current behavior.

## ADDED Requirements

### Requirement: Query metadata synchronization records a guarded public identity
The system SHALL persist nullable TEXT `public_projection_hash` and
`public_projection_source_hash` columns on `content_models`, identically on
Node SQLite and D1, without field-query indexes. A model row SHALL begin with
unknown public identity until synchronization records it. The full projection
hash SHALL continue including listOptions, while public identity SHALL use the
runtime model publicProjectionHash defined in content-model-configuration.
A public baseline SHALL be trusted only when both stored hashes are valid
SHA-256 values and its source equals the stored full projection hash.

For unchanged model structure and version with a trusted baseline, sync SHALL
compare configured and stored public identity to derive public impact. A
query-only enable/edit/remove/reorder SHALL update full model metadata and the
new identity pair without changing public state or build work. Public metadata
changes, including simultaneous SEO and query edits, SHALL retain the existing
single atomic published-state advance and build coalescing. Creates, removals,
renames, version changes and content rewrites SHALL retain their existing rules.

For missing, invalid or source-mismatched public identity, sync SHALL treat
the public projection as changed when the full projection hash differs: it
SHALL conservatively advance public state and coalesce build work when
applying the projection update, then record the new identity pair. When the
full projection hash is unchanged, it SHALL record the identity pair as a
baseline-only operation without a public-state advance or build. No stored
hash equality SHALL be used to prove an untrusted public identity unchanged.

Both identity fields SHALL be read, reported as synchronization metadata and
included in prepared-state equality and stale-plan guards on both runtimes,
including D1's SQL state comparison. The final guarded model mutation SHALL
write public identity, its source, full identity and canonical structure
atomically. A baseline-only update SHALL be a record-baseline operation without
a public version/build change; subsequent identical sync SHALL perform no writes.
A stale-plan or injected failure SHALL roll back the new metadata together with
other final-mutation writes. No unguarded post-commit seeding SHALL occur.
Internal public identity SHALL NOT be added to REST metadata or public exports.

#### Scenario: Query-only synchronization does not rebuild
- **WHEN** a collection with trusted public identity enables, edits, reorders or removes listOptions without another projection change
- **THEN** its full projection and identity source update atomically while snapshots, model version, published state and build work remain unchanged on Node and D1

#### Scenario: An unchanged model records its public identity once
- **WHEN** a model with a valid structural baseline but no trusted public baseline has a stored full hash equal to configured full identity
- **THEN** sync records the public pair as a baseline-only operation without a build and the next identical sync is a no-op

#### Scenario: Untrusted identity takes the conservative path
- **WHEN** no trusted public baseline exists and the full projection hash changes, even when the stored full hash equals the configured publicProjectionHash
- **THEN** sync advances public state once, coalesces one build request and records the identity pair without rewriting snapshots

#### Scenario: Mixed query and SEO changes still rebuild
- **WHEN** listOptions and an SEO fallback mapping change in the same synchronization
- **THEN** public identity changes, public state advances once and one build request is coalesced atomically, while content values remain unchanged

#### Scenario: Concurrent identity recording invalidates an older plan
- **WHEN** one sync records public identity after another plan was prepared, even if the full projection hash is unchanged
- **THEN** the older plan fails its stale guard without overwriting metadata or changing content, published state or outbox work

#### Scenario: Final mutation failure preserves every identity
- **WHEN** a fault occurs between writing model/public identity metadata and completing the final synchronization mutation
- **THEN** Node and D1 roll back both new fields with full/structural identity, canonical baseline and any public-state/build work
