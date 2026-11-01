## MODIFIED Requirements

### Requirement: Alpha coordinates form one compatible release set
The release SHALL identify an exact prerelease version, generator version, template version, npm channel, public package names, API/builder image coordinates, source revision and the prerelease versions already published. The first prepared set used package/generator/image version `0.1.0-alpha.1` and template `0.4.0`; the second, `0.1.0-alpha.2` with template `0.14.0`, is published. Alpha.3 (`0.1.0-alpha.3`, template `0.17.0`) also has a recorded npm publication. Alpha.4 also has a recorded publication. All four versions SHALL remain recorded as published and immutable. Alpha.5 (`0.1.0-alpha.5`, template `0.29.0`) and alpha.6 (`0.1.0-alpha.6`, template `0.30.0`) are confirmed published; both SHALL remain recorded as published and immutable, with historical receipts intact. Alpha.7 (`0.1.0-alpha.7`, template `0.35.0`) is confirmed published with its original fifteen-package graph and SHALL remain recorded as published and immutable. Alpha.8 (`0.1.0-alpha.8`, template `0.39.0`) SHALL remain recorded as published and immutable after registry verification. The current local candidate SHALL include all sixteen public packages, including `@lacecms/mcp`, and use package/generator/image version `0.1.0-rc1` and ownership template `0.46.0` selected in `release/alpha.json`, with npm channel `next`, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults, block-registry package requirements and the versioned installation commands in delivered consumer guides SHALL match the candidate. The selected ownership template version SHALL match the generator and upgrade metadata. Advancing ownership guidance SHALL NOT implicitly select or publish a new package/image prerelease; a new candidate is selected only by an explicit release session. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

#### Scenario: Matching release metadata
- **WHEN** all selected package, template, guide and image settings agree with the release definition
- **THEN** preparation identifies the complete compatible set with its source revision and next channel

#### Scenario: Incomplete or mismatched graph
- **WHEN** a consumer runtime dependency has another Lace version or depends on a private workspace member
- **THEN** preparation fails with the affected dependency before reporting a complete artifact set

#### Scenario: Published version reused
- **WHEN** the release definition's candidate version equals a version recorded as already published, such as `0.1.0-alpha.3`
- **THEN** validation fails before any build or pack and the published artifacts are left unchanged

#### Scenario: Stale delivered coordinates
- **WHEN** a generated dependency, image default, runtime image version default, block-registry requirement or versioned guide command still names a different prerelease
- **THEN** validation fails and identifies the stale coordinate instead of rewriting files

The release contract SHALL accept the exact `0.1.0-rc1` spelling alongside historical alpha.N versions, reject malformed or conflicting coordinates, retain historical inventory verification, and never silently rename the candidate or move `latest`.

#### Scenario: Requested release candidate spelling
- **WHEN** coherent unpublished coordinates select `0.1.0-rc1`
- **THEN** preparation accepts the version and finalization derives tag `v0.1.0-rc1` without changing npm channel `next`

## ADDED Requirements

### Requirement: Release candidate one ships the accepted post-alpha-eight source
The rc1 release SHALL include all committed changes after `v0.1.0-alpha.8` through its clean reviewed shipping revision, including completed video presentation, optional MCP publishing, media tags/multi-selection, import credentials and CLI, conditional fields, gallery video items and workspace/documentation hygiene. It SHALL NOT require unimplemented refactoring roadmap work or treat RC naming as proof of stability or real deployment.

Readiness SHALL require full workspace/root tests, MCP compatibility, root typecheck, Oxlint, Oxfmt, generated OpenAPI, strict specifications/change validation, documentation checks/build/variants and the existing dependency/license policy. The complete saved set SHALL contain sixteen public archives and both API/builder images for linux/amd64 and linux/arm64, independent verification and fresh exact-artifact acceptance on generated Node and local Cloudflare consumers. Source-only, artifact, platform and real-deployment coverage SHALL be identified separately. Prior acceptance SHALL NOT substitute for rc1 evidence. Existing locks, collision refusal, credential exclusion and immutable-source/checksum requirements SHALL remain enforced.

Saved-artifact acceptance SHALL exercise separately consented MCP publishing with current role/scope checks and denied publication without the grant; unpublication/deletion denial and revocation; persisted media tags and multi-selection; offline import validation, scoped import with publication and idempotent repeat; conditional requiredness, hidden draft preservation and public omission; gallery images/videos, accessible titles, playback/aspect ratios and safe rendering. Existing recovery, image/cache, internal-link/export and upgrade journeys SHALL remain covered. Upgrade guidance SHALL identify migrations 0014–0015, gallery schema 5, explicit configuration synchronization, coordinated dependencies/images/source adoption and backup-based rollback.

Publication SHALL use only accepted saved bytes, publish all sixteen npm archives on `next`, verify both public two-platform GHCR manifests and then finalize `v0.1.0-rc1` as a GitHub prerelease with the four verified JSON assets and reviewed changelog. The tag SHALL select the artifact source commit. Failures SHALL retain recoverable artifacts/journals, report incomplete status and resume only matching missing publication; conflicting immutable artifacts SHALL never be overwritten.

#### Scenario: Complete candidate released
- **WHEN** all source gates, saved-artifact verification/acceptance and full registry publication succeed
- **THEN** the verified GitHub prerelease names the exact source and exposes inventory, acceptance and complete npm/image reports without marking latest

#### Scenario: MCP authority differs from alpha eight
- **WHEN** a saved Node or Worker consumer grants content:publish with explicit consent
- **THEN** an authorized role can publish, missing/revoked scope is denied, and unpublication/deletion remain unavailable

#### Scenario: Hidden field or gallery regression
- **WHEN** a saved consumer exposes hidden conditional values publicly, loses draft values on toggling or renders unsafe gallery video content
- **THEN** rc1 readiness remains incomplete and no success receipt or completed release is claimed

#### Scenario: Partial publication or failed acceptance
- **WHEN** a required check fails, publication is partial or remote identities cannot be verified
- **THEN** finalization refuses, diagnostics are sanitized and saved artifacts remain available for recovery

#### Scenario: Concurrent operation
- **WHEN** preparation or publication already owns the selected artifact lock
- **THEN** another operation refuses without replacing the saved set or bypassing the lock

