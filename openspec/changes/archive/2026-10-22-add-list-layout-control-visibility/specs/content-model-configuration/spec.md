## ADDED Requirements

### Requirement: Setting visibility affects projection identity only
Block-level `settingsVisibility` SHALL contribute to configuration projection
identity and be excluded from structural identity only at block-definition
positions. Identically named model/block data and default-value keys SHALL remain
structural. Adding, removing or changing visibility rules SHALL not require
model/block version increments or migrations, rewrite draft/published content,
or change revisions/audit/media references. Synchronization SHALL preserve its
existing published-version advancement and build-request/coalescing behavior
for projection updates, including admin-only metadata.
Unopted configurations SHALL retain previous hashes. Display-only synchronization
SHALL retain the existing baseline guards and fail stale plans without partial
writes on both runtimes. Setting options/defaults SHALL retain structural rules.

#### Scenario: Visibility-only synchronization
- **WHEN** a populated model changes only block-setting visibility metadata
- **THEN** its projection changes, its structure and stored snapshots remain identical, and synchronization retains its existing published-version and build-request behavior

#### Scenario: Preserve content with metadata-like keys
- **WHEN** content/default JSON named `settingsVisibility`, `setting` or `values` changes
- **THEN** the change retains its ordinary structural classification

#### Scenario: Stale visibility plan
- **WHEN** a visibility-only plan is applied after its baseline changed
- **THEN** synchronization rejects it without partial writes
