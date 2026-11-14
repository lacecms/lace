# Alpha Release Artifacts

## Purpose

Defines the coherent experimental Lace package and container artifacts that operators can prepare locally and later publish without depending on an engine checkout in consumer projects.

## Requirements

### Requirement: Release coordinates form one compatible release set
The release definition `release/alpha.json` SHALL identify an exact prerelease version, generator version, ownership template version, npm channel, public package names, API/builder image coordinates and platforms, source repository and the prerelease versions already published. Every version recorded as published SHALL remain recorded and immutable. The candidate SHALL include every public package, including `@lacecms/mcp`, with npm channel `next`, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults, block-registry package requirements and the versioned installation commands in delivered consumer guides SHALL match the candidate. The selected ownership template version SHALL match the generator and upgrade metadata. Advancing ownership guidance SHALL NOT implicitly select or publish a new package/image prerelease; a new candidate is selected only by an explicit release session. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

The release contract SHALL accept exact `alpha.N` and `rcN` prerelease spellings (for example `0.1.0-rc1`), reject malformed or conflicting coordinates, keep verifying saved inventories of published versions, and never silently rename the candidate or move `latest`.

#### Scenario: Matching release metadata
- **WHEN** all selected package, template, guide and image settings agree with the release definition
- **THEN** preparation identifies the complete compatible set with its source revision and next channel

#### Scenario: Incomplete or mismatched graph
- **WHEN** a consumer runtime dependency has another Lace version or depends on a private workspace member
- **THEN** preparation fails with the affected dependency before reporting a complete artifact set

#### Scenario: Published version reused
- **WHEN** the release definition's candidate version equals a version recorded as already published
- **THEN** validation fails before any build or pack and the published artifacts are left unchanged

#### Scenario: Stale delivered coordinates
- **WHEN** a generated dependency, image default, runtime image version default, block-registry requirement or versioned guide command still names a different prerelease
- **THEN** validation fails and identifies the stale coordinate instead of rewriting files

#### Scenario: Requested release candidate spelling
- **WHEN** coherent unpublished coordinates select a version such as `0.1.0-rc1`
- **THEN** preparation accepts the version and finalization derives tag `v0.1.0-rc1` without changing npm channel `next`

### Requirement: Packed artifacts are complete external packages
Packed public packages SHALL contain resolvable compiled ESM exports and declarations, declared executable entry points where applicable, checked-in database migrations where required, the generator's complete classified templates, and, in the Cloudflare platform package, the compiled admin application of the same source revision in its packaged admin directory. All packed Lace dependency references SHALL resolve to the exact release version; packed third-party dependencies SHALL resolve to concrete registry-compatible versions. Packed dependency metadata SHALL NOT contain `workspace:`, `catalog:`, source-checkout paths or test-only tarball overrides. Packed export maps SHALL NOT contain the repository's `@lacecms/source` export condition or any export target outside compiled output and declared data files; release preparation SHALL remove the condition from the staged manifest so that each packed export map equals the repository export map without it. Archives SHALL exclude credentials, local runtime data, test fixtures, editable admin source and node_modules.

#### Scenario: External archive use
- **WHEN** an operator inspects and extracts the prepared archives outside the engine checkout
- **THEN** declared exports, CLI executables, migration inventory, template assets and packaged admin assets are present and dependency metadata resolves through the public registry

#### Scenario: Missing asset or local dependency
- **WHEN** an archive omits a declared entry point, migration or the packaged admin entry document, or references a workspace/local acceptance artifact
- **THEN** verification fails with the package and missing or invalid item identified

#### Scenario: Source condition is removed before packing
- **WHEN** release preparation stages a package whose repository exports
  declare `@lacecms/source` conditions, including a subpath whose remaining condition
  is only `default`
- **THEN** the packed manifest has no `@lacecms/source` key at any depth, the
  single-`default` export collapses to its target string, and archive
  verification passes

#### Scenario: A source path reaches an archive manifest
- **WHEN** an archive's manifest still exports a path under `src/`
- **THEN** archive verification fails naming the package and the invalid
  export path

### Requirement: Runtime images ship compatible compiled applications
The prepared API image SHALL include the matching compiled admin assets, API, dispatcher, migration capability, bucket initializer and runtime dependency graph. The builder image SHALL include its fixed-command compiled service and pinned consumer-build toolchain. Images SHALL retain generated-project configuration mounts, persistent storage interfaces, explicit migrations and existing fixed-command build semantics. Final image filesystems SHALL exclude registry credentials, local data, Git history, application test fixtures and editable admin source. Supported platforms SHALL be listed explicitly; preparation SHALL build and smoke-test `linux/amd64` and `linux/arm64` separately before claiming both. Image version/source metadata SHALL agree with the artifact inventory.

