# Alpha Release Artifacts

## Purpose

Defines the coherent experimental Lace package and container artifacts that operators can prepare locally and later publish without depending on an engine checkout in consumer projects.

## Requirements

### Requirement: Alpha coordinates form one compatible release set
The release SHALL identify an exact prerelease version, generator version, template version, npm channel, public package names, API/builder image coordinates, source revision and the prerelease versions already published. The first prepared set used package/generator/image version `0.1.0-alpha.1` and template `0.4.0`; the current candidate SHALL use package/generator/image version `0.1.0-alpha.2` and the ownership template version selected in `release/alpha.json`, with npm channel `next`, npm scope `@lacecms`, generator `create-lace`, and images `ghcr.io/lacecms/api` and `ghcr.io/lacecms/builder`. Preparation SHALL reject a candidate version that is recorded as published, inconsistent versions, missing runtime dependencies and runtime dependencies on private workspace packages. Generated package dependencies, image defaults, runtime image version defaults and the versioned installation commands in delivered consumer guides SHALL match the candidate. The selected ownership template version SHALL match the generator and upgrade metadata. Advancing ownership guidance SHALL NOT implicitly select or publish a new package/image prerelease; Step 33H handles the next alpha candidate. Applications, test-utils and the workspace root SHALL remain private. Selecting an unpublished version SHALL rely on registry metadata checked on a recorded date as availability evidence only, never as a reservation.

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

### Requirement: Packed artifacts are complete external packages
Packed public packages SHALL contain resolvable compiled ESM exports and declarations, declared executable entry points where applicable, checked-in database migrations where required, the generator's complete classified templates, and, in the Cloudflare platform package, the compiled admin application of the same source revision in its packaged admin directory. All packed Lace dependency references SHALL resolve to the exact release version; packed third-party dependencies SHALL resolve to concrete registry-compatible versions. Packed dependency metadata SHALL NOT contain `workspace:`, `catalog:`, source-checkout paths or test-only tarball overrides. Archives SHALL exclude credentials, local runtime data, test fixtures, editable admin source and node_modules.

#### Scenario: External archive use
- **WHEN** an operator inspects and extracts the prepared archives outside the engine checkout
- **THEN** declared exports, CLI executables, migration inventory, template assets and packaged admin assets are present and dependency metadata resolves through the public registry

#### Scenario: Missing asset or local dependency
- **WHEN** an archive omits a declared entry point, migration or the packaged admin entry document, or references a workspace/local acceptance artifact
- **THEN** verification fails with the package and missing or invalid item identified

### Requirement: Runtime images ship compatible compiled applications
The prepared API image SHALL include the matching compiled admin assets, API, dispatcher, migration capability, bucket initializer and runtime dependency graph. The builder image SHALL include its fixed-command compiled service and pinned consumer-build toolchain. Images SHALL retain generated-project configuration mounts, persistent storage interfaces, explicit migrations and existing fixed-command build semantics. Final image filesystems SHALL exclude registry credentials, local data, Git history, application test fixtures and editable admin source. Supported platforms SHALL be listed explicitly; first-alpha preparation SHALL build and smoke-test `linux/amd64` and `linux/arm64` separately before claiming both. Image version/source metadata SHALL agree with the artifact inventory.

#### Scenario: Prepared runtime inspection and smoke
- **WHEN** each declared platform image is inspected and exercised with the generated configuration interfaces
- **THEN** compiled entry points, admin assets, migrations and required native dependencies work for that platform and report matching release metadata

#### Scenario: Platform preparation failure
- **WHEN** a declared image platform fails its build or runtime smoke check
- **THEN** preparation fails and identifies the platform without recording unsupported coverage as successful

### Requirement: Preparation produces an auditable recoverable inventory
Local preparation SHALL use the project-pinned toolchain and frozen dependency lockfile, record one source revision for the package/image set, and produce a machine-readable inventory of package names/versions/archive checksums and image coordinates/platforms/local identifiers or archive checksums. It SHALL distinguish a successful complete set from a partial or failed run and SHALL not overwrite a completed output set implicitly. Independent preparations SHALL use distinct output locations or refuse a collision. A release-eligible inventory SHALL require a clean reviewed source revision; a dirty working-tree preview SHALL be explicitly marked ineligible for publication. Local image identifiers SHALL NOT be described as remote registry digests.

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
Build, pack, inspection and dry-run procedures SHALL NOT publish npm packages, push images, create remote releases or change registry visibility. The release guide SHALL list prerequisites, local verification commands, exact artifact inventory, package publication in dependency order with public access and `next`, matching image publication and public visibility, and incomplete-publication recovery. It SHALL require rechecking authorization and availability of unscoped `create-lace` before the first publication and stop on a conflicting owner. Credentials SHALL be supplied through the operator's registry authentication outside artifacts and generated files. The guide SHALL distinguish 25B preparation from 25C consumer/security acceptance, Step 26 and an actual public release.

#### Scenario: Preparation without authentication
- **WHEN** a contributor runs preparation or its dry-run without npm/GHCR publishing credentials
- **THEN** no remote mutation is attempted and local artifacts or a plan are produced

#### Scenario: Generator name has another owner
- **WHEN** the owner checks `create-lace` and the name is occupied without publishing permission
- **THEN** publication stops and requires an explicitly reviewed naming/template adjustment instead of silently claiming the name

#### Scenario: Partial public publication
- **WHEN** the owner successfully publishes only part of the reviewed set
- **THEN** the guide directs them to verify existing immutable artifacts and resume missing items without overwriting versions or announcing the set as complete
