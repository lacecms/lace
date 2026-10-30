## MODIFIED Requirements

### Requirement: Alpha coordinates form one compatible release set
The release SHALL identify an exact prerelease version, generator version, template version, npm channel, public package names, API/builder image coordinates, source revision and the prerelease versions already published. The first prepared set used package/generator/image version `0.1.0-alpha.1` and template `0.4.0`; the second, `0.1.0-alpha.2` with template `0.14.0`, is published. Alpha.3 (`0.1.0-alpha.3`, template `0.17.0`) also has a recorded npm publication. Alpha.4 also has a recorded publication. All four versions SHALL remain recorded as published and immutable. Alpha.5 (`0.1.0-alpha.5`, template `0.29.0`) and alpha.6 (`0.1.0-alpha.6`, template `0.30.0`) are confirmed published; both SHALL remain recorded as published and immutable, with historical receipts intact. Alpha.7 (`0.1.0-alpha.7`, template `0.35.0`) is confirmed published with its original fifteen-package graph and SHALL remain recorded as published and immutable. The current local candidate SHALL include all sixteen public packages, adding `@lacecms/mcp`, and use package/generator/image version `0.1.0-alpha.8` and ownership template `0.39.0` selected in `release/alpha.json`, with npm channel `next`, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults, block-registry package requirements and the versioned installation commands in delivered consumer guides SHALL match the candidate. The selected ownership template version SHALL match the generator and upgrade metadata. Advancing ownership guidance SHALL NOT implicitly select or publish a new package/image prerelease; a new candidate is selected only by an explicit release session. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

#### Scenario: Matching release metadata
- **WHEN** all selected package, template, guide and image settings agree with the release definition
- **THEN** preparation identifies the complete compatible set with its source revision and alpha channel

#### Scenario: Incomplete or mismatched graph
- **WHEN** a consumer runtime dependency has another Lace version or depends on a private workspace member
- **THEN** preparation fails with the affected dependency before reporting a complete artifact set

#### Scenario: Published version reused
- **WHEN** the release definition's candidate version equals a version recorded as already published, such as `0.1.0-alpha.3`
- **THEN** validation fails before any build or pack and the published artifacts are left unchanged

#### Scenario: Stale delivered coordinates
- **WHEN** a generated dependency, image default, runtime image version default, block-registry requirement or versioned guide command still names a different prerelease
- **THEN** validation fails and identifies the stale coordinate instead of rewriting files

### Requirement: GitHub finalization preserves artifact identity and evidence
A separate owner-operated GitHub release command SHALL default to a read-only plan and SHALL require explicit apply to create or publish a release. It SHALL derive repository, version and source revision from a verified complete publication-eligible inventory and accepted exact-artifact evidence. The release tag SHALL be `v<artifact-version>` and SHALL resolve to the artifact source commit already available in the remote source repository, not the operator's current HEAD. An existing different tag or conflicting release SHALL cause refusal without overwriting it.

Finalization SHALL verify all immutable npm versions in the selected inventory (sixteen for alpha.8) and both multi-platform images against the selected inventory, independently of local receipt existence and the current npm dist-tag. Partial publication, authentication failure or unavailable verification SHALL prevent final publication. It SHALL create or resume a matching draft, attach allowlisted inventory, acceptance and complete npm/image publication JSON reports, verify remote attachment bytes and then publish it as a prerelease without marking it latest. It SHALL never rebuild, repack, publish npm packages, push images or force-move tags. Matching reruns SHALL be idempotent; conflicting published bodies/assets SHALL be reported rather than silently replaced. Local reports SHALL record the remote release URL, tag/commit and verified attachment hashes.

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

## ADDED Requirements

### Requirement: Alpha eight preparation covers accepted post-alpha-seven behavior
The alpha.8 candidate SHALL use `0.1.0-alpha.8` on `next`, ownership template `0.39.0`, sixteen public package archives including `@lacecms/mcp`, and both API/builder images for `linux/amd64` and `linux/arm64`. Its dated availability checks SHALL cover every selected npm version and both image coordinates. Alpha.7's fifteen packages, images and evidence SHALL remain immutable; the absence of an alpha.7 MCP package SHALL NOT be classified as an incomplete historical release.

