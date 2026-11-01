## ADDED Requirements

### Requirement: Package tests run from source and packaged output separately

Each workspace package's `test` command SHALL run its tests against TypeScript source, resolving every `@lacecms/*` specifier to that package's source entry point through one shared test configuration, and SHALL NOT depend on any build task. Test files SHALL be TypeScript and SHALL be type-checked by the package's `typecheck` command. Each published package SHALL keep at least one packaged-output test that imports its built entry point (and every declared subpath export) and asserts the exact public export list; packaged-output tests SHALL run under a separate `test:packaged` command that depends on the package's build and its dependencies' builds. The root test command SHALL run both kinds. Tests SHALL import other Lace packages only through their declared package specifiers, never through a relative source or build path.

#### Scenario: Package test on a clean checkout
- **WHEN** a contributor runs one package's `test` command on a checkout with no `dist/` directories
- **THEN** the tests run against source and pass without building any package

#### Scenario: Packaged export list drifts
- **WHEN** a package's build omits or renames a public export
- **THEN** that package's packaged-output test fails naming the missing or unexpected export while its source tests still pass

#### Scenario: Test imports a build path
- **WHEN** a test file imports another Lace package through a relative `dist/` or `src/` path
- **THEN** the dependency-boundary verification fails naming the file and specifier

## MODIFIED Requirements

### Requirement: Architecture dependency enforcement

The repository SHALL automatically reject cycles and imports that violate the
architecture section 6 dependency graph, including imports of Node-only APIs by
the portable `content` and `config` packages. The enforcement SHALL reject
cross-package source-path imports even when a TypeScript path alias or relative
path can otherwise resolve them. Test files (`*.test.ts`, `*.test.tsx`) and
modules under a package's `src/test-support/` directory MAY additionally import
the test runner, `node:` builtins and `@lacecms/test-utils`; every other rule,
including the cross-package source-path ban and the package dependency graph,
SHALL apply to them unchanged.

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

#### Scenario: Test file imports its runner

- **WHEN** a `*.test.ts` file in a framework-neutral package imports `vitest`, a `node:` builtin or `@lacecms/test-utils`
- **THEN** the dependency-boundary verification passes, and it still fails if the same file imports a package outside the architecture graph or any package through a relative source path
