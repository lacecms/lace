## Context

See proposal.md. Facts at commit `1ac97ec2`:

- `packages/content/src/index.ts` (3,881 lines) imports `errors.ts`,
  `identifiers.ts`, `objects.ts`, `video-embeds.ts`, `internal-links.ts`,
  `list-query-policy.ts` and `schema-path.ts`, re-exporting the first six
  with `export *` and three names of `schema-path.ts` explicitly. None of
  those leaf modules imports anything, except `schema-path.ts`, which
  imports `FieldDefinition`/`ModelFieldDefinitions` types from `./index.js`
  (a type-only cycle). Everything else is declared in `index.ts`, in this
  order: JSON types (16–25); field kinds and the RF3A capability table
  (27–215); field options and descriptor types (216–366); form layout
  (368–430); conditional-visibility types and helpers (431–554); group/list
  descriptors, composite limits, `FieldValue` and `FieldConfigurationError`
  (555–672); JSON detachment, option readers, builders, select presentation
  and descriptor normalization (673–1467); rich text,
  `ContentValidationError`, URL policy (1468–1769); the exhaustive visitor
  and value validation, published projection and list budget (1770–2113);
  media and internal-link reference collection and field paths (2114–2336);
  block anchors, settings, DSL, metadata, registry, validation and migration
  (2337–3047); `effectiveAltText` (3048); list layout settings (3057–3203);
  built-in blocks (3204–3524); entry limits, canonical JSON, hashing,
  payload and aggregate validation (3525–3870); `textLength`/`seoTextLength`
  (3873–3881).
- Internal helpers cross those ranges: `fail` (throws
  `FieldConfigurationError`) is used by layout, visibility, JSON detachment,
  builders and normalization; `invalid`/`assertExactKeys` (throw
  `ContentValidationError`) by rich text, validation, references, blocks and
  entry; `normalizeJsonValue` by layout, visibility, normalization and
  blocks; `FIELD_KEY_PATTERN` by layout, normalization and blocks;
  `normalizeFieldValue` by descriptor normalization (default checks) and
  validation; `textLength` by builders and validation; `isSafeUrl` by
  builders, rich text and validation; `decodeEntryLink` by the URL policy
  and link collection; `ModelFieldDefinitions` (declared at 1905) by the
  visibility types at 463. `publishedBlockData` (2075) is declared in the
  validation range but takes `BlockMetadata` (2548).
- Runtime top-level values call other declarations at module load:
  `fieldTypeCapabilities`, `FIELD_FILTER_OPERATIONS`,
  `BLOCK_SETTING_FIELD_TYPES`, the four shared built-in field constants and
  `builtInBlocks` (which call `field.*`, `defineBlock` and
  `listLayoutSettings`). ES module evaluation order therefore matters for a
  runtime import cycle.
- Tests: `index.test.ts` (2,377 lines, `// @ts-nocheck` with a `TODO(rf2)`
  reason) has five `describe` blocks and `test.each` tables; `vitest list`
  reports 115 cases for the package, 71 of them from `index.test.ts`. The
  shared Vitest configuration includes `src/**/*.test.ts` and
  `src/**/*.packaged.test.mjs`, so subdirectories need no config change.
  `index.type-test.ts` (540 lines) runs only through the package
  `type-test` script, which no root task invokes; it fails today with
  TS2578/TS2322 at lines 530/533 because the `@ts-expect-error` precedes
  `const invalidCapability` while the error is reported on the
  `sortableAs` property.
- `tests/field-type-vocabulary.test.mjs` reads `export type FieldType` from
  `packages/content/src/index.ts` and blanks two regions of that file before
  scanning every workspace source for duplicated kind lists;
  `tests/shared-vocabulary.test.mjs` pins `LaceError`/`InvariantError` to
  `packages/content/src/errors.ts` and treats `packages/content/src/` as the
  owner of shared names.
- `scripts/check-boundaries.mjs` takes an optional root argument (the
  tests run it on fixture workspaces), walks every workspace member's
  `src/`, skips test files and `test-support/`, and checks package-level
  cycles only. Every package `src/` is flat today except `test-utils`
  (`repository-contract/`). Production files above 1,000 lines: 19,
  `content/src/index.ts` included (largest others: test-utils
  `repository-contract/export.ts` 3,139, contracts `index.ts` 2,994, server
  `app.ts` 2,940).

## Goals / Non-Goals

**Goals:**

- `packages/content/src` has `index.ts` as its only root module; every
  other module sits in one of five domain directories, under 1,000 lines,
  with one concern.
- Module imports are acyclic (type-only included), and directories depend
  one way: `shared ← fields ← references, blocks ← entries`.
