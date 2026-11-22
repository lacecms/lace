## MODIFIED Requirements

### Requirement: Release coordinates form one compatible release set
The release definition `release/alpha.json` SHALL identify an exact release version, generator version, ownership template version, npm channel, public package names, API/builder image coordinates and platforms, source repository and the versions already published. Every version recorded as published SHALL remain recorded and immutable. The candidate SHALL include every public package, including `@lacecms/mcp`, with its matching npm channel, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults, block-registry package requirements and the versioned installation commands in delivered consumer guides SHALL match the candidate. The selected ownership template version SHALL match the generator and upgrade metadata. Advancing ownership guidance SHALL NOT implicitly select or publish a new package/image version; a new candidate is selected only by an explicit release session. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

The release contract SHALL accept exact stable major.minor.patch versions on `latest` and exact `alpha.N` and `rcN` prerelease spellings on `next` (for example `0.1.0-rc1`), reject malformed or conflicting coordinates, keep verifying saved inventories of published versions, and refuse implicit changes to the selected version or channel. Only the owner’s stable publication operation SHALL move npm `latest`.

#### Scenario: Matching release metadata
- **WHEN** all selected package, template, guide and image settings agree with the release definition
- **THEN** preparation identifies the complete compatible set with its source revision and selected channel

#### Scenario: Incomplete or mismatched graph
- **WHEN** a consumer runtime dependency has another Lace version or depends on a private workspace member
- **THEN** preparation fails with the affected dependency before reporting a complete artifact set

#### Scenario: Published version reused
- **WHEN** the release definition's candidate version equals a version recorded as already published
- **THEN** validation fails before any build or pack and the published artifacts are left unchanged

#### Scenario: Stale delivered coordinates
- **WHEN** a generated dependency, image default, runtime image version default, block-registry requirement or versioned guide command still names a different release version
- **THEN** validation fails and identifies the stale coordinate instead of rewriting files

#### Scenario: Requested release candidate spelling
- **WHEN** coherent unpublished coordinates select a version such as `1.1.0-rc1`
- **THEN** preparation accepts the version and finalization derives tag `v1.1.0-rc1` without changing npm channel `next`

#### Scenario: Stable set selected

- **WHEN** the definition selects `1.0.0` on `latest` with the matching generator, independent template revision and all packages and images aligned
- **THEN** preparation accepts the set and the plan shows the exact stable coordinates and tag `v1.0.0`

#### Scenario: Channel disagrees with version

- **WHEN** a stable version selects `next` or a prerelease selects `latest`
- **THEN** preparation and any owner action using a mismatched inventory fail before writing or publishing artifacts

### Requirement: Publication is a separate owner-operated action
Build, pack, inspection and dry-run procedures SHALL NOT publish npm packages, push images, create remote releases or change registry visibility. The release guide SHALL list prerequisites, local verification commands, exact artifact inventory, package publication in dependency order with public access and the validated inventory channel, matching image publication and public visibility, and incomplete-publication recovery. It SHALL require rechecking authorization and availability of unscoped `create-lace` before a publication and stop on a conflicting owner. Credentials SHALL be supplied through the operator's registry authentication outside artifacts and generated files. The guide SHALL distinguish artifact preparation, exact-artifact consumer and security acceptance, and an actual public release.

#### Scenario: Preparation without authentication
- **WHEN** a contributor runs preparation or its dry-run without npm/GHCR publishing credentials
- **THEN** no remote mutation is attempted and local artifacts or a plan are produced

#### Scenario: Generator name has another owner
- **WHEN** the owner checks `create-lace` and the name is occupied without publishing permission
- **THEN** publication stops and requires an explicitly reviewed naming/template adjustment instead of silently claiming the name

#### Scenario: Partial public publication
- **WHEN** the owner successfully publishes only part of the reviewed set
- **THEN** the guide directs them to verify existing immutable artifacts and resume missing items without overwriting versions or announcing the set as complete

#### Scenario: Stable publication resumes

- **WHEN** an authorized owner resumes partial stable publication from the same inventory
- **THEN** matching immutable packages are reused, missing packages use the stable channel, conflicting bytes stop publication, and the receipt covers every package on that channel before completion

#### Scenario: A newer stable version has taken the channel

