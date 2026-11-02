## 1. Baseline

- [x] 1.1 Record in `verification.md` the case counts of `content`, `config`, `contracts`, `application`, `db` and `apps/admin` (`pnpm exec vitest list | grep -c " > "` per package) and the SHA-256 of `apps/api/openapi/api-v1.json`; verify the note lists all six counts and the hash.

## 2. Content capability table

- [x] 2.1 In `packages/content/src/index.ts`, add `FieldSortFamily`, `FieldFilterKind`, `FieldValueKind`, `FieldTypeCapability`, the frozen `fieldTypeCapabilities` (declaration order per design decision 1, values per the `field-descriptors` table), `FIELD_FILTER_OPERATIONS`, `fieldTypesWith` and the derived types `ListQueryableFieldType`, `SearchableFieldType`, `SeoTextFieldType`, `ItemLabelFieldType`, `PlaceholderFieldType`; verify `pnpm --filter @lacecms/content typecheck` passes.
- [x] 2.2 Add unit tests: the table equals the spec table row by row, is deeply frozen, has `sortableAs`/`filterKind` exactly on list-queryable kinds, and `FIELD_FILTER_OPERATIONS` matches the spec; add type tests in `index.type-test.ts` for the derived unions and for rejecting `sortableAs` on a non-queryable entry; verify `pnpm --filter @lacecms/content test` and typecheck pass.
- [x] 2.3 Replace the `itemLabel` literal list and the hard-coded `"placeholder"` entries in the builders' allowed-option lists with table reads (design decision 3); verify the existing content suite passes unchanged, including invalid itemLabel and placeholder cases.
- [x] 2.4 Add the new names to `packages/content/src/packaged-exports.packaged.test.mjs`; verify `pnpm --filter @lacecms/content test:packaged` passes.

## 3. Server-side consumers

- [x] 3.1 `packages/config`: delete `LIST_FIELD_TYPES` and `SEO_TEXT_FIELD_TYPES`, derive `CollectionListOptions` key types from `ListQueryableFieldType` / `SearchableFieldType`, and read the table in `normalizeListFields`, `normalizeListOptions` and the SEO source check with unchanged messages; remove the two names from `packaged-exports.packaged.test.mjs`; verify the config suite (baseline count) and its type tests pass.
- [x] 3.2 `packages/contracts/src/index.ts`: replace the literal arrays in `hasValidListFields` and the `listOptions` check with table reads; verify the contracts suite passes unchanged.
- [x] 3.3 `packages/application/src/collection-queries.ts`: alias `CollectionQueryFieldType` to `ListQueryableFieldType`, gate operators through `FIELD_FILTER_OPERATIONS[filterKind]` and switch operand validation on `filterKind`, keeping every pointer; add cases asserting each kind rejects every operator outside its set at `/filters/0/op`; verify the application suite passes.
- [x] 3.4 `packages/db/src/collection-list.ts`: replace the `strings` set and `datetime` branches with a `sortFamily(field)` helper over `sortableAs`; verify generated SQL is unchanged by a test that snapshots the statement text for one field of each sort family before and after, and that `pnpm --filter @lacecms/db test` passes.
- [x] 3.5 Run the repository contract suite on both runtimes (`pnpm --filter @lacecms/platform-node test` and `pnpm --filter @lacecms/platform-cloudflare test`) and `pnpm exec vitest run --config vitest.verification.config.mjs --project d1-budgets`; verify all pass with unchanged case counts and statement budgets.

## 4. OpenAPI derivation and drift fix