- Public runtime and type export names of `@lacecms/content` are
  identical; declaration bodies and JSDoc are moved verbatim.
- The layout convention is written down once and the size limit is
  enforced for the whole workspace without blocking on RF4B–RF6.

**Non-Goals:**

- Typing the legacy `@ts-nocheck` test fixtures.
- A mechanical directory-dependency or intra-package cycle checker
  (verified for `content` by a scratch script in this change).
- Reorganizing any other package.

## Decisions

1. **Layout.** Line ranges refer to `index.ts` at `1ac97ec2`; directories
   are listed bottom-up and a module imports only from its own directory's
   earlier rows or from earlier directories.

   | Module | Contents | ≈ lines |
   | --- | --- | ---: |
   | `shared/errors.ts` | (from `errors.ts`) `LaceError`, `InvariantError`; `FieldConfigurationError` and internal `fail`; `ValidationPathSegment`, `ContentValidationIssue`, `ContentValidationError` and internal `formatValidationPath`, `invalid`, `assertExactKeys` | 110 |
   | `shared/objects.ts` | (moved unchanged) | 25 |
   | `shared/identifiers.ts` | (moved unchanged) | 95 |
   | `shared/json.ts` | `JsonPrimitive`, `JsonValue`, `JsonObject`; internal `MutableJsonObject`/`MutableJsonValue`, `isArrayIndex`, `normalizeJsonValue` | 110 |
   | `fields/capabilities.ts` | `FieldType`, capability/sort/filter/value-kind types, `fieldTypeCapabilities`, `FIELD_FILTER_OPERATIONS`, `fieldTypesWith`, derived `*FieldType` aliases | 190 |
   | `fields/video-embeds.ts` | (moved unchanged) | 80 |
   | `fields/internal-link-tokens.ts` | (from `internal-links.ts`, unchanged) `encodeEntryLink`, `decodeEntryLink`, `MAX_INTERNAL_LINK_REFERENCES` | 36 |
   | `fields/rich-text.ts` | `SafeRichText*` types, `isSafeUrl`, `isUrlFieldTarget`, `validateRichTextDocument`, internal `isSafeRichTextDocument` and assertion helpers | 290 |
   | `fields/definitions.ts` | option interfaces, `ChoiceDiagram`, `SelectPresentation`, all `*FieldDefinition` types, `FormLayout`, `FieldVisibilityRule`/`FieldVisibility` and their private helper types, `ListItemDefinition`, `DraftFieldValue`, composite limits, `FieldDefinition`, `FieldValue`, `FieldIsRequired`, `FieldMetadata`, `ModelFieldDefinitions`, `ModelFieldValues`, `FieldDefinitionVisitor`, `visitFieldDefinition`, `FieldVisibilityTargets`, `BlockDataValues`; internal `FIELD_KEY_PATTERN` | 465 |
   | `fields/schema-path.ts` | (moved; its type import points at `definitions.ts`) | 40 |
   | `fields/layout.ts` | `normalizeFormLayout`, `formFieldKeys` | 60 |
   | `fields/visibility.ts` | `normalizeFieldVisibility`, `effectiveVisibilityValues`, `isFieldVisible` | 90 |
   | `fields/validation.ts` | calendar/datetime checks, `isFieldValue`, `CompiledFieldSchema`, `compileFieldSchema`, `validateFieldValue`, `ContentValidationMode`, list budget, internal `normalizeFieldValue`, `validateModelFields`, `publishedFieldValues`, `declaresFieldVisibility`, `validateSnapshotListBudget`, `textLength`, `seoTextLength` | 300 |
   | `fields/builders.ts` | option readers, string builders, `field`, select presentation, `toFieldMetadata`, `normalizeFieldDefinition` and its private normalizers | 700 |
   | `references/field-paths.ts` | `encodeFieldPath`, `decodeFieldPath` | 25 |
   | `references/media.ts` | `FieldMediaReference`, `collectFieldMedia`, `detachFieldMedia`, `effectiveAltText` | 100 |
   | `references/internal-links.ts` | `FieldInternalLinkReference`, `collectFieldInternalLinks`, `InternalLinkReference`, `PublicInternalLinkReference`, `collectSnapshotInternalLinks` | 120 |
   | `blocks/definition.ts` | block patterns, anchor/class limits and checks, `BlockConfigurationError`, migration types and `BlockMigrationError`, `BLOCK_SETTING_FIELD_TYPES`, settings visibility, block DSL types (except `FieldVisibilityTargets`/`BlockDataValues`, owned by `fields/definitions.ts`), `defineBlock`, `toBlockMetadata`, registry, `validateBlockData`, `validateBlockSettings`, `migrateBlockData`, `publishedBlockData` | 685 |
   | `blocks/list-layout.ts` | `listLayoutSettingsVisibility`, `listLayoutSettings` | 150 |
   | `blocks/built-ins.ts` | shared built-in field constants, `builtInBlocks` | 330 |
   | `entries/list-query-policy.ts` | (moved unchanged) | 40 |
   | `entries/canonical-json.ts` | `canonicalizeJson`, `canonicalJsonByteLength`, `WebCryptoLike`, `sha256CanonicalJson` and their private helpers | 80 |
   | `entries/aggregate.ts` | `MAX_TITLE_LENGTH`, `MAX_TOP_LEVEL_BLOCKS`, `MAX_JSON_BYTES`, payload and aggregate types, `validateEntryPayload`, `validateEntryAggregate` | 270 |
   | `index.ts` | re-exports only | 130 |

   File names do not repeat their directory (`fields/builders.ts`, not
   `fields/fields.ts`). The internal-link token codec stays in `fields/`
   because the URL policy of rich text and URL fields decodes tokens;
   placing it in `references/` would make `fields` and `references` import
   each other. Exact imports follow what each moved body references; the
   acyclicity and direction rules, not a per-module import list, are the
   requirement.

