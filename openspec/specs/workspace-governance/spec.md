# Workspace Governance Specification

## Purpose

Defines the reproducible workspace and automated controls that preserve Lace's
package architecture while product capabilities are introduced incrementally.

## Requirements

### Requirement: Buildable declared workspace

The repository SHALL define a pnpm workspace containing every application and
package listed in architecture section 6, using strict ESM TypeScript target
configurations and explicit package public entry points. Each workspace member
SHALL be private at its initial version and SHALL expose types through its
declared public entry point. Third-party versions SHALL be centralized in the
root pnpm catalog and resolved by the committed lockfile.

#### Scenario: Clean workspace verification

- **WHEN** a contributor installs a clean checkout with `pnpm install --frozen-lockfile` and runs `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test`
- **THEN** each command completes successfully through the workspace task graph without relying on unpublished product implementation

#### Scenario: Public package entry point

- **WHEN** a workspace member consumes another Lace package
- **THEN** it resolves that package through its declared package entry point and not through a relative source path or an undeclared deep import

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

### Requirement: Local development operations have stable root commands

The workspace SHALL expose documented root commands to start the Node local
development stack, stop it, view its logs, run its smoke check, and explicitly
reset its named local data. The start, stop, log, and smoke commands SHALL
delegate to the same declared local topology rather than duplicating service
configuration. The reset command SHALL require an explicit destructive command
name and SHALL not run as part of ordinary start, stop, test, build, or quality
commands.

#### Scenario: A contributor uses the standard local lifecycle
- **WHEN** a contributor invokes the documented root start, stop, log, or smoke
  command
- **THEN** the command targets the same declared local development topology and
  reports a clear success or failure outcome

#### Scenario: Ordinary development commands are run
- **WHEN** a contributor runs an ordinary start, stop, test, build, lint,
  typecheck, or format command
- **THEN** no local database or object-store data are deleted implicitly

### Requirement: Site-rendering packages stay framework-neutral
The dependency-boundary verification SHALL permit the render core to import only the content package and its own modules, rejecting UI-framework, Node built-in, SDK, contract, and other third-party imports. It SHALL permit the SDK to import only the contracts package, its validation library, and its own modules, so the published-site loader cannot import a UI framework or Node-only API.

#### Scenario: Render core imports a framework
- **WHEN** a render core source file imports `astro`, `react`, a Node built-in, or `@lacecms/sdk`
- **THEN** the dependency-boundary verification fails and names the forbidden import

#### Scenario: Render core imports content
- **WHEN** a render core source file imports `@lacecms/content`
- **THEN** the dependency-boundary verification passes

#### Scenario: SDK imports a framework
- **WHEN** an SDK source file imports `astro` or a Node built-in
- **THEN** the dependency-boundary verification fails and names the forbidden import

### Requirement: The Astro adapter stays a thin framework binding
The dependency-boundary verification SHALL scan the frontmatter of `.astro` components as well as TypeScript sources and SHALL resolve package subpath imports to their package. It SHALL permit the Astro adapter to import only the render core, the SDK, `astro` and its `astro:` virtual modules, Node builtins through the `node:` scheme, and its own modules; it SHALL reject Node builtins imported without the `node:` scheme, SHALL reject adapter re-exports of any Lace package, and SHALL permit the reference site to import only the adapter, render core, SDK, and content packages among Lace packages.

#### Scenario: Adapter imports content directly
- **WHEN** an adapter source or component imports `@lacecms/content`
- **THEN** the dependency-boundary verification fails and names the forbidden import

#### Scenario: Adapter re-exports the render core
- **WHEN** an adapter module contains `export { defineBlockMap } from "@lacecms/render"`
- **THEN** the dependency-boundary verification fails and names the re-export

#### Scenario: Reference site component imports the adapter subpath
- **WHEN** a reference-site `.astro` component imports `@lacecms/astro/LaceBlocks.astro`
- **THEN** the import counts as the permitted `app-site -> astro` edge

