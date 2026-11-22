# runtime-tooling-minimum-policy Specification

## Purpose

Defines minimum Node and pnpm prerequisites separately from reproducibility pins and the evidence required to claim tested compatibility with additional major versions.

## Requirements

### Requirement: Delivered engine declarations enforce minimums only
The repository root and generated CMS manifests SHALL declare Node `>=24.12.0` and pnpm `>=12`. Every public Lace package, including create-lace, SHALL declare Node `>=24.12.0`; any delivered pnpm engine declaration SHALL use `>=12`. Current compatibility, handoff and generated guidance SHALL state these minimums without the former `<25` or `<13` caps. Release validation SHALL reject a stale or inconsistent minimum declaration. Historical immutable artifacts and acceptance records SHALL retain their original declarations.

#### Scenario: Current manifest graph
- **WHEN** current source manifests and generated projects in every site mode are inspected
- **THEN** their engine declarations use the specified minimum-only ranges and no current release package has the former upper bound

#### Scenario: Stale package declaration
- **WHEN** one current public package declares `>=24.12.0 <25` or a generated CMS declares `>=12 <13`
- **THEN** release or generated-contract validation fails before claiming coherent artifact preparation

### Requirement: Minimum eligibility is distinct from tested compatibility
The compatibility document and generated entry guidance SHALL distinguish minimum engine eligibility from tested versions. Local development and API/builder image stages SHALL use Node 24.22.3. pnpm requirements SHALL accept versions 12 or later where tooling supports ranges; exact package manager versions SHALL remain only where required by tooling or selected for a reproducible CI run. Frozen dependency lockfiles SHALL remain enforced. New majors SHALL enter the documented tested matrix only after a recorded frozen-install, native SQLite loading, CLI/generation/doctor, site-build and relevant runtime smoke check. Accepting a newer version against a minimum SHALL NOT be advertised as runtime or real-account verification. The published dependency engine requirements SHALL be checked and recorded before claiming the minimum; an actual incompatibility SHALL stop implementation for planning revision.

#### Scenario: Newer major satisfies declarations
- **WHEN** a newer Node or pnpm major satisfies the minimums but has not completed compatibility verification
- **THEN** documentation describes it as eligible and unverified, and records only the versions actually tested

#### Scenario: Compatibility evidence added
- **WHEN** a newer major completes the documented matrix checks
- **THEN** its exact version, environment, date and successful scope are recorded without changing minimums or unrelated reproducibility pins

#### Scenario: Docker runtime baseline
- **WHEN** local development and VPS API/builder image stages are inspected
- **THEN** every Node base image uses 24.22.3

### Requirement: Release builds use a coherent pnpm toolchain

The root package manager, repository CI jobs that install the workspace, API build stage and builder build and runtime stages SHALL select pnpm `12.21.0`. The CI store cache key SHALL distinguish the pnpm version and lockfile hash. Disposable acceptance projects SHALL resolve the exact workspace pin for installs and nested commands. Generated project manifests in every site mode SHALL declare `engines.pnpm: ">=12"` and omit both `packageManager` and `devEngines.packageManager`.

#### Scenario: Workspace install reproduces the reviewed resolutions

- **WHEN** a clean checkout installs with pnpm `12.21.0` and the frozen workspace lockfile
- **THEN** installation succeeds without modifying the lockfile, and the installed Vite 8 dependencies and their peer contexts agree with the reviewed catalog and override resolutions

#### Scenario: A previous store cache exists

- **WHEN** CI computes the store key for the upgraded workspace
- **THEN** the key differs from the `12.3.4` key even for the same OS, Node version and lockfile hash

#### Scenario: A release image drifts from the workspace

- **WHEN** a pnpm install in the API build stage or either builder stage uses a floating or different version
- **THEN** release validation rejects the image definition and identifies the expected workspace pin

#### Scenario: Disposable and operator-generated projects

- **WHEN** acceptance launches a disposable project through Corepack or standalone pnpm
- **THEN** its install and nested commands use `12.21.0`, and the harness fails before the consumer journey if it cannot resolve that version
- **AND** a project generated for an operator continues to accept pnpm versions satisfying its declared minimum

#### Scenario: Generated static-site deployment workflow

- **WHEN** a starter or existing-site project includes the Cloudflare Pages workflow
- **THEN** the workflow selects pnpm `12.21.0` for its frozen installs while the generated manifest retains the operator minimum

### Requirement: The tested pnpm baseline is tied to an accepted build set

Lace SHALL record `12.21.0` as tested only after a frozen workspace install, native SQLite operation, packed starter build, local generated Worker run, successful API and builder image smokes on both `linux/amd64` and `linux/arm64`, and full exact-artifact acceptance of the newly prepared set. The record SHALL identify the verified source and inventory, matching acceptance receipt, date and environments covered.

#### Scenario: A complete build set passes

- **WHEN** the saved archives and platform images verify against the new inventory and the complete consumer journey produces a matching receipt
- **THEN** the compatibility record may list `12.21.0` after the remaining matrix checks pass, identifying the host platform for the full journey and both platforms for image smoke coverage

#### Scenario: Evidence is incomplete or belongs to another build

- **WHEN** any required check fails, a platform is missing, or the receipt identifies a different source fingerprint, package checksums or selected image IDs
- **THEN** the previous tested baseline remains in effect and the incomplete evidence cannot qualify the new set