- **WHEN** a retry observes that a later stable version owns `latest`
- **THEN** it reports the dist-tag conflict and leaves the later version selected

### Requirement: GitHub finalization preserves artifact identity and evidence
A separate owner-operated GitHub release command SHALL default to a read-only plan and SHALL require explicit apply to create or publish a release. It SHALL derive repository, version and source revision from a verified complete publication-eligible inventory and accepted exact-artifact evidence. The release tag SHALL be `v<artifact-version>` and SHALL resolve to the artifact source commit already available in the remote source repository, not the operator's current HEAD. An existing different tag or conflicting release SHALL cause refusal without overwriting it.

Finalization SHALL verify every immutable npm version in the selected inventory and both multi-platform images against the selected inventory, independently of local receipt existence and the current npm dist-tag. Partial publication, authentication failure or unavailable verification SHALL prevent final publication. It SHALL create or resume a matching draft, attach allowlisted inventory, acceptance and complete npm/image publication JSON reports, verify remote attachment bytes and then publish it with the inventory’s release kind. Stable versions SHALL be regular releases and become latest on first finalization. Prereleases SHALL be marked prerelease and excluded from latest. It SHALL never rebuild, repack, publish npm packages, push images or force-move tags. Matching reruns SHALL be idempotent; conflicting published bodies/assets SHALL be reported rather than silently replaced. Local reports SHALL record the remote release URL, tag/commit and verified attachment hashes.

Attachments SHALL contain reviewed public evidence only, preserving source identity and original acceptance facts. Environment files, credentials, private logs and arbitrary files SHALL never be uploaded. Acceptance output SHALL have a durable machine-readable file under the selected artifact directory after successful acceptance and cleanup of the temporary test environment; failed runs SHALL NOT produce a success receipt.

#### Scenario: Complete set finalized
- **WHEN** explicit apply is requested and source, all registry artifacts, acceptance and attachment bytes match
- **THEN** the versioned release exposes the concise changelog entry and verified JSON attachments, with a local finalization receipt

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

#### Scenario: Stable finalization finds an incompatible release

- **WHEN** the selected stable tag already has a published GitHub release marked prerelease
- **THEN** finalization reports the mismatch and preserves the existing release and evidence

### Requirement: Cleanup deletes only explicitly selected recoverable release state
A cleanup command SHALL default to a non-mutating preview listing selected paths, estimated bytes and unmet prerequisites. Explicit apply SHALL be required for deletion. The artifact selection SHALL be an explicitly named child directory of this repository's `.release-artifacts`; the root itself, paths outside it, tracked source files, symlink escapes and wildcard/global selection SHALL be refused. Extra local evidence directories SHALL require explicit bounded selection. Other release versions and development data SHALL be untouched.

Before deleting the selected release set, cleanup SHALL freshly verify complete exact npm/image publication and a published GitHub release of the matching stable or prerelease kind with the correct tag/source, notes and required byte-verified reports. Local receipts or `publishedVersions` alone SHALL NOT authorize deletion. Incomplete, mismatching, inaccessible or unauthenticated verification SHALL cause refusal without deletion. Active preparation, publication, acceptance or another cleanup SHALL prevent concurrent deletion. Interrupted deletion SHALL report its remaining scope and support safe retry without confusing missing local files with a different release; an already absent selected directory SHALL be a no-op.

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

## ADDED Requirements

### Requirement: Stable publication requires candidate-specific owner approval

Before stable publication the owner SHALL attest to the qualified inventory and its exact-artifact acceptance receipt, record the real VPS and Cloudflare deployment and coordinated restore outcomes under the existing verification checklist, disposition residual risks and approve that candidate explicitly. Local preparation SHALL produce a handoff identifying completed checks and outstanding owner steps. A rebuilt set SHALL require its own evidence.

#### Scenario: Only local verification is complete

- **WHEN** the candidate passes both local runtimes but the owner has not completed real deployment and restore verification or approved the inventory
- **THEN** the handoff identifies the outstanding checks and stable publication remains pending

#### Scenario: Owner approves the rehearsed candidate

- **WHEN** both deployment paths and restores have been verified and the owner approves the matching source and inventory digest
- **THEN** the owner may publish those saved bytes and finalize the regular GitHub release after independent registry verification