- [x] 4.1 Rewrite the per-type parts of `packages/contracts/src/field-openapi.ts` per design decision 4 (scalar kinds, `placeholder`, `defaultValue` type, extras map, block setting alternatives from `BLOCK_SETTING_FIELD_TYPES`); add `embedProviders` to the URL alternative, a `FormLayout` component, `layout` on `GroupFieldDefinition` and `layout`/`settingsLayout` on `BlockMetadata`; verify `pnpm --filter @lacecms/contracts typecheck` passes.
- [x] 4.2 Add `packages/contracts/src/field-openapi.test.ts` with the keyword-limited evaluator (throws on unknown keywords) and the capability-generated corpus of design decision 5; assert equal verdicts from `contentMetadataOpenApi` and `normalizeFieldDefinition`, including a URL with `embedProviders`, a group with a `tabs` layout, a boolean with a placeholder and a text with `embedProviders`; verify the test passes and fails when `embedProviders` is temporarily removed from the URL schema.
- [x] 4.3 Add a contracts test that a block metadata object with `layout` and `settingsLayout` accepted by shared validation also validates against the `BlockMetadata` schema; verify it passes.
- [x] 4.4 Run `pnpm openapi:generate`, then compare old and new `api-v1.json` with a script that deletes `FieldDefinition`, `GroupFieldDefinition`, `ListFieldDefinition`, `BlockMetadata` and `FormLayout` from `components.schemas` in both and asserts the remainders are deep-equal; record the result in `verification.md`, stage the file and verify `pnpm openapi:check` passes.

## 5. Admin support table

- [x] 5.1 Add `FieldTypeSupport` and `fieldTypeSupport: Readonly<Record<FieldType, FieldTypeSupport>>` to `apps/admin/src/entities/content/field-types.ts` per design decision 6, with a unit test that `listCell` and `filter` are present exactly for list-queryable kinds; verify `pnpm --filter @lacecms/admin typecheck` and the new test pass.
- [x] 5.2 Make `editor-form.ts` (`fieldProblem`), `field-guidance.ts`, `composite-values.ts` (`draftItemValue`), `item-summary.ts` and `collection-query.ts` (`collectionFilterProblem`, operators from `FIELD_FILTER_OPERATIONS`) read the table with unchanged exported names and messages; verify their existing unit tests pass unchanged.
- [x] 5.3 Make `widgets/collection-entries/list-columns.ts` (`formatListValue`), `CollectionFilters.tsx` (`operations`, control type, initial value) and `widgets/block-editor/block-presentation.ts` (summary priority) read the table; add a test that `operations(kind)` equals `FIELD_FILTER_OPERATIONS[filterKind]` followed by `isSet`, `isNotSet` for every list-queryable kind; verify admin unit tests pass and `pnpm --filter @lacecms/admin exec playwright test collection-queries composites field-guidance list-layouts` passes.

## 6. Guard and totality

- [x] 6.1 Add `tests/field-type-vocabulary.test.mjs` per design decision 7 with fixtures under `tests/fixtures/field-type-vocabulary/` (flagged array, flagged `new Set`, flagged union, allowed comparison chain, allowed `"choose" | "open" | "select"` union); verify it passes on the tree and each flagged fixture fails with its file and line.
- [x] 6.2 Run the totality experiment of design decision 8 (temporary `dummy` kind, `pnpm typecheck`, record reporting files in `verification.md`, revert); verify the recorded files are only in `packages/content/src` and the admin `field-types.ts` / `FieldControls` declarations, converting any other reporting site into a derivation before continuing, and that `git status` shows no leftover experiment edits.

## 7. Documentation and gates

- [x] 7.1 Update `docs/mvp-architecture.md` §8 *Initial field types* with the capability table and the derive-don't-copy rule; update the roadmap RF3A section (eight capabilities, admin `draftValue`, OpenAPI drift fix by owner decision) and move the "copies of the list-queryable field types set" baseline row in `docs/refactoring-roadmap.md` to its new value; verify the root link guard (`pnpm test` root files) passes.
- [x] 7.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`, `pnpm openapi:check` and `pnpm exec openspec validate rf03a-field-type-capabilities --type change --strict`; verify all pass and the per-package case counts equal the baseline plus the cases added in this change, recorded in `verification.md`.