#### Scenario: Prepared runtime inspection and smoke
- **WHEN** each declared platform image is inspected and exercised with the generated configuration interfaces
- **THEN** compiled entry points, admin assets, migrations and required native dependencies work for that platform and report matching release metadata

#### Scenario: Platform preparation failure
- **WHEN** a declared image platform fails its build or runtime smoke check
- **THEN** preparation fails and identifies the platform without recording unsupported coverage as successful

### Requirement: Preparation produces an auditable recoverable inventory
Local preparation SHALL run on Node whose major version is 24 or later, with pnpm 12 or later and the frozen dependency lockfile. It SHALL reject an older or unparseable Node version or an older or unparseable pnpm version before claiming the output destination. An eligible Node newer than the tested CI/Docker baseline SHALL NOT be described as compatibility tested. Preparation SHALL record one source revision for the package/image set, and produce a machine-readable inventory of package names/versions/archive checksums and image coordinates/platforms/local identifiers or archive checksums. It SHALL distinguish a successful complete set from a partial or failed run and SHALL not overwrite a completed output set implicitly. Independent preparations SHALL use distinct output locations or refuse a collision. A release-eligible inventory SHALL require a clean reviewed source revision; a dirty working-tree preview SHALL be explicitly marked ineligible for publication. Local image identifiers SHALL NOT be described as remote registry digests.

#### Scenario: Eligible Node
- **WHEN** local preparation starts with Node `24.12.0`, `24.22.1` or a later major version and pnpm `12.3.4`, `12.3.5` or a later major version
- **THEN** the toolchain gate accepts it and preparation continues with its remaining checks

#### Scenario: Ineligible toolchain
- **WHEN** local preparation starts with Node `23.11.0`, an unparseable Node version or pnpm `11.9.9` or an unparseable pnpm version
- **THEN** it fails with guidance naming Node 24 or later and pnpm 12 or later, and the output destination is not claimed

#### Scenario: Complete clean preparation
- **WHEN** packages and every selected image platform are successfully prepared from the same clean source revision
- **THEN** the inventory records their versions, checksums, platforms and revision and reports preparation success

#### Scenario: Failure or concurrent output collision
- **WHEN** preparation fails midway or another run already owns the output destination
- **THEN** no complete inventory is advertised and the operator receives an actionable retry or distinct-output instruction

#### Scenario: Working-tree preview
- **WHEN** a contributor explicitly prepares uncommitted changes for local verification
- **THEN** the inventory labels the set as a preview and publication-ineligible rather than claiming it represents the reviewed Git revision

### Requirement: Publication is a separate owner-operated action
Build, pack, inspection and dry-run procedures SHALL NOT publish npm packages, push images, create remote releases or change registry visibility. The release guide SHALL list prerequisites, local verification commands, exact artifact inventory, package publication in dependency order with public access and `next`, matching image publication and public visibility, and incomplete-publication recovery. It SHALL require rechecking authorization and availability of unscoped `create-lace` before a publication and stop on a conflicting owner. Credentials SHALL be supplied through the operator's registry authentication outside artifacts and generated files. The guide SHALL distinguish artifact preparation, exact-artifact consumer and security acceptance, and an actual public release.

#### Scenario: Preparation without authentication
- **WHEN** a contributor runs preparation or its dry-run without npm/GHCR publishing credentials
- **THEN** no remote mutation is attempted and local artifacts or a plan are produced

#### Scenario: Generator name has another owner
- **WHEN** the owner checks `create-lace` and the name is occupied without publishing permission
- **THEN** publication stops and requires an explicitly reviewed naming/template adjustment instead of silently claiming the name

#### Scenario: Partial public publication
- **WHEN** the owner successfully publishes only part of the reviewed set
- **THEN** the guide directs them to verify existing immutable artifacts and resume missing items without overwriting versions or announcing the set as complete

### Requirement: GitHub finalization preserves artifact identity and evidence
A separate owner-operated GitHub release command SHALL default to a read-only plan and SHALL require explicit apply to create or publish a release. It SHALL derive repository, version and source revision from a verified complete publication-eligible inventory and accepted exact-artifact evidence. The release tag SHALL be `v<artifact-version>` and SHALL resolve to the artifact source commit already available in the remote source repository, not the operator's current HEAD. An existing different tag or conflicting release SHALL cause refusal without overwriting it.

Finalization SHALL verify every immutable npm version in the selected inventory and both multi-platform images against the selected inventory, independently of local receipt existence and the current npm dist-tag. Partial publication, authentication failure or unavailable verification SHALL prevent final publication. It SHALL create or resume a matching draft, attach allowlisted inventory, acceptance and complete npm/image publication JSON reports, verify remote attachment bytes and then publish it as a prerelease without marking it latest. It SHALL never rebuild, repack, publish npm packages, push images or force-move tags. Matching reruns SHALL be idempotent; conflicting published bodies/assets SHALL be reported rather than silently replaced. Local reports SHALL record the remote release URL, tag/commit and verified attachment hashes.

