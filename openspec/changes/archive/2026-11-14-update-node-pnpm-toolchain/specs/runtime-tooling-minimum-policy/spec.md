## MODIFIED Requirements

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
