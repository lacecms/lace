## ADDED Requirements

### Requirement: Test typecheck exceptions are limited by a shrinking baseline

The boundary checker SHALL fail when a source file under a workspace member's `src/` disables type checking with a `@ts-nocheck` directive and a committed typecheck-exception baseline does not list that file. A baseline entry SHALL itself fail the check, naming the entry, when its file no longer exists or no longer carries the directive, so that typing a file removes its entry in the same change. Modules under `src/test-support/` and production modules SHALL NOT be listed in the baseline, and a listed entry for such a module SHALL fail the check. A repository without a baseline file SHALL be checked against an empty baseline. Contributor documentation SHALL name the baseline as the inventory of remaining exceptions.

#### Scenario: New exception is added
- **WHEN** a contributor adds `// @ts-nocheck` to a test file that the baseline does not list, including a test companion created by splitting a baselined file
- **THEN** the boundary check fails naming the file

#### Scenario: Typed file leaves a stale entry
- **WHEN** a baselined test file is deleted or no longer carries the directive while its baseline entry remains
- **THEN** the boundary check fails naming the stale entry

#### Scenario: Shared test helper disables type checking
- **WHEN** a module under `src/test-support/` carries the directive, whether or not the baseline lists it
- **THEN** the boundary check fails naming the module

#### Scenario: Baselined legacy test
- **WHEN** a test file listed in the baseline carries the directive
- **THEN** the boundary check passes

### Requirement: Module graphs inside workspace members are acyclic and follow declared layouts

The boundary checker SHALL build, for each workspace member, a graph of relative imports and re-exports between production modules under `src/`, including type-only imports, and SHALL fail on a cycle, naming the files on the cycle. Cycles that existed when this requirement was adopted SHALL pass only while each of their strongly connected components is a subset of a component recorded in a committed cycle baseline. A baseline component that no longer forms a cycle in the current graph SHALL fail the check as stale. A committed layout declaration SHALL list the packages that have adopted the architecture section 6 domain-directory layout and, for each such package, the directories each directory may import. For a declared package the checker SHALL fail when a module imports a module in an undeclared direction, when a subdirectory contains an `index` module, when a production module at the `src/` root is not a package entry declared by the manifest `exports` or `bin` fields, or when the entry point's `Directory dependencies:` header names a directory set that differs from the declaration. Test files and modules under `src/test-support/` SHALL remain excluded from these graphs. Admin layer and slice structure checks SHALL remain unchanged, and the cycle rule SHALL also apply to `apps/admin` production modules.

#### Scenario: Type-only import closes a cycle
- **WHEN** two production modules of one package import each other, one of them through `import type`
- **THEN** the boundary check fails naming both files

#### Scenario: Baselined legacy cycle
- **WHEN** a package's only cycle lies within a strongly connected component recorded in the cycle baseline
- **THEN** the boundary check passes

#### Scenario: Legacy cycle grows
- **WHEN** a new module joins a baselined cycle so its strongly connected component is no longer a subset of the recorded component
- **THEN** the boundary check fails naming the new component

#### Scenario: Broken cycle leaves a stale entry
- **WHEN** a recorded component no longer contains a cycle in the current graph
- **THEN** the boundary check fails naming the stale baseline entry

#### Scenario: Import against the declared direction
- **WHEN** a module in a lower directory of a declared package imports a module in a directory that the declaration does not permit
- **THEN** the boundary check fails naming the importing file, the imported file and the forbidden directory edge

#### Scenario: Subdirectory barrel
- **WHEN** a declared package adds an `index` module inside a subdirectory of `src/`
- **THEN** the boundary check fails naming the barrel

#### Scenario: Extra root module
- **WHEN** a declared package adds a production module at its `src/` root that no `exports` or `bin` entry names
- **THEN** the boundary check fails naming the module

#### Scenario: Entry header drifts from the declaration
- **WHEN** a declared package adds a directory or its entry header names a directory set different from the declaration
- **THEN** the boundary check fails naming the package and the differing directories

### Requirement: Verification runners and documentation name existing workspace tests

Every workspace test path that a root verification runner passes to a test command or that a root verification Vitest configuration includes SHALL exist, and every package filter a runner names SHALL resolve to a workspace member. Maintained Markdown documentation (the root `README.md`, `DEVELOPMENT.md` and `docs/`, excluding archived documents and the active roadmap, which record history) SHALL name only existing workspace test paths in code references and only existing configurations in Vitest `--config` arguments. A repository test SHALL fail naming each missing path or unknown filter. Verification phases that execute a workspace package's tests SHALL run them through that package's own source or packaged test configuration, so that a phase executes the same test cases with the same module resolution as the package's `test` or `test:packaged` command.

#### Scenario: Test file is renamed
- **WHEN** a contributor renames or splits a test file that a verification phase or verification Vitest project names
- **THEN** the root test fails naming the runner or configuration and the missing path

#### Scenario: Documentation names a removed configuration
- **WHEN** maintained documentation shows a Vitest `--config` argument or a workspace test path that does not exist
- **THEN** the root test fails naming the document and the missing path

