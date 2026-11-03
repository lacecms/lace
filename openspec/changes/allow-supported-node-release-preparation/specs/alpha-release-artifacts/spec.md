## MODIFIED Requirements

### Requirement: Preparation produces an auditable recoverable inventory
Local preparation SHALL use Node `>=24.12.0`, exact pnpm `12.3.4` and the frozen dependency lockfile. It SHALL record the actual Node and pnpm versions in preparation evidence and SHALL distinguish eligibility from tested compatibility. Preparation SHALL record one source revision for the package/image set and produce a machine-readable inventory of package names/versions/archive checksums and image coordinates/platforms/local identifiers or archive checksums. It SHALL distinguish a successful complete set from a partial or failed run and SHALL not overwrite a completed output set implicitly. Independent preparations SHALL use distinct output locations or refuse a collision. A release-eligible inventory SHALL require a clean reviewed source revision; a dirty working-tree preview SHALL be explicitly marked ineligible for publication. Local image identifiers SHALL NOT be described as remote registry digests. Existing inventories and historical evidence SHALL remain readable and unchanged.

#### Scenario: Compatible newer Node
- **WHEN** local preparation starts with Node `24.22.1` or a later eligible stable version and pnpm `12.3.4`
- **THEN** the version gate accepts it, records the actual versions in preparation evidence and continues through the remaining preparation checks without claiming the newer version was compatibility tested

#### Scenario: Toolchain below minimum or wrong pnpm
- **WHEN** local preparation starts with Node below `24.12.0` or pnpm other than `12.3.4`
- **THEN** it fails with actionable toolchain guidance before claiming the output destination

#### Scenario: Complete clean preparation
- **WHEN** packages and every selected image platform are successfully prepared from the same clean source revision
- **THEN** the inventory records their versions, checksums, platforms and revision and reports preparation success

#### Scenario: Failure or concurrent output collision
- **WHEN** preparation fails midway or another run already owns the output destination
- **THEN** no complete inventory is advertised and the operator receives an actionable retry or distinct-output instruction

#### Scenario: Working-tree preview
- **WHEN** a contributor explicitly prepares uncommitted changes for local verification
- **THEN** the inventory labels the set as a preview and publication-ineligible rather than claiming it represents the reviewed Git revision
