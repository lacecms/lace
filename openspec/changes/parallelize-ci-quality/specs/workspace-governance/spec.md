## MODIFIED Requirements

### Requirement: Consistent local and CI quality gates

The repository SHALL provide root commands for the documented build, typecheck,
lint, test, and OpenSpec validation gates. CI SHALL install with the committed
lockfile and execute those same root commands, format checking, and lockfile and
cache-integrity checks. CI MAY execute the constituent test suites in separate
jobs when their combined coverage matches the root test command. The strict
OpenSpec validation command SHALL validate all active and accepted specifications
without interactive prompts. The root lint command SHALL fail when Oxlint
reports any warning in any workspace member.

CI SHALL expose one aggregate `CI / quality` check that passes only after all
required jobs succeed. Independent checks SHALL run without depending on the
success of unrelated checks. Jobs that consume workspace build outputs SHALL
use the outputs from the same workflow run. Retrying a failed test job SHALL
allow it to reuse a successful build from an earlier attempt of that run.

#### Scenario: CI quality gate

- **WHEN** a pull request or push triggers the repository CI workflow
- **THEN** CI uses the exact pinned Node and pnpm baseline, performs a frozen-lockfile installation, and fails if any required local quality command fails

#### Scenario: Invalid specification

- **WHEN** an active or accepted OpenSpec artifact violates strict validation rules
- **THEN** the root OpenSpec validation command and CI fail with the validation result

#### Scenario: Lint warning is introduced

- **WHEN** a change leaves an unused variable or any other Oxlint warning in a workspace member
- **THEN** the root lint command fails naming the file and rule

#### Scenario: Test suites are partitioned

- **WHEN** CI runs the test gate through parallel jobs
- **THEN** each source, packaged, and root test selected by the local root test command belongs to exactly one test partition and runs with the same assertions and fixtures

#### Scenario: One test partition fails

- **WHEN** one test partition fails and the developer retries its job in the same run
- **THEN** other test partitions finish independently, the failed partition and aggregate check run again, and successful prerequisites and independent quality jobs retain their results

#### Scenario: A required job fails or is skipped

- **WHEN** a required job fails, is cancelled, or is skipped
- **THEN** the aggregate quality check cannot report success

#### Scenario: A job needs built outputs

- **WHEN** a job consuming workspace build outputs runs or retries after the build job succeeded
- **THEN** it uses the outputs of that build for the same checked-out revision and does not rebuild the workspace