Attachments SHALL contain reviewed public evidence only, preserving source identity and original acceptance facts. Environment files, credentials, private logs and arbitrary files SHALL never be uploaded. Acceptance output SHALL have a durable machine-readable file under the selected artifact directory after successful acceptance and cleanup of the temporary test environment; failed runs SHALL NOT produce a success receipt.

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

### Requirement: A selected candidate is ready only with its own fresh evidence
A selected candidate SHALL be declared publication-ready only after its clean reviewed shipping revision passes full workspace and root tests, MCP compatibility checks, root typecheck, Oxlint, Oxfmt, generated OpenAPI verification, strict OpenSpec validation, documentation checks/build/variants and the existing dependency/license audit policy. Explicitly dispositioned advisories SHALL remain visible in the evidence; new audit exceptions SHALL NOT be silently accepted or described as zero vulnerabilities. That revision, built with the pinned toolchain, SHALL produce a complete inventory of every public package archive and both API/builder images for `linux/amd64` and `linux/arm64`, followed by independent saved-artifact verification and fresh exact-artifact acceptance on generated Node and local Cloudflare consumers.

Evidence SHALL identify the source revision/fingerprint, inventory path and SHA-256, package hashes, image identifiers, harness revision, commands/results and actual platform/runtime coverage. Source-only tests, saved-artifact acceptance, platform coverage and real VPS/Cloudflare deployment SHALL be identified separately; local image identifiers SHALL NOT be called registry digests. Evidence of another candidate SHALL NOT establish this candidate's acceptance. Release notes and upgrade guidance SHALL describe the changes since the previous published release, the actual forward migrations, coordinated package/image/source adoption and backup-based rollback without promising a package-only downgrade or claiming a migration that is not shipped.

Preparation SHALL NOT publish npm packages, push images, create GitHub tags/drafts/releases, deploy remotely or delete historical release state. The handoff SHALL identify the exact saved bytes, source, evidence and commands for the owner's later publication; missing publishing authentication SHALL be recorded as an owner prerequisite without preventing credential-free local preparation. Missing or failing checks SHALL leave readiness incomplete with sanitized diagnostics, and any rebuilt set SHALL use a distinct output. Existing per-artifact locks and collision refusal SHALL remain enforced.

#### Scenario: Complete candidate prepared
- **WHEN** source gates, both-platform preparation, independent verification and saved-artifact acceptance succeed for the selected candidate
- **THEN** the handoff identifies the exact ready inventory and acceptance evidence, with owner publication and real-deployment prerequisites listed separately

#### Scenario: Evidence of another candidate offered
- **WHEN** only an earlier candidate's inventory, receipts or source-only test results are available
- **THEN** they remain historical or source-only evidence and the selected candidate's acceptance remains outstanding

#### Scenario: A required check fails
- **WHEN** a source gate, image platform smoke, verification or exact-artifact journey fails
- **THEN** readiness remains incomplete, diagnostics are retained and no success receipt is written

#### Scenario: Publishing permissions are unavailable
- **WHEN** read-only registry checks cannot establish npm or GHCR publishing rights
- **THEN** local credential-free preparation continues and the handoff records authenticated rights checks as a prerequisite for publication

#### Scenario: Concurrent operation
- **WHEN** preparation or publication already owns the selected artifact lock or the output already contains a saved set
- **THEN** another operation refuses without replacing the saved set or bypassing the lock

### Requirement: Release prose is concise and comes from one changelog entry
The repository SHALL maintain a root changelog with one uniquely identifiable entry per documented release version. The same entry SHALL supply the corresponding GitHub Release description, allowing only link normalization needed for GitHub rendering. Entries SHALL name the important user-visible changes, incompatibilities and required upgrade actions in clear, concise language. Routine internal work, task identifiers, test counts, checksums and detailed acceptance logs SHALL stay outside release prose. The editorial target SHALL be 3–6 single-sentence bullets and normally 60–120 words; completeness and readability SHALL take priority over a mechanical word limit. Detailed compatibility/migration instructions SHALL remain linked permanent documentation. Entries SHALL NOT imply publication or deployment verification from preparation alone.

#### Scenario: A release is described briefly
- **WHEN** a release's notes are written to the changelog
- **THEN** the entry covers its important user-visible changes and coordinated upgrade requirements without duplicating the acceptance report

#### Scenario: Important upgrade action needs detail
- **WHEN** a change requires coordinated packages or a migration/rollback procedure
- **THEN** the short entry explicitly names the action and links to the full procedure rather than omitting it to meet a word target

#### Scenario: Missing or ambiguous entry
- **WHEN** the selected version has no changelog entry or has duplicate entries
- **THEN** GitHub release finalization refuses before any remote mutation
