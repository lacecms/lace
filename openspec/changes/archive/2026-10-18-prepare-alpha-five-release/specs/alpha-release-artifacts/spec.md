## MODIFIED Requirements

### Requirement: Alpha coordinates form one compatible release set
The release SHALL identify an exact prerelease version, generator version, template version, npm channel, public package names, API/builder image coordinates, source revision and the prerelease versions already published. The first prepared set used package/generator/image version `0.1.0-alpha.1` and template `0.4.0`; the second, `0.1.0-alpha.2` with template `0.14.0`, is published. Alpha.3 (`0.1.0-alpha.3`, template `0.17.0`) also has a recorded npm publication. Alpha.4 (`0.1.0-alpha.4`) also has a recorded publication. All four versions SHALL be recorded as published and remain immutable. The current local candidate SHALL use package/generator/image version `0.1.0-alpha.5` and ownership template `0.29.0` selected in `release/alpha.json`, with npm channel `next`, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults, block-registry package requirements and the versioned installation commands in delivered consumer guides SHALL match the candidate. The selected ownership template version SHALL match the generator and upgrade metadata. Advancing ownership guidance SHALL NOT implicitly select or publish a new package/image prerelease; a new candidate is selected only by an explicit release session. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

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

### Requirement: Alpha five readiness requires fresh acceptance evidence
Alpha.5 SHALL be declared publication-ready only after its selected source passes full workspace tests, root tests, typecheck, lint, formatting, generated OpenAPI verification, strict OpenSpec validation and the existing dependency/license audit policy. Explicitly dispositioned tooling advisories SHALL remain visible in the evidence and SHALL NOT be described as zero vulnerabilities or silently waived. A clean reviewed source revision SHALL produce a complete inventory of all fifteen public package archives and both API/builder images for `linux/amd64` and `linux/arm64`. Independent verification and exact-artifact consumer acceptance SHALL pass against that inventory. Release notes SHALL describe CE1–CE9 changes, relevant public-contract changes, upgrade/migration steps and backup/rollback boundaries for Node and Cloudflare. Historical alpha.4 acceptance or owner deployment evidence SHALL NOT substitute for alpha.5 artifact acceptance or be presented as alpha.5 deployment verification. Any required owner-operated checks still outstanding SHALL be reported explicitly. Preparation completion SHALL NOT imply authorization to publish or deploy.

#### Scenario: Candidate evidence is complete
- **WHEN** the clean alpha.5 source and its exact package/image inventory pass all required checks
- **THEN** the readiness report identifies the source revision, inventory, verification and acceptance evidence, remaining owner checks and separate publication decision

#### Scenario: Old or partial evidence
- **WHEN** the candidate reuses alpha.4 artifacts, lacks a required platform, has failing checks or has no exact-artifact acceptance result
- **THEN** readiness reports the missing or failed evidence and does not announce alpha.5 as publication-ready
