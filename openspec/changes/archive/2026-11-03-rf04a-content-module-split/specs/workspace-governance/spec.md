## ADDED Requirements

### Requirement: Production source files stay within a size limit through a shrinking baseline

The boundary checker SHALL fail when a production source file of a workspace member exceeds 1,000 lines. Production source files are the files the checker already scans under each member's `src/`; test files and modules under `src/test-support/` SHALL NOT be counted. A file above the limit SHALL pass only when a committed baseline lists it with a recorded line count and the file is at or under that count. A baseline entry SHALL itself fail the check, naming the entry, when its file no longer exists or is within the limit, so that a split removes its entry in the same change. A repository without a baseline file SHALL be checked against an empty baseline. Architecture section 6 and `AGENTS.md` SHALL document the source layout convention the limit supports: package modules grouped in domain directories with the package entry points at the `src/` root, one responsibility per file, no barrel modules inside subdirectories, and tests beside their module.

#### Scenario: New oversized file
- **WHEN** a contributor adds or grows a production source file to 1,001 lines and the baseline does not list it
- **THEN** the boundary check fails naming the file and the limit

#### Scenario: Baselined file grows
- **WHEN** a production source file listed in the baseline grows past its recorded line count
- **THEN** the boundary check fails naming the file, its recorded count and its current count

#### Scenario: Baselined file shrinks but stays oversized
- **WHEN** a baselined file loses lines but still exceeds 1,000 lines
- **THEN** the boundary check passes

#### Scenario: Split leaves a stale baseline entry
- **WHEN** a baselined file is deleted or reduced to 1,000 lines or fewer while its baseline entry remains
- **THEN** the boundary check fails naming the stale entry

#### Scenario: Tests are not counted
- **WHEN** a `*.test.ts` file or a module under `src/test-support/` exceeds 1,000 lines
- **THEN** the boundary check passes without a baseline entry