#### Scenario: Package suite runs inside a verification phase
- **WHEN** a security, cross-runtime or operations phase runs a package's tests
- **THEN** the tests resolve workspace imports exactly as that package's `test` or `test:packaged` command does, and the phase report records the executed cases

### Requirement: Type tests run in the package typecheck gate

Every workspace member that defines a type-test TypeScript project SHALL type-check it in its `typecheck` command, so that the root typecheck gate fails when an expected type error disappears or an unexpected one appears. A repository test SHALL fail naming each member whose type-test project is not part of its `typecheck` command.

#### Scenario: Expected type error stops occurring
- **WHEN** a change makes a `@ts-expect-error` assertion in a package's type tests unused
- **THEN** the root typecheck gate fails

#### Scenario: Type-test project is not gated
- **WHEN** a member has a type-test project that its `typecheck` command does not run
- **THEN** the root test fails naming the member

## MODIFIED Requirements

### Requirement: Package tests run from source and packaged output separately

Each workspace package's `test` command SHALL run its tests against TypeScript source, resolving every `@lacecms/*` specifier to that package's source entry point through one shared test configuration, and SHALL NOT depend on any build task. Test files SHALL be TypeScript and SHALL be type-checked by the package's `typecheck` command; the only permitted exceptions are legacy test files listed in the typecheck-exception baseline, and that baseline SHALL only shrink. Each published package SHALL keep at least one packaged-output test that imports its built entry point (and every declared subpath export) and asserts the exact public export list; packaged-output tests SHALL run under a separate `test:packaged` command that depends on the package's build and its dependencies' builds. The root test command SHALL run both kinds. Tests SHALL import other Lace packages through their declared package specifiers as the repository convention. The boundary checker SHALL NOT enforce import restrictions inside excluded test files or test-support modules; source tests SHALL still run without built output. Tests MAY import registry components and local test fixtures through relative paths.

#### Scenario: Package test on a clean checkout
- **WHEN** a contributor runs one package's `test` command on a checkout with no `dist/` directories
- **THEN** the tests run against source and pass without building any package

#### Scenario: Packaged export list drifts
- **WHEN** a package's build omits or renames a public export
- **THEN** that package's packaged-output test fails naming the missing or unexpected export while its source tests still pass

#### Scenario: Source test relies on built output
- **WHEN** a source test requires a `dist/` file instead of source and runs on a checkout without built output
- **THEN** the source-test gate fails because the built file is unavailable; the boundary checker does not inspect the excluded test imports

#### Scenario: Unlisted test disables type checking
- **WHEN** a test file that the typecheck-exception baseline does not list disables type checking
- **THEN** the boundary check fails before the package's typecheck can silently skip the file

### Requirement: Consistent local and CI quality gates

The repository SHALL provide root commands for the documented build, typecheck,
lint, test, and OpenSpec validation gates. CI SHALL install with the committed
lockfile and execute those same root commands, format checking, and lockfile and
cache-integrity checks. The strict OpenSpec validation command SHALL validate
all active and accepted specifications without interactive prompts. The root
lint command SHALL fail when Oxlint reports any warning in any workspace member.

#### Scenario: CI quality gate

- **WHEN** a pull request or push triggers the repository CI workflow
- **THEN** CI uses the exact Step 0 Node and pnpm baseline, performs a frozen-lockfile installation, and fails if any required local quality command fails

#### Scenario: Invalid specification

- **WHEN** an active or accepted OpenSpec artifact violates strict validation rules
- **THEN** the root OpenSpec validation command and CI fail with the validation result

#### Scenario: Lint warning is introduced

- **WHEN** a change leaves an unused variable or any other Oxlint warning in a workspace member
- **THEN** the root lint command fails naming the file and rule

### Requirement: Root scripts and script files reference each other completely

Every `node scripts/<file>` target of a root `package.json` script SHALL exist, and every file under `scripts/` (excluding `scripts/fixtures/`) SHALL be referenced by a root `package.json` script, another script, a CI workflow, a Dockerfile or a test. A repository test SHALL enforce both directions so that an orphaned or dangling script fails the root test command. Root scripts, script files, acceptance stage names, result directories and verification environment variables SHALL be named by what they run or verify and SHALL NOT encode a prerelease number or roadmap step identifier. `DEVELOPMENT.md` SHALL catalog every root script with its group, when to run it and the files it runs: every `node scripts/<file>` target of the script SHALL appear in its catalog row, and every repository source path the row names SHALL exist; build outputs under a `dist/` directory are exempt because they exist only after a build.

#### Scenario: Script file loses its last reference
- **WHEN** a contributor deletes the only root script, workflow step or import that referenced a file under `scripts/`
- **THEN** the root test fails naming the orphaned file

#### Scenario: Root script points at a deleted file
- **WHEN** a root `package.json` script names a `scripts/` file that does not exist
- **THEN** the root test fails naming the script

#### Scenario: Catalog is incomplete
- **WHEN** a root script is added without a catalog row in `DEVELOPMENT.md`
- **THEN** the root test fails naming the uncataloged script

#### Scenario: Catalog row omits a script target
- **WHEN** a root script gains a `node scripts/<file>` step that its catalog row does not name, or a row names a path that does not exist
- **THEN** the root test fails naming the script and the path
