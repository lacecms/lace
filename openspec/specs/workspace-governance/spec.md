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

### Requirement: Explicit unavailable-command behavior

Until a later roadmap step implements a documented developer command's runtime
feature, invoking that command SHALL print `not implemented in milestone 1` or
an equally specific milestone message. A non-verification developer command
such as a development-server launcher SHALL exit successfully after that
message; an unavailable verification or state-changing command SHALL exit
unsuccessfully and SHALL not simulate feature execution.

#### Scenario: Deferred development launcher

- **WHEN** a contributor runs an unimplemented development-server command during Step 1
- **THEN** the command exits successfully after identifying that the feature is not implemented in milestone 1

#### Scenario: Deferred verification command

- **WHEN** a contributor runs an unimplemented integration verification command during Step 1
- **THEN** the command exits unsuccessfully after identifying that the feature is not implemented in milestone 1

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
The dependency-boundary verification SHALL scan the frontmatter of `.astro` components as well as TypeScript sources and SHALL resolve package subpath imports to their package. It SHALL permit the Astro adapter to import only the render core, the SDK, `astro`, and its own modules, SHALL reject adapter re-exports of any Lace package, and SHALL permit the reference site to import only the adapter, render core, SDK, and content packages among Lace packages.

#### Scenario: Adapter imports content directly
- **WHEN** an adapter source or component imports `@lacecms/content`
- **THEN** the dependency-boundary verification fails and names the forbidden import

#### Scenario: Adapter re-exports the render core
- **WHEN** an adapter module contains `export { defineBlockMap } from "@lacecms/render"`
- **THEN** the dependency-boundary verification fails and names the re-export

#### Scenario: Reference site component imports the adapter subpath
- **WHEN** a reference-site `.astro` component imports `@lacecms/astro/LaceBlocks.astro`
- **THEN** the import counts as the permitted `app-site -> astro` edge
