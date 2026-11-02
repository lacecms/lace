## ADDED Requirements

### Requirement: Package tests run from source and packaged output separately

Each workspace package's `test` command SHALL run its tests against TypeScript source, resolving every `@lacecms/*` specifier to that package's source entry point through one shared test configuration, and SHALL NOT depend on any build task. Test files SHALL be TypeScript and SHALL be type-checked by the package's `typecheck` command. Each published package SHALL keep at least one packaged-output test that imports its built entry point (and every declared subpath export) and asserts the exact public export list; packaged-output tests SHALL run under a separate `test:packaged` command that depends on the package's build and its dependencies' builds. The root test command SHALL run both kinds. Tests SHALL import other Lace packages through their declared package specifiers as the repository convention. The boundary checker SHALL NOT enforce import restrictions inside excluded test files or test-support modules; source tests SHALL still run without built output. Tests MAY import registry components and local test fixtures through relative paths.

#### Scenario: Package test on a clean checkout
- **WHEN** a contributor runs one package's `test` command on a checkout with no `dist/` directories
- **THEN** the tests run against source and pass without building any package

#### Scenario: Packaged export list drifts
- **WHEN** a package's build omits or renames a public export
- **THEN** that package's packaged-output test fails naming the missing or unexpected export while its source tests still pass

#### Scenario: Source test relies on built output
- **WHEN** a source test requires a `dist/` file instead of source and runs on a checkout without built output
- **THEN** the source-test gate fails because the built file is unavailable; the boundary checker does not inspect the excluded test imports

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

For Step 1, enforcement SHALL use a TypeScript source-level compatibility
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

- **WHEN** Step 1 is installed with the project-pinned TypeScript 7 baseline
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
