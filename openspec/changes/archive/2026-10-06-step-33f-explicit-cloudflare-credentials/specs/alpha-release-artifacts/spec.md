## MODIFIED Requirements

### Requirement: Alpha coordinates form one compatible release set
The release SHALL identify an exact prerelease version, generator version, template version, npm channel, public package names, API/builder image coordinates, source revision and the prerelease versions already published. The first prepared set used package/generator/image version `0.1.0-alpha.1` and template `0.4.0`; the current candidate SHALL use package/generator/image version `0.1.0-alpha.2` and the current ownership template version selected in `release/alpha.json`, with npm channel `next`, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults and the versioned installation commands in delivered consumer guides SHALL match the candidate. The template version SHALL agree with generator inventory and upgrade metadata; source-template advances SHALL NOT imply publication or replacement of immutable package/image versions. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

#### Scenario: Matching release metadata
- **WHEN** all selected package, template, guide and image settings agree with the release definition
- **THEN** preparation identifies the complete compatible set with its source revision and alpha channel

#### Scenario: Incomplete or mismatched graph
- **WHEN** a consumer runtime dependency has another Lace version or depends on a private workspace member
- **THEN** preparation fails with the affected dependency before reporting a complete artifact set

#### Scenario: Published version reused
- **WHEN** the release definition's candidate version equals a version recorded as already published
- **THEN** validation fails before any build or pack and the published artifacts are left unchanged

#### Scenario: Stale delivered coordinates
- **WHEN** a generated dependency, image default, runtime image version default or versioned guide command still names a different prerelease
- **THEN** validation fails and identifies the stale coordinate instead of rewriting files