2. **Shared error classes live in `shared/errors.ts`.** `fail` and
   `invalid` are called from both sides of the fields/blocks seam; keeping
   `FieldConfigurationError` beside the builders would make `layout.ts`,
   `visibility.ts` and `json.ts` import the builders, which import them back
   (runtime cycle). `errors.ts` already owns the RF3D base. Block errors stay
   in `blocks/definition.ts`, their only thrower. Alternative rejected:
   separate field/validation error modules — two more files for the same
   dependency effect.

3. **Types that close loops move down, not functions up.** Layout and
   visibility types are referenced by `GroupFieldDefinition`, and
   `FieldVisibility` defaults to `ModelFieldDefinitions`; all
   descriptor-shaped types, including `ModelFieldDefinitions` and
   `ModelFieldValues` (moved from the validation range), live in
   `fields/definitions.ts`; the runtime normalizers import them.
   The apply-time graph check found an additional existing dependency:
   `FieldValue` uses `BlockDataValues` for group values. Keeping that type in
   `blocks/definition.ts` introduces a type-only back edge and several cycles.
   Owner-confirmed refinement (2026-11-03): `BlockDataValues` and its helper
   `FieldVisibilityTargets` move verbatim to `fields/definitions.ts`; the block
   module imports them and the package entry keeps their public names. This
   closes the fields/blocks loop without renaming or changing inferred types.
   `BlockSettingsValues` stays in the block module because no lower module
   depends on it.
   `publishedBlockData` moves to `blocks/definition.ts`, as the roadmap
   specifies, so `fields/validation.ts` no longer references block types.

4. **No subdirectory barrels; explicit entry re-exports.** `index.ts`
   re-exports concrete files only, one group per directory with a comment.
   The moved leaf modules keep `export *` (their whole content is public);
   every other module is re-exported by an explicit name list. Internal
   helpers shared between modules (`fail`, `invalid`, `assertExactKeys`,
   `normalizeJsonValue`, `normalizeFieldValue`, `isSafeRichTextDocument`,
   `FIELD_KEY_PATTERN`) are exported from their module but never from
   `index.ts`. Alternative rejected: an `index.ts` per directory — it adds
   one-line indirection files (the admin pattern RF6 removes) and hides which
   file a name lives in.

5. **Verbatim moves, one directory per step, bottom-up.** Each step moves
   its modules, adds the imports their bodies need, re-exports them, and
   runs the content suite before the next step. Declarations keep their
   order within a module, their JSDoc and comments. No identifier is
   renamed; the only non-move edits are `export` keywords on the internal
   helpers of decision 4, import lines and the `schema-path.ts` type import.
   Files are moved with `git mv` where a module keeps its whole content, so
   history follows them.

6. **Export-surface check.** Before the first move, build the package and
   record, with the TypeScript checker over `dist/index.d.ts`, every export
   name with its meaning (value, type, or both), and `Object.keys` of
   `dist/index.js`. After the last move the same scratch script must print
   an identical list; `packaged-exports.packaged.test.mjs` already pins the
   runtime keys. Root `pnpm typecheck` across every dependent workspace
   member is the type-level compatibility check.

