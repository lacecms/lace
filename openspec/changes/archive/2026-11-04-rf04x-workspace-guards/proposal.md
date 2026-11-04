## Why

Roadmap session RF4X is inserted before RF4F: it follows the owner-requested
audit of the completed RF1–RF4E sessions (2026-11-04). The rules those sessions
introduced are still enforced only by convention:

- The source layout rules (no module cycles, one-way directories, no
  subdirectory barrels, entry-only `src/` roots) have no committed check.
- Typecheck exceptions in tests grew from 88 files after RF2C to 143. RF2 left
  88 legacy files on `@ts-nocheck`, and each RF4 split copied the header onto
  its new test companions.

Two pieces of verification also broke during RF2 without notice:

- Three `verify:*` runners and one verification Vitest project name 21 test
  files that RF2 renamed. They also run package tests without the package's
  own configuration.
- The `config` and `domain` type tests run in no gate.

RF4F and RF5 will split and rewrite more modules. Unless these guards exist
first, each split can repeat the same drift unnoticed and force another
refactoring pass.

## What Changes

**New and extended guards**

- **Typecheck-exception baseline.** The boundary checker gains a shrinking
  baseline of source files that may carry `// @ts-nocheck`. It works like the
  oversized-source baseline: a new exception fails, and a stale entry fails.
  - Modules under `src/test-support/` may never be listed. The two that carry
    the header today are typed in this change.
  - The baseline starts at the 141 existing test files.
- **Intra-package layout check.** The boundary checker adds three checks:
  - A file-level import graph per workspace member, which rejects cycles
    including type-only imports. Today's strongly connected components are
    recorded in a shrinking cycle baseline: `auth`, `cli`, `domain` and
    `platform-node`.
  - For packages that have adopted the §6 domain-directory layout, a committed
    `scripts/source-layout.json` declares the allowed directory dependencies.
    The checker rejects imports against that direction, subdirectory
    `index.ts` barrels, and production modules at the `src/` root other than
    declared `exports`/`bin` entries. The adopted packages are `content`,
    `application`, `contracts`, `server`, `db` and `config`.
  - Each adopted package's entry header uses one `// Directory dependencies:`
    form that names exactly the declared directories.
- **Verification test-path guard.** A root test rejects any workspace test
  path that does not exist and any package filter that names no workspace
  member. It checks phase definitions, the verification Vitest config and
  maintained documentation.
- **Type-test gating.** Every package with a `tsconfig.type-test.json` runs it
  from its `typecheck` script, and a root test requires that. This fixes
  `config` and `domain`.
- **Turbo test inputs.** Inputs now include the files package tests read
  outside their package: root `lace.config.ts`, `apps/site` fixtures,
  `tests/fixtures/**` and `tests/support/**`.
- **Lint warnings.** All 41 current Oxlint warnings are cleared, and workspace
  lint fails on any warning from now on.

**Repairs**

- **Verification runners.**
  - `security-resilience-verification.mjs`, `cross-runtime-verification.mjs`,
    `operations-verification.mjs` and `vitest.verification.config.mjs` point at
    the current source and packaged test files.
  - Package suites run through the owning package's Vitest configuration, so a
    verification phase executes exactly what `pnpm test` / `test:packaged`
    execute.
  - `verify:cross-runtime` requires `--baseline`; its deleted default is
    removed.
- **Documentation hygiene.**
  - `DEVELOPMENT.md`: exact catalog entry files, `lint` includes the Drizzle
    check, and the typecheck-exception sentence points at the baseline.
  - `docs/content-import.md`: the stale cross-runtime Vitest command is fixed.
  - `docs/verification.md`, architecture §6 and `AGENTS.md`: the new checks
    are described.
  - ADR 0020 no longer says that no directory-level checker exists.
  - `backlog.md` is updated.
- **Roadmap.**
  - RF4X is added as a session of RF4.
  - The progress-log table is repaired; rows after RF4C were separated by
    blank lines.
  - The missing RF4B "Proposed" row and the RF4B `AccountSecurityPort` export
    deviation are recorded.
  - The stale RF8A §15 instruction is corrected.
  - Baseline rows are added for test typecheck exceptions and intra-package
    cycles.

No product, REST, MCP, persistence or published package behavior changes. No
package export changes.

## Non-goals

- **Typing the 141 baselined legacy test files.** This is planned as a later
  session. Each later split session must type or explicitly carry its
  companions.
- **Admin source-test resolution.** `apps/admin` unit tests still resolve
  `@lacecms/*` through `dist/`, and package `tsconfig.test.json` files resolve
  declarations. This conflicts with the accepted "Package tests run from
  source" requirement. A `source` export condition versus alias decision is
  pending with the owner and gets its own change.
- **Breaking existing cycles.** The cycles in `auth`, `cli`, `domain` and
  `platform-node` are only baselined. Adopting the layout in those packages
  belongs to their own sessions.
- **Splitting test files over 1,000 lines.** Typing untyped `.mjs` test
  helpers under `src/` is also out of scope.
- **RF3 vocabulary duplicates and error-code changes.** These are planned as
  RF3E.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: adds four requirements:
  - test typecheck exceptions are limited by a shrinking baseline;
  - module graphs inside members are acyclic and follow the declared layouts;
  - verification runners and documentation name existing workspace tests;
  - type tests run in the package typecheck gate.

  It also modifies three requirements:
  - source tests: the typecheck exception is made explicit and limited to the
    baseline;
  - quality gates: lint fails on warnings;
  - root scripts: catalog rows name every script target and existing paths.

## Impact

- **Roadmap position.** The change implements RF4X. It depends on RF4A–RF4E
  being archived and precedes RF4F. Architecture §6 (*Source layout*) and
  ADR 0020 are updated before code.
- **Code.**
  - `scripts/check-boundaries.mjs`
  - new baselines `scripts/test-typecheck-baseline.json`,
    `scripts/source-cycle-baseline.json` and the new `scripts/source-layout.json`
  - three verification runners and `vitest.verification.config.mjs`
  - `turbo.json`
  - six package entry headers
  - `config`/`domain` `package.json` `typecheck`
  - workspace `lint` scripts (`--deny-warnings`)
  - two test-support helpers
  - test and production files with lint warnings
- **Tests.** `tests/boundaries.test.mjs` and `tests/root-scripts.test.mjs`
  gain negative scratch-repository cases. Existing listed test titles are
  unchanged.
- **Documentation.** `docs/mvp-architecture.md` §6, `AGENTS.md`,
  `docs/adr/0020-source-layout.md`, `DEVELOPMENT.md`, `docs/verification.md`,
  `docs/content-import.md`, `docs/refactoring-roadmap.md` and `backlog.md`.
- **Dependencies.** None added.
