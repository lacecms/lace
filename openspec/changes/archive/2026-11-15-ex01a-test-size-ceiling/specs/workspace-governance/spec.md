## ADDED Requirements

### Requirement: Workspace source and test files stay within a size limit through a shrinking baseline

The boundary checker SHALL fail when a covered file exceeds 1,000 physical lines, including blank lines and without counting a final newline as an extra line. A covered file is a production source file already scanned under a workspace member's `src/`, a `*.test.ts`, `*.test.tsx`, `*.type-test.ts` or `*.type-test.tsx` file under that root, or a `*.test.js`, `*.test.cjs` or `*.test.mjs` file under that root, including packaged-output tests. Non-test helpers under `src/test-support/` and tests outside workspace members' `src/` trees remain outside the size check. Test coverage by the size check SHALL leave the dependency graph, layout, JavaScript allowlist and typecheck exception rules intact.

A covered file above the limit SHALL pass only when `scripts/oversized-source-baseline.json` lists it with a recorded line count and the file is at or under that count. A baseline entry SHALL fail the check, naming the entry, when the file is absent, is outside the covered paths or is within the limit. A repository without the baseline file SHALL be checked against an empty baseline. Architecture §6 and `AGENTS.md` SHALL document the source layout convention and limit, including domain directories, entry points at the `src/` root, one responsibility per file, no subdirectory barrels and tests beside their module.

#### Scenario: File reaches the limit

- **WHEN** a covered production source file or test file has exactly 1,000 physical lines and has no baseline entry
- **THEN** the size check passes

#### Scenario: New oversized file

- **WHEN** a covered production source file, workspace test, type test or packaged-output test reaches 1,001 physical lines and has no baseline entry
- **THEN** the size check fails naming the file, its current count and the limit

#### Scenario: Baselined file grows

- **WHEN** a covered file listed in the baseline grows past its recorded line count
- **THEN** the size check fails naming the file, its recorded count and its current count

#### Scenario: Baselined file shrinks but stays oversized

- **WHEN** a covered file loses lines and stays above 1,000 lines at or below its recorded count
- **THEN** the size check passes

#### Scenario: Split leaves a stale baseline entry

- **WHEN** a baselined file is deleted, moves outside the covered paths or is reduced to 1,000 lines or fewer while its baseline entry remains
- **THEN** the size check fails naming the stale entry

#### Scenario: Standalone verification or test-support helper exceeds the limit

- **WHEN** a non-test helper under `src/test-support/` or a standalone verification test outside workspace member source roots exceeds 1,000 lines
- **THEN** the size check passes without a baseline entry

## REMOVED Requirements

### Requirement: Production source files stay within a size limit through a shrinking baseline

**Reason**
The production-only rule exempts workspace test files. The workspace source and test rule preserves the production guarantees and narrows the exemption to the uncovered paths.

**Migration**
Use the same size baseline for production and workspace test files and split the existing oversized workspace tests. The new scenarios cover production files, workspace tests and paths outside the check.
