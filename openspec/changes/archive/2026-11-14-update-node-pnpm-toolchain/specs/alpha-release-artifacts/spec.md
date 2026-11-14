## MODIFIED Requirements

### Requirement: Preparation produces an auditable recoverable inventory
Local preparation SHALL run on Node whose major version is 24 or later, with pnpm 12 or later and the frozen dependency lockfile. It SHALL reject an older or unparseable Node version or an older or unparseable pnpm version before claiming the output destination. An eligible Node newer than the tested CI/Docker baseline SHALL NOT be described as compatibility tested. Preparation SHALL record one source revision for the package/image set, and produce a machine-readable inventory of package names/versions/archive checksums and image coordinates/platforms/local identifiers or archive checksums. It SHALL distinguish a successful complete set from a partial or failed run and SHALL not overwrite a completed output set implicitly. Independent preparations SHALL use distinct output locations or refuse a collision. A release-eligible inventory SHALL require a clean reviewed source revision; a dirty working-tree preview SHALL be explicitly marked ineligible for publication. Local image identifiers SHALL NOT be described as remote registry digests.

#### Scenario: Eligible Node
- **WHEN** local preparation starts with Node `24.12.0`, `24.22.1` or a later major version and pnpm `12.3.4`, `12.3.5` or a later major version
- **THEN** the toolchain gate accepts it and preparation continues with its remaining checks

#### Scenario: Ineligible toolchain
- **WHEN** local preparation starts with Node `23.11.0`, an unparseable Node version or pnpm `11.9.9` or an unparseable pnpm version
- **THEN** it fails with guidance naming Node 24 or later and pnpm 12 or later, and the output destination is not claimed

#### Scenario: Complete clean preparation
- **WHEN** packages and every selected image platform are successfully prepared from the same clean source revision
- **THEN** the inventory records their versions, checksums, platforms and revision and reports preparation success

#### Scenario: Failure or concurrent output collision
- **WHEN** preparation fails midway or another run already owns the output destination
- **THEN** no complete inventory is advertised and the operator receives an actionable retry or distinct-output instruction

#### Scenario: Working-tree preview
- **WHEN** a contributor explicitly prepares uncommitted changes for local verification
- **THEN** the inventory labels the set as a preview and publication-ineligible rather than claiming it represents the reviewed Git revision
