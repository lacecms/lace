## ADDED Requirements

### Requirement: Release image pnpm matches the workspace pin

Every release Docker stage that installs pnpm SHALL select the exact version declared by the Lace workspace's package manager pin. Release model validation SHALL identify any affected Dockerfile that uses a floating or mismatched version.

#### Scenario: Checking image toolchain drift

- **WHEN** `release:check` inspects an otherwise coherent release with a floating or different pnpm version in a release Docker stage
- **THEN** it fails and identifies the affected Dockerfile

### Requirement: Release consumer verification works with a cold metadata cache

Package preparation and exact-artifact acceptance SHALL verify their disposable consumer lockfiles with frozen installs and the existing supply-chain policy checks. With the configured public npm registry reachable, these installs SHALL be able to retrieve the registry metadata they require without a prepopulated pnpm metadata cache.

#### Scenario: Missing cached metadata

- **WHEN** a disposable release consumer's frozen install needs registry metadata absent from the pnpm cache
- **THEN** it retrieves the metadata, verifies the locked versions and continues only if verification succeeds

#### Scenario: Lockfile or policy violation

- **WHEN** the frozen consumer lockfile disagrees with its manifests or a locked package fails the applicable pnpm policy
- **THEN** the stage fails without changing the frozen lockfile or writing a successful release inventory or acceptance receipt for that operation
