## 1. Baseline and convention

- [x] 1.1 Build `@lacecms/content` and record, in `verification.md`, the export-surface list of design decision 6 (names with value/type meaning from `dist/index.d.ts`, `Object.keys` of `dist/index.js`), `pnpm --filter @lacecms/content exec vitest list` totals per file (expected 115 total, 71 in `index.test.ts`), and the current `type-test` failure (TS2578/TS2322 at `index.type-test.ts` 530/533); verify the recorded lists exist in the session scratchpad.
- [x] 1.2 Add the *Source layout* subsection to `docs/mvp-architecture.md` §6 (decision 11), the matching short rule to `AGENTS.md`, and `docs/adr/0020-source-layout.md` with its `docs/adr/README.md` row; verify the root documentation link guard passes.

## 2. Shared and field modules

- [x] 2.1 Create `shared/` (`git mv` of `errors.ts`, `objects.ts`, `identifiers.ts`; `errors.ts` gains `FieldConfigurationError`/`fail` and `ValidationPathSegment`, `ContentValidationIssue`, `ContentValidationError`, `formatValidationPath`, `invalid`, `assertExactKeys`; new `json.ts`) and re-export from `index.ts`; point `tests/shared-vocabulary.test.mjs` at `shared/errors.ts`; verify the content suite and that root test pass.
- [x] 2.2 Create `fields/capabilities.ts` (lines 27–215), `git mv` `video-embeds.ts` → `fields/video-embeds.ts` and `internal-links.ts` → `fields/internal-link-tokens.ts`, and create `fields/rich-text.ts`; verify the content suite passes.
- [x] 2.3 Create `fields/definitions.ts` with every descriptor-shaped type of decision 1 (including the layout and visibility types, `ModelFieldDefinitions`, `ModelFieldValues`, and the owner-confirmed `FieldVisibilityTargets`/`BlockDataValues` move from the block range), composite limits, `FIELD_KEY_PATTERN` and the visitor; `git mv` `schema-path.ts` → `fields/schema-path.ts` with its type import pointed at `definitions.ts`; verify the content suite passes and `tsc -p packages/content/tsconfig.json --noEmit` succeeds.
- [x] 2.4 Create `fields/layout.ts`, `fields/visibility.ts` and `fields/validation.ts` (without `publishedBlockData`); verify the content suite passes.
- [x] 2.5 Create `fields/builders.ts` (option readers, builders, select presentation, `toFieldMetadata`, descriptor normalization); verify the content suite passes.

## 3. References, blocks and entries

- [x] 3.1 Create `references/field-paths.ts`, `references/media.ts` (with `effectiveAltText`) and `references/internal-links.ts`; verify the content suite passes.
- [x] 3.2 Create `blocks/definition.ts` (lines 2337–3047 except `FieldVisibilityTargets`/`BlockDataValues`, imported from `fields/definitions.ts`, plus `publishedBlockData`), `blocks/list-layout.ts` and `blocks/built-ins.ts`; verify the content suite passes.
- [x] 3.3 Create `entries/canonical-json.ts` and `entries/aggregate.ts`, `git mv` `list-query-policy.ts` → `entries/list-query-policy.ts`, leaving `index.ts` as the only root module and containing re-exports only (decision 4 grouping, directory-order comment); verify the content suite passes, `ls packages/content/src/*.ts` shows only `index.ts`, and no non-test module exceeds 1,000 lines.
- [x] 3.4 Run the decision 6 export-surface script and the decision 7 acyclicity/direction script; verify the export list equals the baseline byte for byte, no internal helper is exported, and no module cycle or upward directory import exists, and record both results in `verification.md`.

## 4. Tests

- [x] 4.1 Move `identifiers.test.ts`, `objects.test.ts`, `field-capabilities.test.ts`, `conditional-fields.test.ts` and `error-arguments.test.ts` per decision 8, and split `index.test.ts` into the twelve files of the decision 8 table with shared helpers in `src/test-support/content-test-helpers.ts`, deleting `index.test.ts`; verify `vitest list` lists the same 115 case titles as the baseline (sorted diff empty) and the content suite passes.
- [x] 4.2 Split `index.type-test.ts` into the six files of decision 9 with `src/test-support/type-assertions.ts`, move the stale `@ts-expect-error` onto the `sortableAs` line, update `tsconfig.type-test.json`, and append the type-test project to the package `typecheck` script; verify `pnpm --filter @lacecms/content typecheck` passes and that removing one `@ts-expect-error` target makes it fail (then restore).
- [x] 4.3 Run `pnpm --filter @lacecms/content build` and `pnpm --filter @lacecms/content test:packaged`; verify the packaged export case passes unchanged.

## 5. Size guard

- [x] 5.1 Add the decision 12 size check to `scripts/check-boundaries.mjs` and generate `scripts/oversized-source-baseline.json` from the post-split tree; verify it lists exactly the oversized production files outside `packages/content` (18 at `1ac97ec2`) and `node scripts/check-boundaries.mjs` passes.
- [x] 5.2 Add `tests/boundaries.test.mjs` cases on temporary fixture roots: a new 1,001-line production file fails naming it; a baselined file grown past its count fails; a baselined file shrunk but still oversized passes; a baseline entry for a missing or ≤1,000-line file fails naming the entry; a 1,001-line `*.test.ts` or `test-support/` file passes; verify the root boundaries test passes and each failing case asserts its message.

## 6. Guards and documentation

- [x] 6.1 Point `tests/field-type-vocabulary.test.mjs` at `fields/capabilities.ts` and the `BLOCK_SETTING_FIELD_TYPES` declaration in `blocks/definition.ts` per decision 10; verify the root test passes and a temporary duplicated kind list in `packages/content/src/fields/builders.ts` makes it fail (then remove it).
- [x] 6.2 Update the Tiptap row of `docs/verification.md` to cite `packages/content/src/fields/rich-text.test.ts`; verify the root documentation link guard passes.
- [x] 6.3 Update `docs/refactoring-roadmap.md`: RF4 *What* states the §6 source layout and that RF4B–RF4E (and RF5/RF6 for their files) map their modules into domain directories and delete their baseline entries; the §3 baseline gains the content row result and an "oversized production files" row (19 → 18 baselined); add the RF4A progress-log row; verify `pnpm format:check` passes.

## 7. Gates

- [x] 7.1 Record in `verification.md` the `@ts-nocheck` header count before (1) and after the split, with the unchanged `TODO(rf2)` reason; verify each listed file carries the header.
- [x] 7.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test` and `pnpm exec openspec validate rf04a-content-module-split --type change --strict`; verify all pass with root and per-package case counts equal to the baseline plus the new boundaries cases.
