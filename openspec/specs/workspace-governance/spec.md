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
path can otherwise resolve them.

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

### Requirement: Consistent local and CI quality gates

The repository SHALL provide root commands for the documented build, typecheck,
lint, test, and OpenSpec validation gates. CI SHALL install with the committed
lockfile and execute those same root commands, format checking, and lockfile and
cache-integrity checks. The strict OpenSpec validation command SHALL validate
all active and accepted specifications without interactive prompts.

#### Scenario: CI quality gate

- **WHEN** a pull request or push triggers the repository CI workflow
- **THEN** CI uses the exact Step 0 Node and pnpm baseline, performs a frozen-lockfile installation, and fails if any required local quality command fails

#### Scenario: Invalid specification

- **WHEN** an active or accepted OpenSpec artifact violates strict validation rules
- **THEN** the root OpenSpec validation command and CI fail with the validation result

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

Every `node scripts/<file>` target of a root `package.json` script SHALL exist, and every file under `scripts/` (excluding `scripts/fixtures/`) SHALL be referenced by a root `package.json` script, another script, a CI workflow, a Dockerfile or a test. A repository test SHALL enforce both directions so that an orphaned or dangling script fails the root test command. Root scripts, script files, acceptance stage names, result directories and verification environment variables SHALL be named by what they run or verify and SHALL NOT encode a prerelease number or roadmap step identifier. `DEVELOPMENT.md` SHALL catalog every root script with its group and when to run it.

#### Scenario: Script file loses its last reference
- **WHEN** a contributor deletes the only root script, workflow step or import that referenced a file under `scripts/`
- **THEN** the root test fails naming the orphaned file

#### Scenario: Root script points at a deleted file
- **WHEN** a root `package.json` script names a `scripts/` file that does not exist
- **THEN** the root test fails naming the script

#### Scenario: Catalog is incomplete
- **WHEN** a root script is added without a catalog row in `DEVELOPMENT.md`
- **THEN** the root test fails naming the uncataloged script

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
