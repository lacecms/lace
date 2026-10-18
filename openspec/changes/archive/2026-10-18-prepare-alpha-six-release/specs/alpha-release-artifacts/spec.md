## MODIFIED Requirements

### Requirement: Alpha coordinates form one compatible release set
The release SHALL identify an exact prerelease version, generator version, template version, npm channel, public package names, API/builder image coordinates, source revision and the prerelease versions already published. The first prepared set used package/generator/image version `0.1.0-alpha.1` and template `0.4.0`; the second, `0.1.0-alpha.2` with template `0.14.0`, is published. Alpha.3 (`0.1.0-alpha.3`, template `0.17.0`) also has a recorded npm publication. Alpha.4 also has a recorded publication. All four versions SHALL remain recorded as published and immutable. Alpha.5 (`0.1.0-alpha.5`, template `0.29.0`) has completed local artifact acceptance; its receipts SHALL remain intact, and publication SHALL be recorded only when established by registry evidence or owner confirmation. The current local candidate SHALL use package/generator/image version `0.1.0-alpha.6` and ownership template `0.30.0` selected in `release/alpha.json`, with npm channel `next`, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults, block-registry package requirements and the versioned installation commands in delivered consumer guides SHALL match the candidate. The selected ownership template version SHALL match the generator and upgrade metadata. Advancing ownership guidance SHALL NOT implicitly select or publish a new package/image prerelease; a new candidate is selected only by an explicit release session. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

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

### Requirement: Alpha six preparation has fresh compatibility and acceptance evidence
The alpha.6 handoff SHALL describe changes since alpha.5, including tolerant public reads, export format version 1, version-bound paginated export and confirmed draft-media detachment. It SHALL identify the raw export response change and require coordinated API, SDK, site and builder upgrades. It SHALL document explicit migration and matching backup/rollback boundaries for Node and Cloudflare without claiming automatic database downgrade. No new migration SHALL be claimed without a corresponding shipped migration.

The candidate SHALL have fresh source checks, a complete clean-source inventory of fifteen package archives and API/builder images for both `linux/amd64` and `linux/arm64`, independent saved-artifact verification and exact-artifact consumer acceptance. Release evidence SHALL include multi-page assembly and publication-version conflict behavior, tolerant contract validation with strict safety boundaries, and authorized draft-media detachment with published-use refusal. Runtime coverage SHALL be stated explicitly. Existing source tests MAY supply focused concurrency coverage; they SHALL NOT be presented as tests of saved artifacts.

The handoff SHALL record source revision/fingerprint, immutable inventory location/checksum, artifact checksums/identifiers, commands/results and remaining owner prerequisites. It SHALL distinguish local image identifiers from registry digests and local acceptance from real VPS/Cloudflare deployments and public publication. A previous candidate's inventory SHALL NOT establish alpha.6 acceptance. Preparation SHALL NOT publish packages, push images, create remote releases or deploy remotely.

#### Scenario: Fresh candidate accepted locally
- **WHEN** source gates, complete two-platform preparation, independent verification and exact-artifact acceptance all pass for alpha.6
- **THEN** the handoff records the exact source and saved artifact evidence and states the remaining real deployment and publication prerequisites separately

#### Scenario: Source or consumer acceptance fails
- **WHEN** a required source gate, image platform smoke or exact-artifact consumer journey fails
- **THEN** preparation is reported as incomplete with retained diagnostics, and any rebuild uses a distinct output rather than replacing a saved set

#### Scenario: Older artifacts offered as evidence
- **WHEN** only alpha.5 inventories and deployment confirmations are available
- **THEN** they remain historical evidence and alpha.6 acceptance remains outstanding

#### Scenario: Publishing permissions are unavailable
- **WHEN** read-only registry checks cannot establish npm or GHCR publishing rights
- **THEN** local credential-free preparation may continue while the handoff records authenticated rights checks as a prerequisite for later publication

#### Scenario: Direct export consumer upgrades
- **WHEN** an operator upgrades a client that reads the raw build-export endpoint
- **THEN** the notes explain page traversal, the required format version, version-change errors and coordinated SDK/API/builder adoption without claiming alpha.5 and alpha.6 raw responses are interchangeable