#### Scenario: Adapter uses the image pipeline and a build cache
- **WHEN** an adapter component imports `astro:assets` and an adapter module imports `node:fs/promises`
- **THEN** the dependency-boundary verification accepts both imports

#### Scenario: Adapter imports a bare Node builtin
- **WHEN** an adapter module imports `fs/promises`
- **THEN** the dependency-boundary verification fails and names the forbidden import

### Requirement: Documentation is an isolated private workspace application

The repository SHALL declare `@lacecms/app-docs` as a private application in the existing pnpm/Turborepo workspace. Its build, typecheck, lint and relevant verification SHALL participate in root quality commands and CI with pinned catalog/lockfile dependencies and the existing Node/pnpm baseline. It SHALL NOT be included in public npm package inventories or CMS/builder runtime images. It SHALL NOT import Lace runtime packages or be imported by CMS applications/packages; documentation infrastructure SHALL NOT introduce a new CMS runtime dependency edge. Boundary checks SHALL recognize and enforce this application boundary. Oxlint/Oxfmt SHALL remain the configured lint/format tools.

#### Scenario: Clean root checks
- **WHEN** frozen dependencies are installed and the existing root quality commands are run
- **THEN** documentation tasks participate successfully without starting CMS services and public artifact inventories remain unchanged

#### Scenario: Runtime coupling
- **WHEN** a docs source imports a Lace runtime package or a CMS member imports the docs application
- **THEN** boundary verification fails and identifies the forbidden dependency

#### Scenario: Documentation-only dependency
- **WHEN** a static documentation dependency is added
- **THEN** it is pinned through the workspace policy and does not enter published CMS runtime manifests or images

### Requirement: MCP package remains a portable transport adapter
The workspace SHALL provide `@lacecms/mcp` as a portable adapter depending only
on the application, contracts and domain Lace packages and its declared
protocol/schema dependencies. It SHALL NOT import server HTTP handlers, database
or auth-provider implementations, platform packages, browser UI, configuration
loaders or Node-only APIs. Platform composition packages SHALL be permitted to
import MCP and inject a runtime-neutral handler into the server. The application
SHALL remain independent of REST contracts, Hono, MCP SDK, Better Auth, Drizzle
and runtime adapters. Shared DTO validation/serialization SHALL remain in
contracts, while business behavior and use-case orchestration SHALL remain in
application/domain. The repository's boundary checker SHALL enforce these
edges, reject cycles and reject cross-package source imports. Release tooling
SHALL include the new package with its declared public entry point and pinned
catalog dependencies.

#### Scenario: Portable MCP import
- **WHEN** the MCP adapter imports shared application operations and contract projections through public package exports
- **THEN** dependency checks pass and both runtime bundles can consume it

#### Scenario: MCP bypasses the application boundary
- **WHEN** a boundary fixture imports a database, platform implementation, server handler or Node-only API from MCP
- **THEN** the dependency check rejects it

#### Scenario: Application imports a transport schema
- **WHEN** an application boundary fixture imports a REST contract or MCP SDK
- **THEN** the existing forbidden-edge check continues to reject it

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

### Requirement: Internal documentation is indexed and link-checked

The repository SHALL keep an index of internal documentation (`docs/README.md`) listing every Markdown file under `docs/`, including archived roadmaps, with a status of `authoritative`, `internal note` or `historical` and the architecture section or capability it details, and an ADR index (`docs/adr/README.md`) listing every ADR by number, title and status. Relative Markdown links in the root `README.md`, `DEVELOPMENT.md`, `AGENTS.md`, `backlog.md` and every file under `docs/` SHALL resolve to an existing file or directory. A repository test SHALL fail when a link target is missing, when a `docs/` file has no index row, or when an ADR has no ADR-index row. Verification run records, per-release readiness narratives and other evidence of completed work SHALL NOT be stored under `docs/`; the archived OpenSpec changes, archived roadmaps and ADRs are the repository's history.

