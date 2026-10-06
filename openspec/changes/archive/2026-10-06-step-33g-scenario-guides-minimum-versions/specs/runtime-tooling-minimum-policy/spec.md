## Purpose

Defines minimum Node and pnpm prerequisites separately from reproducibility pins and the evidence required to claim tested compatibility with additional major versions.

## ADDED Requirements

### Requirement: Delivered engine declarations enforce minimums only
The repository root and generated CMS manifests SHALL declare Node `>=24.12.0` and pnpm `>=12`. Every public Lace package, including create-lace, SHALL declare Node `>=24.12.0`; any delivered pnpm engine declaration SHALL use `>=12`. Current compatibility, handoff and generated guidance SHALL state these minimums without the former `<25` or `<13` caps. Release validation SHALL reject a stale or inconsistent minimum declaration. Historical immutable artifacts and acceptance records SHALL retain their original declarations.

#### Scenario: Current manifest graph
- **WHEN** current source manifests and generated projects in every site mode are inspected
- **THEN** their engine declarations use the specified minimum-only ranges and no current release package has the former upper bound

#### Scenario: Stale package declaration
- **WHEN** one current public package declares `>=24.12.0 <25` or a generated CMS declares `>=12 <13`
- **THEN** release or generated-contract validation fails before claiming coherent artifact preparation

### Requirement: Minimum eligibility is distinct from tested compatibility
The compatibility document and generated entry guidance SHALL distinguish minimum engine eligibility from tested versions. Existing CI/Docker toolchain pins, packageManager and dependency lockfiles SHALL remain exact and SHALL NOT be changed solely to remove engine upper bounds. New majors SHALL enter the documented tested matrix only after a recorded frozen-install, native SQLite loading, CLI/generation/doctor, site-build and relevant runtime smoke check. Accepting a newer version against a minimum SHALL NOT be advertised as runtime or real-account verification. The published dependency engine requirements SHALL be checked and recorded before claiming the minimum; an actual incompatibility SHALL stop implementation for planning revision.

#### Scenario: Newer major satisfies declarations
- **WHEN** a newer Node or pnpm major satisfies the minimums but has not completed compatibility verification
- **THEN** documentation describes it as eligible and unverified, and retains the existing tested/pinned baseline

#### Scenario: Compatibility evidence added
- **WHEN** a newer major completes the documented matrix checks
- **THEN** its exact version, environment, date and successful scope are recorded without changing minimums or unrelated reproducibility pins
