## MODIFIED Requirements

### Requirement: Alpha coordinates form one compatible release set
The release SHALL identify an exact prerelease version, generator version, template version, npm channel, public package names, API/builder image coordinates, source revision and the prerelease versions already published. The first prepared set used package/generator/image version `0.1.0-alpha.1` and template `0.4.0`; the second, `0.1.0-alpha.2` with template `0.14.0`, is published. Alpha.3 (`0.1.0-alpha.3`, template `0.17.0`) also has a recorded npm publication. Alpha.4 also has a recorded publication. All four versions SHALL remain recorded as published and immutable. Alpha.5 (`0.1.0-alpha.5`, template `0.29.0`) and alpha.6 (`0.1.0-alpha.6`, template `0.30.0`) are confirmed published; both SHALL remain recorded as published and immutable, with historical receipts intact. The current local candidate SHALL use package/generator/image version `0.1.0-alpha.7` and ownership template `0.35.0` selected in `release/alpha.json`, with npm channel `next`, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults, block-registry package requirements and the versioned installation commands in delivered consumer guides SHALL match the candidate. The selected ownership template version SHALL match the generator and upgrade metadata. Advancing ownership guidance SHALL NOT implicitly select or publish a new package/image prerelease; a new candidate is selected only by an explicit release session. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

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

## ADDED Requirements

### Requirement: Alpha seven preparation includes accepted image delivery and fresh evidence
The alpha.7 candidate SHALL use `0.1.0-alpha.7` for all fifteen public packages and API/builder images, npm channel `next`, and ownership template `0.35.0`. Selection SHALL require checking candidate availability; a conflicting immutable version SHALL stop preparation pending a reviewed coordinate adjustment. Historical artifacts and receipts SHALL remain intact; alpha.6 SHALL enter published history only with registry evidence or owner confirmation.

The handoff SHALL cover changes since alpha.6 including GIF upload, conditional binary delivery, WebP variants and animated GIF conversion, eligible placeholders, optional lightbox, image/gallery links taking precedence over lightbox, upload proxy limits, static cache headers and persistent build caches. It SHALL document coordinated engine/admin/site/builder upgrades, image-service configuration, safe updates to source-owned components and deployment files, content synchronization of image/gallery schemas, explicit forward migrations when present, and matching configuration/database/media/source backups for rollback. It SHALL NOT claim new database migrations without shipped files or imply that downgrading packages reverses synchronized content schemas.

Readiness SHALL require passing full workspace/root tests, typecheck, Oxlint, Oxfmt, generated OpenAPI verification, strict OpenSpec validation, documentation validation/build and the existing dependency/license audit policy. A clean reviewed source revision SHALL produce fifteen package archives and API/builder images for both `linux/amd64` and `linux/arm64`, followed by independent saved-artifact verification and exact-artifact acceptance. Evidence SHALL record source revision/fingerprint, inventory path and SHA-256, package hashes, image identifiers, commands/results, harness revision and actual runtime/platform coverage. Existing source tests SHALL remain distinct from saved-artifact coverage.

Exact-artifact image coverage SHALL establish a valid GIF upload and unchanged original delivery, conditional requests, optimized static output including animated WebP, placeholder inclusion/exclusion, lightbox and link precedence, a VPS upload above the old proxy limit and cache headers on successful hashed assets versus HTML and missing assets. Node and local Cloudflare media coverage SHALL be explicit; Pages configuration checks SHALL NOT be called a real Pages deployment. Repeated-build cache checks SHALL retain atomic publication and failure recovery coverage. Missing, failing or unavailable checks SHALL leave readiness incomplete. Preparation SHALL NOT publish packages, push images, create remote releases, deploy or delete older release sets.

#### Scenario: Complete candidate accepted
- **WHEN** all source gates, both image-platform preparations, verification and exact-artifact journeys pass for the clean alpha.7 source
- **THEN** the handoff identifies the exact evidence and separately lists remaining authenticated publication and real-deployment prerequisites

#### Scenario: Image or cache regression
- **WHEN** an artifact journey loses GIF animation, violates link precedence, rejects an otherwise valid proxied upload or gives immutable headers to missing assets
- **THEN** readiness remains incomplete, diagnostics are retained and any rebuild uses a distinct destination

#### Scenario: Older acceptance offered as proof
- **WHEN** only alpha.6 receipts or source image tests pass
- **THEN** those facts remain historical or source-only evidence and do not establish alpha.7 saved-artifact acceptance

#### Scenario: Conflicting candidate or unverified publication
- **WHEN** alpha.7 is occupied or alpha.6 publication cannot be established
- **THEN** occupied coordinates are never overwritten and uncertain publication is reported without inventing a published-history entry

#### Scenario: Operator rolls back synchronized blocks
- **WHEN** an operator needs to return to alpha.6 after synchronizing the image/gallery schema changes
- **THEN** the guide requires the matching backed-up configuration, content and source components rather than promising a package-only downgrade
