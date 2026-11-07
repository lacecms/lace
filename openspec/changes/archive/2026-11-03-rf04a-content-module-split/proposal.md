## Why

`packages/content/src/index.ts` is 3,881 lines at commit `1ac97ec2` (the
roadmap baseline recorded 3,691 before RF3 added the capability table, the
visibility helper and the error base). It holds JSON helpers, the field
capability vocabulary, descriptor types, builders and normalization, form
layout, conditional visibility, rich text, value validation, reference
collection, the block DSL, list layouts, the built-in blocks and entry
aggregate validation in one module, so every change to one concern touches a
file that owns eight. This is Session RF4A of
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md) (Step
RF4, module splits). RF3 is complete, so each definition already has one
owner and the split moves one copy of each.

Splitting into a flat list of files would only move the problem: every
package `src/` in the workspace is flat today, and 19 production files
exceed 1,000 lines. The owner decided (2026-11-03) that split modules are
grouped into domain subdirectories, that new code is written in that layout
from the start, and that a guard stops new monoliths from accumulating.

## What Changes

- **Domain subdirectories.** `index.ts` becomes re-exports only; its
  declarations and the existing leaf modules move, bodies and JSDoc
  verbatim, into `shared/` (errors, JSON, objects, identifiers), `fields/`
  (capabilities, definitions, builders, layout, visibility, validation, rich
  text, video embeds, internal-link tokens, schema paths), `references/`
  (media, internal-link collection, field paths), `blocks/` (definition,
  list layout, built-ins) and `entries/` (aggregate, canonical JSON, list
  query policy). Directories depend one way:
  `shared ← fields ← references, blocks ← entries`; the module graph is
  acyclic, type-only imports included. No subdirectory has a barrel
  `index.ts`; the package entry re-exports concrete files by explicit name
  lists, so internal helpers shared between modules do not become exports.
- **Corrections to the roadmap text** (recorded in design): the roadmap's
  eight flat modules do not fit under 1,000 lines once RF3A's capability
  table is counted, and form layout, visibility and the shared error classes
  are imported from both sides of the fields/blocks seam. Hence separate
  capability, definition, layout and visibility modules, list layout apart
  from the block DSL, and `FieldConfigurationError`/`ContentValidationError`
  in `shared/errors.ts`. The apply-time graph check also found that
  `FieldValue` uses `BlockDataValues`: `BlockDataValues` and its helper
  `FieldVisibilityTargets` therefore live in `fields/definitions.ts`, with
  their existing public names and bodies, to avoid a type-only cycle through
  the block module (owner-confirmed refinement, 2026-11-03).
  `publishedBlockData` moves to the block module as
  the roadmap specifies.
- **Public surface unchanged.** Every runtime and type export name of
  `@lacecms/content` stays identical.
- **Tests follow their modules.** `index.test.ts` (2,377 lines) splits into
  one test file per module beside it, with no assertion changes and the same
  listed case titles; existing test files move beside their modules;
  `index.type-test.ts` (540 lines) splits alongside, with shared
  `Equal`/`Expect` helpers in `src/test-support/type-assertions.ts`.
- **Type tests gated.** `type-test` is not run by any root task today and
  currently fails: one `@ts-expect-error` sits one line above the error it
  expects. The directive moves to the asserted property and the package
  `typecheck` script runs the type-test project.
- **Source layout convention, documented.** Architecture §6 gains a
  *Source layout* subsection and `AGENTS.md` a short rule: package source is
  grouped by domain subdirectory, one responsibility per file, no
  subdirectory barrels, tests beside their module, and files split in the
  same change before they reach 1,000 lines. ADR 0020 records the decision.
- **Size guard with a ratchet.** The boundary checker fails when a
  production source file exceeds 1,000 lines unless it is listed in a
  committed baseline (`scripts/oversized-source-baseline.json`) at no more
  than its recorded size; a baseline entry whose file is gone or within the
  limit also fails, so each later split must remove its entry. The baseline
  starts with the 18 oversized files outside `content`.
- **Guards and documentation follow the files.** The field-type vocabulary
  guard reads `fields/capabilities.ts`; the shared-vocabulary guard pins
  `LaceError`/`InvariantError` to `shared/errors.ts`; `docs/verification.md`
  cites the rich-text test; the roadmap's RF4 text states that RF4B–RF4E use
  the same layout and remove their baseline entries.

Non-goals: any behavior, message, error code, export name or DTO change;
renaming declarations; reorganizing other packages (RF4B–RF4E, RF5, RF6
remove their own baseline entries); a per-package directory dependency
checker; adding a package `exports` subpath. `packages/config` has the same
rotted `type-test` (one stale expectation on `ListQueryFieldKey`); it stays
for a follow-up.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: adds a requirement that the boundary checker
  enforces the 1,000-line limit on production source files through a
  shrinking baseline, and that the source layout convention is documented.

The accepted capabilities whose code moves (`field-descriptors`,
`content-validation`, `block-registry`, `conditional-fields`,
`internal-url-links`, `list-layout`, `content-domain-rules`) keep their
requirements unchanged.

## Impact

- Code: `packages/content/src` reorganized into five subdirectories with
  `index.ts` as the only root module; test and type-test files split and
  moved; package `typecheck` script and `tsconfig.type-test.json`.
- Tooling: `scripts/check-boundaries.mjs` size check,
  `scripts/oversized-source-baseline.json`, new cases in
  `tests/boundaries.test.mjs`; `tests/field-type-vocabulary.test.mjs` and
  `tests/shared-vocabulary.test.mjs` source paths.
- Documentation: `docs/mvp-architecture.md` §6, `AGENTS.md`,
  `docs/adr/0020-source-layout.md` and the ADR index,
  `docs/verification.md` one row, `docs/refactoring-roadmap.md` RF4 text,
  baseline table and progress log.
- Consumers: none. Every workspace member imports the package entry point,
  whose names and types do not change.
- Dependencies: none added or removed.