The handoff and upgrade guide SHALL cover list layouts and compact media rows, optional YouTube/Vimeo embeds, internal URL links and Link blocks, export format 2, configurable draft collection queries and optional OAuth MCP. They SHALL identify the actual migration delta from alpha.7, coordinated engine/admin/site/builder adoption, source-owned component conflicts, configuration synchronization, and matching configuration/database/media/source backups for rollback. MCP SHALL remain disabled by default; activation SHALL require migrations and explicit environment/deployment configuration, and SHALL retain consent, role/scope attenuation, revocation and the five-tool draft-only ceiling. Publication, unpublication and deletion SHALL remain unavailable through MCP.

Readiness SHALL require full workspace/root tests, MCP compatibility checks, root typecheck, Oxlint, Oxfmt, generated OpenAPI and strict OpenSpec validation, documentation validation/build/variants, and the existing dependency/license audit policy. New audit exceptions SHALL NOT be silently accepted. A clean reviewed source revision using the pinned toolchain SHALL produce a complete two-platform inventory, independent saved-artifact verification and fresh exact-artifact acceptance. Evidence SHALL identify source revision/fingerprint, inventory path/SHA-256, package hashes, image identifiers, harness revision, commands/results, and actual platform/runtime coverage. Historical receipts and source-only tests SHALL NOT be substituted for saved-artifact results.

Exact-artifact acceptance SHALL retain existing release journeys and exercise the new package/runtime graph: persisted list settings and video markup/preview activation; format-2 resolved and unavailable internal-link rendering; configured draft queries without changing published data; MCP disabled behavior and enabled OAuth discovery, consent, SDK initialization/tool invocation, draft-only mutation, denied publication/deletion, role/scope enforcement, revocation and unchanged published export. Node and local Cloudflare coverage SHALL be explicit; Node SHALL include the generated reverse-proxy routes and safe logging contract. Concurrency, replay and bounded D1-query evidence from source tests SHALL remain separately identified when not executed against saved artifacts.

Preparation SHALL NOT publish packages, push images, create GitHub releases, deploy remotely or delete historical sets. Missing or failing gates SHALL leave readiness incomplete, retain actionable sanitized diagnostics and require a distinct output for any rebuilt set. Concurrent operations SHALL retain existing per-artifact lock and collision refusal behavior.

#### Scenario: Complete fresh candidate
- **WHEN** the clean alpha.8 source passes all gates, both image-platform smokes, independent verification and exact-artifact journeys
- **THEN** the handoff identifies the saved sixteen-package set and its acceptance evidence, with publication rights and real deployment checks stated separately

#### Scenario: MCP authority is restricted
- **WHEN** an enabled saved Node or local Worker consumer completes OAuth consent and invokes tools with read-only or draft-write authority
- **THEN** only the five allowed tools are exposed, writes require current authority, publication/deletion remain forbidden, revoked credentials fail and published content remains unchanged

#### Scenario: MCP remains optional
- **WHEN** a fresh saved consumer uses the default environment
- **THEN** MCP remains disabled, ordinary CMS workflows work and setup guidance explains explicit activation after migrations

#### Scenario: Incompatible site or migration state
- **WHEN** an operator upgrades from alpha.7 with an older export client, edited components or pending migrations
- **THEN** guidance requires format-2-compatible packages, reviewed source merges and forward migration before activation, with matching backups for rollback rather than a promised package-only downgrade

#### Scenario: Candidate conflict or incomplete evidence
- **WHEN** a selected immutable coordinate conflicts, a required check fails or saved-artifact coverage is missing
- **THEN** readiness remains incomplete and neither old receipts nor source-only success is presented as alpha.8 artifact acceptance

#### Scenario: Concurrent preparation
- **WHEN** another operation owns the artifact lock or the output already contains a saved set
- **THEN** preparation refuses without replacing files and identifies the lock or distinct-output prerequisite
