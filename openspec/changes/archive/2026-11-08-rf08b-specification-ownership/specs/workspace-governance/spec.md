## MODIFIED Requirements

### Requirement: Architecture dependency enforcement

The repository SHALL automatically reject cycles and imports that violate the
architecture section 6 dependency graph, including imports of Node-only APIs by
the portable `content` and `config` packages. The enforcement SHALL reject
cross-package source-path imports even when a TypeScript path alias or relative
path can otherwise resolve them in production modules. Test files
(`*.test.ts`, `*.test.tsx`) and modules under a workspace member's
`src/test-support/` directory SHALL be excluded from import-boundary and
re-export checks, and their imports SHALL NOT contribute edges to the
cycle-detection graph. This exclusion SHALL cover all imports, including
runtime-forbidden package dependencies, Node builtins and relative source or
fixture paths. All existing import rules and cycle detection SHALL continue
to apply to production modules. Admin source-structure checks SHALL remain
unchanged. Test files SHALL remain subject to their TypeScript, lint and test
execution gates.

Enforcement SHALL use a TypeScript source-level compatibility
checker. Dependency-cruiser SHALL NOT be installed, configured, or run while it
cannot parse the project-pinned TypeScript 7 baseline. The repository SHALL
document this deferral and replace the compatibility checker with
dependency-cruiser only after a dependency-cruiser release supports that
baseline without lowering the TypeScript version.

#### Scenario: Permitted dependency

- **WHEN** a package imports another package along an architecture-permitted edge through its public entry point
- **THEN** the dependency-boundary verification passes

#### Scenario: Forbidden dependency fixture

- **WHEN** the dependency-boundary verification evaluates the committed fixture containing a forbidden package import
- **THEN** it fails that fixture and reports the boundary violation

#### Scenario: Circular dependency

- **WHEN** workspace package imports form a cycle
- **THEN** the dependency-boundary verification fails before the change can pass local verification or CI

#### Scenario: Dependency-cruiser compatibility deferral

- **WHEN** the workspace is installed with the project-pinned TypeScript 7 baseline
- **THEN** no dependency-cruiser dependency or CI invocation is present, the TypeScript source-level compatibility checker enforces the same required boundaries, and the documented follow-up condition names TypeScript 7 parser support

#### Scenario: Test imports are excluded

- **WHEN** a `*.test.ts`, `*.test.tsx` or `src/test-support/**` module imports the test runner, Node builtins, a package outside its runtime dependency graph or a relative source or fixture path
- **THEN** import-boundary verification skips that module and adds none of its imports to the cycle-detection graph

#### Scenario: Astro integration tests use content and component fixtures

- **WHEN** Astro test files import `@lacecms/content`, components from `registry/` or local `test-fixtures/` outside `src/`
- **THEN** those imports are excluded from import-boundary verification without changing the Astro runtime dependency graph

#### Scenario: Production imports retain enforcement

- **WHEN** a production module contains an otherwise forbidden import or production import edges form a cycle
- **THEN** dependency-boundary verification still fails, regardless of the test-file exclusion

### Requirement: Consistent local and CI quality gates

The repository SHALL provide root commands for the documented build, typecheck,
lint, test, and OpenSpec validation gates. CI SHALL install with the committed
lockfile and execute those same root commands, format checking, and lockfile and
cache-integrity checks. The strict OpenSpec validation command SHALL validate
all active and accepted specifications without interactive prompts. The root
lint command SHALL fail when Oxlint reports any warning in any workspace member.

#### Scenario: CI quality gate

- **WHEN** a pull request or push triggers the repository CI workflow
- **THEN** CI uses the exact pinned Node and pnpm baseline, performs a frozen-lockfile installation, and fails if any required local quality command fails

#### Scenario: Invalid specification

- **WHEN** an active or accepted OpenSpec artifact violates strict validation rules
- **THEN** the root OpenSpec validation command and CI fail with the validation result

#### Scenario: Lint warning is introduced

- **WHEN** a change leaves an unused variable or any other Oxlint warning in a workspace member
- **THEN** the root lint command fails naming the file and rule