7. **Acyclicity and direction check.** After the last move, a scratch
   script reads the relative specifiers (including `import type`) of every
   non-test module in `packages/content/src`, reports module cycles and any
   import from a lower directory to a higher one, and must report none. The
   result is recorded in `verification.md`. Alternative rejected for this
   session: generalizing it into `check-boundaries` — other packages have
   known type-only cycles (RF4B) and no directory order yet.

8. **Test split by module, assertions untouched.** Each test moves beside
   the module that owns the first public function it asserts on (RF2B
   rule), imports from that module and its dependencies instead of
   `./index.js`, and keeps its title, body and position relative to its
   neighbours. Existing focused files move with their modules
   (`shared/identifiers.test.ts`, `shared/objects.test.ts`,
   `fields/capabilities.test.ts`); `conditional-fields.test.ts` and
   `error-arguments.test.ts` span several field modules and move to
   `fields/` unchanged except imports; `packaged-exports.packaged.test.mjs`
   stays at the root as the only package-level test.

   | New file | Tests from `index.test.ts` |
   | --- | --- |
   | `fields/rich-text.test.ts` | `canonical internal URL targets`; `allows only the confirmed rich-text grammar and URL policy`; `expanded and existing rich text keeps …`; `rich-text nodes do not consume composite list budget …` (with `plainCode`, `expandedDocument`, `unsupportedRichNodes`) |
   | `fields/builders.test.ts` | `normalizes common and type-specific options`; `detaches and freezes caller-provided options …`; `projects detached serializable form metadata`; the `invalidConfigurations` table; `reports cyclic and sparse values …`; `rejects symbols and accessors …`; `keeps a valid renamedFrom hint …`; `composite schema boundaries …`; `composite defaults are portable …`; `nested model hints remain portable …`; `list itemLabel is portable …`; `CE9A placeholders are portable …`; `portable select cards`; `embed descriptor rejects invalid options …` |
   | `fields/layout.test.ts` | `visual form layout metadata`; `CE9B layouts survive the maximum six-container branch` |
   | `fields/validation.test.ts` | `compiles every field descriptor …`; `validates model fields in draft and publish modes`; `composite absence, explicit empties …`; `composite exact leaf paths …`; `CE9A shared counts …`; `embed URL grammar is shared …` |
   | `fields/video-embeds.test.ts` | `embed ambient URLs are canonical …` |
   | `references/internal-links.test.ts` | `descriptor-driven internal link projection` (with `fieldCases`) |
   | `references/media.test.ts` | `media traversal …`; `media detaching …`; `effective alt text prefers …` |
   | `blocks/definition.test.ts` | `defines detached versioned blocks …`; `defines runtime-only block migrations …` (with `quoteV3`); `fails block migration composition …`; `migrations carry, rename and keep block settings`; `declares block settings with defaults …` (with `settingsBlock`); `bounded scalar setting visibility` |
   | `blocks/list-layout.test.ts` | `list settings are fresh ordinary scalars …`; `Gallery and custom lists share visibility …` |
   | `blocks/built-ins.test.ts` | the image, gallery, lightbox, navigation, `videoEmbed` and `Link uses ordinary URLs …` tests |
   | `entries/canonical-json.test.ts` | `canonicalizes JSON and hashes canonical UTF-8 bytes with Web Crypto` |
   | `entries/aggregate.test.ts` | `validates and normalizes the block envelope`; `validates hidden blocks in draft mode …`; `registers public-DSL built-ins and validates ordered entry aggregates`; `enforces entry system-field …`; `accepts a global payload …`; `list and snapshot budgets …`; `normalized block bytes include composite defaults` (with `envelopeAggregate`, `panel`) |

   A helper used by one destination moves with it; `issueOf`/`issueFrom`
   and any helper used by more than one destination move to
   `src/test-support/content-test-helpers.ts`, which declares no tests.
   `index.test.ts` is removed. Each file split from the `@ts-nocheck`
   monolith keeps the same header and `TODO(rf2)` reason; the verification
   note lists the resulting count. Alternative rejected: leaving
   `index.test.ts` whole — it would stay the only 2,000-line file in the
   package, and RF4C splits its test file the same way.

