## ADDED Requirements

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
