## ADDED Requirements

### Requirement: Release prose is concise and has one reviewed source
The repository SHALL maintain a root changelog with one uniquely identifiable entry per documented release version. The same entry SHALL supply the corresponding GitHub Release description, allowing only link normalization needed for GitHub rendering. Entries SHALL name the important user-visible changes, incompatibilities and required upgrade actions in clear, concise language. Routine internal work, task identifiers, test counts, checksums and detailed acceptance logs SHALL stay outside release prose. The editorial target SHALL be 3–6 single-sentence bullets and normally 60–120 words; completeness and readability SHALL take priority over a mechanical word limit. Detailed compatibility/migration instructions SHALL remain linked permanent documentation. Entries SHALL NOT imply publication or deployment verification from preparation alone.

#### Scenario: Alpha six is described briefly
- **WHEN** alpha.6 notes are migrated to the changelog
- **THEN** the entry covers paginated export, tolerant public reads, draft-media detachment and coordinated upgrade requirements without duplicating the acceptance report

#### Scenario: Important upgrade action needs detail
- **WHEN** a change requires coordinated packages or a migration/rollback procedure
- **THEN** the short entry explicitly names the action and links to the full procedure rather than omitting it to meet a word target

#### Scenario: Missing or ambiguous entry
- **WHEN** the selected version has no changelog entry or has duplicate entries
- **THEN** GitHub release finalization refuses before any remote mutation

### Requirement: GitHub finalization preserves artifact identity and evidence
A separate owner-operated GitHub release command SHALL default to a read-only plan and SHALL require explicit apply to create or publish a release. It SHALL derive repository, version and source revision from a verified complete publication-eligible inventory and accepted exact-artifact evidence. The release tag SHALL be `v<artifact-version>` and SHALL resolve to the artifact source commit already available in the remote source repository, not the operator's current HEAD. An existing different tag or conflicting release SHALL cause refusal without overwriting it.

Finalization SHALL verify all fifteen immutable npm versions and both multi-platform images against the selected inventory, independently of local receipt existence and the current npm dist-tag. Partial publication, authentication failure or unavailable verification SHALL prevent final publication. It SHALL create or resume a matching draft, attach allowlisted inventory, acceptance and complete npm/image publication JSON reports, verify remote attachment bytes and then publish it as a prerelease without marking it latest. It SHALL never rebuild, repack, publish npm packages, push images or force-move tags. Matching reruns SHALL be idempotent; conflicting published bodies/assets SHALL be reported rather than silently replaced. Local reports SHALL record the remote release URL, tag/commit and verified attachment hashes.

Attachments SHALL contain reviewed public evidence only, preserving source identity and original acceptance facts. Environment files, credentials, private logs and arbitrary files SHALL never be uploaded. Acceptance output SHALL have a durable machine-readable file under the selected artifact directory after successful acceptance and cleanup of the temporary test environment; failed runs SHALL NOT produce a success receipt. Older tracked receipts SHALL remain until byte-identical remote preservation has been verified, and their later repository removal SHALL be an explicit documentation change.

#### Scenario: Complete set finalized
- **WHEN** explicit apply is requested and source, all registry artifacts, acceptance and attachment bytes match
- **THEN** the versioned prerelease exposes the concise changelog entry and verified JSON attachments, with a local finalization receipt

#### Scenario: Some packages or one image are missing
- **WHEN** publication receipts cover a subset or remote checks cannot establish the complete exact set
- **THEN** no release is published and local artifacts remain available for publication recovery

#### Scenario: Tag names another source revision
- **WHEN** the version tag exists but resolves to a different commit
- **THEN** finalization fails before changing tags, releases or attachments

#### Scenario: Upload was interrupted
- **WHEN** a matching draft exists with only some expected matching attachments
- **THEN** explicit apply resumes missing attachments, verifies all bytes and publishes only after the full handoff is complete

#### Scenario: Preview without publishing permission
- **WHEN** the command runs without explicit apply
- **THEN** it reports the intended release and verification results or missing prerequisites without creating tags, drafts, attachments or local publication receipts

### Requirement: Cleanup deletes only explicitly selected recoverable release state
A cleanup command SHALL default to a non-mutating preview listing selected paths, estimated bytes and unmet prerequisites. Explicit apply SHALL be required for deletion. The artifact selection SHALL be an explicitly named child directory of this repository's `.release-artifacts`; the root itself, paths outside it, tracked source files, symlink escapes and wildcard/global selection SHALL be refused. Extra local evidence directories SHALL require explicit bounded selection. Other release versions and development data SHALL be untouched.

Before deleting the selected release set, cleanup SHALL freshly verify complete exact npm/image publication and a published GitHub prerelease with the correct tag/source, notes and required byte-verified reports. Local receipts or `publishedVersions` alone SHALL NOT authorize deletion. Incomplete, mismatching, inaccessible or unauthenticated verification SHALL cause refusal without deletion. Active preparation, publication, acceptance or another cleanup SHALL prevent concurrent deletion. Interrupted deletion SHALL report its remaining scope and support safe retry without confusing missing local files with a different release; an already absent selected directory SHALL be a no-op.

The optional acceptance-stack cleanup SHALL require separate explicit selection. It SHALL validate the named stack state and stop/remove its containers and volumes through the existing acceptance-stop behavior before removing `.lace-acceptance`. Invalid state or stop failure SHALL leave the directory intact. Preview SHALL neither stop containers nor remove files. Cleanup SHALL NOT edit the changelog, tracked notes/receipts, OpenSpec history or arbitrary temporary directories, and SHALL NOT prune Docker/global package caches.

#### Scenario: Published version cleaned
- **WHEN** explicit apply selects one fully verified published release with remotely preserved evidence and no active operation
- **THEN** only its selected local artifact/evidence directories are removed and the report identifies the version and remote release URL

#### Scenario: Partial or unverifiable handoff
- **WHEN** a required asset is missing, a checksum differs, publication is partial or a remote check fails
- **THEN** cleanup refuses before deletion and lists the unmet prerequisite

#### Scenario: Unsafe path or operation collision
- **WHEN** selection escapes the allowed root, includes tracked files or overlaps an active release operation
- **THEN** cleanup refuses and leaves both the selected and unrelated data unchanged

#### Scenario: Acceptance environment is active
- **WHEN** acceptance cleanup is explicitly selected with valid named state
- **THEN** only that stack is stopped and removed before its directory is deleted; an ordinary artifact cleanup does not stop it

#### Scenario: Interrupted cleanup retried
- **WHEN** deletion failed after removing some selected files and the same verified cleanup is retried
- **THEN** the remaining scope is checked against the recorded release identity and remote evidence before removal, without rebuilding or modifying registry artifacts