9. **Type tests split and gated.** `index.type-test.ts` splits into
   `fields/builders.type-test.ts` (builders, `FieldValue`,
   `FieldIsRequired`, visitor, composites, placeholders, select cards, embed
   URLs), `fields/visibility.type-test.ts` (conditional groups, lists and
   blocks), `fields/capabilities.type-test.ts`, `fields/rich-text.type-test.ts`,
   `blocks/definition.type-test.ts` (`defineBlock`, migrations, settings,
   `BlockDefinition` assignability) and `blocks/built-ins.type-test.ts`
   (gallery and navigation data); `Equal`/`Expect` move to
   `src/test-support/type-assertions.ts`. Type tests import `../index.js`,
   because they assert the public inference surface. The stale
   `@ts-expect-error` moves onto the `sortableAs` line it targets.
   `tsconfig.type-test.json` includes `src/index.ts`,
   `src/**/*.type-test.ts` and `src/test-support/type-assertions.ts`; the
   package `typecheck` script appends `&& tsc -p tsconfig.type-test.json`,
   and `type-test` stays as an alias. Alternative rejected: adding type
   tests to `tsconfig.test.json` — that project enables Node types and the
   legacy `@ts-nocheck` files; type tests must compile against the library
   settings only.

10. **Vocabulary guards follow the declarations.**
    `tests/field-type-vocabulary.test.mjs` reads `FieldType` from
    `fields/capabilities.ts`, treats that whole module as the declaration
    site, and blanks only the `BLOCK_SETTING_FIELD_TYPES` declaration in
    `blocks/definition.ts`; every other content module is scanned exactly
    as its former range of `index.ts` was. `tests/shared-vocabulary.test.mjs`
    pins `LaceError`/`InvariantError` to `shared/errors.ts`; its
    `packages/content/src/` ownership prefix already covers subdirectories.

11. **Source layout convention.** Architecture §6 gains a *Source layout*
    subsection, summarized in `AGENTS.md` and recorded in ADR 0020:
    - a package's `src/` root holds its entry points (`index.ts`, `bin.ts`,
      declared subpath entries) and package-level tests; other modules live
      in domain directories named by what they own, and a package adopts
      directories as soon as it has a second concern;
    - one responsibility per file; a file is split in the same change
      before it reaches 1,000 lines (aim for a few hundred);
    - no barrel `index.ts` inside a subdirectory; the package entry
      re-exports concrete files, explicitly where a module has internal
      helpers;
    - directories depend one way, documented in a comment at the top of the
      entry point; no module cycles, type-only included;
    - tests and type tests sit beside their module; shared test helpers live
      in `src/test-support/`;
    - `apps/admin` keeps its existing layer and slice structure
      (architecture §17 *Source layers*, `admin-source-structure`), to which
      the size limit and the no-cycle rule also apply.
    Existing flat packages adopt directories when their RF4–RF6 session (or
    any change that adds a second concern) touches them; this change does
    not move other packages.

12. **Size guard with a shrinking baseline.** `scripts/check-boundaries.mjs`
    counts physical lines of every production file it already scans (test
    files and `test-support/` excluded) and fails when a file exceeds 1,000
    lines unless `<root>/scripts/oversized-source-baseline.json` lists it
    (path relative to the root → recorded line count) and the file is at or
    under that count. It also fails, naming the entry, when a baseline entry
    names a missing file or a file within the limit, so a split must delete
    its entry. A missing baseline file means an empty baseline, which keeps
    fixture roots in `tests/boundaries.test.mjs` simple. The baseline is
    generated once after the content split and lists the 18 oversized files
    outside `content` at their sizes then. Alternatives rejected: a
    constant inside the checker (fixture roots would see stale entries); a
    warning instead of a failure (the RF2–RF3 audit shows warnings do not
    stop growth); a lower limit now (would baseline dozens of files with no
    session planned to split them).

## Risks / Trade-offs

- [Runtime cycle changes evaluation order] A missed import from a lower
  module back to the builders or block definition would leave
  `builtInBlocks` or the capability table `undefined` at load → decision 7
  check plus the full content suite after each step; the packaged test
  imports built output.
- [Silent export loss or leak] A forgotten name in an explicit re-export
  list drops an export; an `export *` slip leaks an internal helper →
  decision 6 list comparison, before and after.
- [Declaration output differs] Moving a type can change how `.d.ts` prints
  an inferred type → root typecheck of every consumer; `apps/admin` and
  `render` exercise the inferred block and field types.
- [Baseline friction] A contributor growing a baselined file by one line
  fails `pnpm lint` → intended; the message names the file and the
  baseline, and the remedy is to extract the addition into a new module in
  a domain directory.
- [Guard counts generated or data-like files] A long declarative table
  (for example the built-in blocks) may approach the limit → it splits by
  block family like any other module; no per-file exception mechanism
  beyond the baseline.
- [More `@ts-nocheck` headers] The one legacy exception becomes several
  files with the same reason → recorded; RF2's typing debt is unchanged in
  substance.

## Migration Plan

One change on the `docs/refactoring-roadmap` branch after RF3D; no data,
API or generated-project migration. Revert the commit to roll back. Later
sessions delete their baseline entries as they split files; the guard
fails if they forget.