#### Scenario: Document is deleted or moved
- **WHEN** a contributor deletes or moves a file under `docs/` and another document still links to its old path
- **THEN** the root test fails naming the linking document and the missing target

#### Scenario: Document is added without an index row
- **WHEN** a new Markdown file is added under `docs/` or `docs/adr/` without an index row
- **THEN** the root test fails naming the file

#### Scenario: Index is complete
- **WHEN** every `docs/` file and ADR has an index row and every relative link resolves
- **THEN** the root test passes

### Requirement: Package tests run from source and packaged output separately

Each workspace member's `test` command, including the admin application's
unit tests, SHALL run its tests against TypeScript source and SHALL NOT depend
on any build task. Every `@lacecms/*` specifier, including every declared
subpath export, SHALL resolve to source through a `@lacecms/source` export condition
that the target package declares in its own manifest. Test runners and test
type-checking SHALL enable that condition. Production builds, development
servers, production type-checking and packaged-output tests SHALL NOT enable
it. Every package export whose target is compiled output SHALL list the
`@lacecms/source` condition first, naming the existing source module that the target
is built from. The boundary checker SHALL fail, naming the package and
export, when that condition is missing, not first, or names a missing file.
Test files SHALL be TypeScript and SHALL be type-checked by the member's
`typecheck` command. Test and type-test projects SHALL type-check against
source without built output. The only permitted exceptions are legacy test
files listed in the typecheck-exception baseline, and that baseline SHALL only
shrink. Each published package SHALL keep at least one packaged-output test
that imports its built entry point (and every declared subpath export) and
asserts the exact public export list. Packaged-output tests SHALL run under a
separate `test:packaged` command that depends on the package's build and its
dependencies' builds. The root test command SHALL run both kinds. Tests SHALL
import other Lace packages through their declared package specifiers as the
repository convention. The boundary checker SHALL NOT enforce import
restrictions inside excluded test files or test-support modules; source
tests SHALL still run without built output. Tests MAY import registry
components and local test fixtures through relative paths.

#### Scenario: Package test on a clean checkout
- **WHEN** a contributor runs one package's `test` command on a checkout with no `dist/` directories
- **THEN** the tests run against source and pass without building any package

#### Scenario: Admin unit tests on a clean checkout
- **WHEN** a contributor runs `pnpm --filter @lacecms/app-admin test` on a
  checkout with no `dist/` directories
- **THEN** the admin unit tests resolve `@lacecms/content`,
  `@lacecms/contracts` and the `@lacecms/test-utils` subpaths from source and
  pass

#### Scenario: Test typecheck on a clean checkout
- **WHEN** a contributor type-checks a member's test or type-test project on a
  checkout with no `dist/` directories
- **THEN** sibling packages resolve to source and the check passes without
  building any package

#### Scenario: A new subpath export lacks its source condition
- **WHEN** a package adds an export whose target is compiled output without a
  first `@lacecms/source` condition naming an existing source module
- **THEN** the boundary check fails naming the package and the export

#### Scenario: Production consumers keep compiled output
- **WHEN** a package is built, the admin development server or production
  build runs, or a packaged-output test imports a package
- **THEN** resolution ignores the `@lacecms/source` condition and uses compiled output

#### Scenario: Packaged export list drifts
- **WHEN** a package's build omits or renames a public export
- **THEN** that package's packaged-output test fails naming the missing or unexpected export while its source tests still pass

#### Scenario: Source test relies on built output
- **WHEN** a source test requires a `dist/` file instead of source and runs on a checkout without built output
- **THEN** the source-test gate fails because the built file is unavailable; the boundary checker does not inspect the excluded test imports

#### Scenario: Unlisted test disables type checking
- **WHEN** a test file that the typecheck-exception baseline does not list disables type checking
- **THEN** the boundary check fails before the package's typecheck can silently skip the file

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
