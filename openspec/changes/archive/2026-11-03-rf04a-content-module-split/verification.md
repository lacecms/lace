# RF4A verification

Baseline captured before implementation with Node 24.22.1 and Corepack pnpm 12.3.4.

- Content build passes; 180 declaration exports and 93 runtime exports.
- Vitest list: 115 titles (index 71, conditional-fields 31, error-arguments 4, field-capabilities 4, identifiers 3, objects 2).
- Type-test reproduces TS2578/TS2322 at index.type-test.ts 530/533.
- Scratch files exist under /tmp/rf04a/: exports-before.json, surface.mjs; test titles in /tmp/rf04a-tests-before.json.
- Source layout documented in architecture §6, AGENTS.md and ADR 0020. Documentation link guard: 6 cases pass.

## Baseline exports

Meaning: v = value, t = type, vt = both.

`BLOCK_SETTING_FIELD_TYPES` (v), `BlockConfigurationError` (vt), `BlockDataValues` (t), `BlockDefinition` (t), `BlockDefinitionInput` (t), `BlockMetadata` (t), `BlockMigration` (t), `BlockMigrationError` (vt), `BlockMigrationErrorCode` (t), `BlockMigrationInput` (t), `BlockMigrationOutput` (t), `BlockMigrations` (t), `BlockRegistry` (t), `BlockSettingsValues` (t), `BooleanFieldDefinition` (t), `BooleanFieldOptions` (t), `builtInBlocks` (v), `canonicalizeJson` (v), `canonicalJsonByteLength` (v), `ChoiceDiagram` (t), `CLOUDFLARE_LIST_QUERY_LIMITS` (v), `collectFieldInternalLinks` (v), `collectFieldMedia` (v), `COLLECTION_MATCHING_VERSION` (v), `collectionPathFailure` (v), `collectionRouteFailure` (v), `collectSnapshotInternalLinks` (v), `CommonFieldOptions` (t), `CompiledFieldSchema` (t), `compileFieldSchema` (v), `ContentModelKind` (t), `ContentValidationError` (vt), `ContentValidationIssue` (t), `ContentValidationMode` (t), `DateFieldDefinition` (t), `DatetimeFieldDefinition` (t), `declaresFieldVisibility` (v), `decodeEntryLink` (v), `decodeFieldPath` (v), `deepFreeze` (v), `defineBlock` (v), `defineBlockRegistry` (v), `detachFieldMedia` (v), `DraftFieldValue` (t), `effectiveAltText` (v), `effectiveVisibilityValues` (v), `EmbedProvider` (t), `encodeEntryLink` (v), `encodeFieldPath` (v), `encodeSchemaPath` (v), `EntryAggregateBlock` (t), `EntryAggregateInput` (t), `EntryAggregateModel` (t), `EntryBlockData` (t), `EntryPayloadInput` (t), `field` (v), `FIELD_FILTER_OPERATIONS` (v), `FieldConfigurationError` (vt), `FieldDefinition` (t), `FieldDefinitionVisitor` (t), `FieldFilterKind` (t), `FieldInternalLinkReference` (t), `FieldIsRequired` (t), `FieldMediaReference` (t), `FieldMetadata` (t), `FieldSortFamily` (t), `FieldType` (t), `fieldTypeCapabilities` (v), `FieldTypeCapability` (t), `fieldTypesWith` (v), `FieldValue` (t), `FieldValueKind` (t), `FieldVisibility` (t), `FieldVisibilityRule` (t), `FieldVisibilityTargets` (t), `fitsListQueryLimits` (v), `formFieldKeys` (v), `FormLayout` (t), `GroupFieldDefinition` (t), `InternalLinkReference` (t), `InvariantError` (vt), `isBlockAnchor` (v), `isContentSlug` (v), `isFieldVisible` (v), `isInternalLinkTargetId` (v), `isPlainObject` (v), `isRecord` (v), `isSafeUrl` (v), `isUrlFieldTarget` (v), `ItemLabelFieldType` (t), `JsonObject` (t), `JsonPrimitive` (t), `JsonValue` (t), `LaceError` (vt), `ListFieldDefinition` (t), `ListItemDefinition` (t), `listLayoutSettings` (v), `listLayoutSettingsVisibility` (v), `ListQueryableFieldType` (t), `ListQueryLimits` (t), `literalLikePattern` (v), `MAX_BLOCK_ANCHOR_LENGTH` (v), `MAX_BLOCK_CLASS_NAME_LENGTH` (v), `MAX_BLOCK_CLASS_TOKEN_LENGTH` (v), `MAX_BLOCK_CLASS_TOKENS` (v), `MAX_BUILD_EXPORT_PAGE_SIZE` (v), `MAX_CONSECUTIVE_GROUPS` (v), `MAX_ENTRY_SEARCH_LENGTH` (v), `MAX_FIELD_CONTAINER_DEPTH` (v), `MAX_INTERNAL_LINK_REFERENCES` (v), `MAX_JSON_BYTES` (v), `MAX_LIST_ITEMS` (v), `MAX_MEDIA_SEARCH_LENGTH` (v), `MAX_MEDIA_USAGE_ENTRIES` (v), `MAX_SLUG_LENGTH` (v), `MAX_SNAPSHOT_LIST_ITEMS` (v), `MAX_TITLE_LENGTH` (v), `MAX_TOP_LEVEL_BLOCKS` (v), `MediaFieldDefinition` (t), `migrateBlockData` (v), `ModelFieldDefinitions` (t), `ModelFieldValues` (t), `NoBlockSettings` (t), `NODE_LIST_QUERY_LIMITS` (v), `normalizeBlockClassName` (v), `normalizeFieldDefinition` (v), `normalizeFieldVisibility` (v), `normalizeFormLayout` (v), `normalizeSettingsVisibility` (v), `NumberFieldDefinition` (t), `NumberFieldOptions` (t), `pagePathFailure` (v), `parseSchemaPath` (v), `parseVideoEmbed` (v), `PlaceholderFieldOptions` (t), `PlaceholderFieldType` (t), `PublicInternalLinkReference` (t), `publishedBlockData` (v), `publishedFieldValues` (v), `RichTextFieldDefinition` (t), `RichTextFieldOptions` (t), `RouteFailure` (t), `RouteIssue` (t), `SafeRichTextDocument` (t), `SafeRichTextMark` (t), `SafeRichTextNode` (t), `schemaFieldAt` (v), `SearchableFieldType` (t), `SelectFieldDefinition` (t), `SelectFieldOptions` (t), `SelectPresentation` (t), `SeoTextFieldType` (t), `seoTextLength` (v), `SettingsVisibility` (t), `sha256CanonicalJson` (v), `SLUG_PATTERN` (v), `StringFieldOptions` (t), `StringValueFieldOptions` (t), `TextareaFieldDefinition` (t), `TextFieldDefinition` (t), `textLength` (v), `toBlockMetadata` (v), `toBlockRegistryMetadata` (v), `toFieldMetadata` (v), `UrlFieldDefinition` (t), `UrlFieldOptions` (t), `validateBlockData` (v), `validateBlockSettings` (v), `ValidatedEntryAggregate` (t), `ValidatedEntryAggregateBlock` (t), `validateEntryAggregate` (v), `validateEntryPayload` (v), `validateFieldValue` (v), `validateModelFields` (v), `validateRichTextDocument` (v), `validateSnapshotListBudget` (v), `ValidationPathSegment` (t), `VideoEmbedDescription` (t), `visitFieldDefinition` (v), `WebCryptoLike` (t).

Runtime keys: `BLOCK_SETTING_FIELD_TYPES`, `BlockConfigurationError`, `BlockMigrationError`, `CLOUDFLARE_LIST_QUERY_LIMITS`, `COLLECTION_MATCHING_VERSION`, `ContentValidationError`, `FIELD_FILTER_OPERATIONS`, `FieldConfigurationError`, `InvariantError`, `LaceError`, `MAX_BLOCK_ANCHOR_LENGTH`, `MAX_BLOCK_CLASS_NAME_LENGTH`, `MAX_BLOCK_CLASS_TOKENS`, `MAX_BLOCK_CLASS_TOKEN_LENGTH`, `MAX_BUILD_EXPORT_PAGE_SIZE`, `MAX_CONSECUTIVE_GROUPS`, `MAX_ENTRY_SEARCH_LENGTH`, `MAX_FIELD_CONTAINER_DEPTH`, `MAX_INTERNAL_LINK_REFERENCES`, `MAX_JSON_BYTES`, `MAX_LIST_ITEMS`, `MAX_MEDIA_SEARCH_LENGTH`, `MAX_MEDIA_USAGE_ENTRIES`, `MAX_SLUG_LENGTH`, `MAX_SNAPSHOT_LIST_ITEMS`, `MAX_TITLE_LENGTH`, `MAX_TOP_LEVEL_BLOCKS`, `NODE_LIST_QUERY_LIMITS`, `SLUG_PATTERN`, `builtInBlocks`, `canonicalJsonByteLength`, `canonicalizeJson`, `collectFieldInternalLinks`, `collectFieldMedia`, `collectSnapshotInternalLinks`, `collectionPathFailure`, `collectionRouteFailure`, `compileFieldSchema`, `declaresFieldVisibility`, `decodeEntryLink`, `decodeFieldPath`, `deepFreeze`, `defineBlock`, `defineBlockRegistry`, `detachFieldMedia`, `effectiveAltText`, `effectiveVisibilityValues`, `encodeEntryLink`, `encodeFieldPath`, `encodeSchemaPath`, `field`, `fieldTypeCapabilities`, `fieldTypesWith`, `fitsListQueryLimits`, `formFieldKeys`, `isBlockAnchor`, `isContentSlug`, `isFieldVisible`, `isInternalLinkTargetId`, `isPlainObject`, `isRecord`, `isSafeUrl`, `isUrlFieldTarget`, `listLayoutSettings`, `listLayoutSettingsVisibility`, `literalLikePattern`, `migrateBlockData`, `normalizeBlockClassName`, `normalizeFieldDefinition`, `normalizeFieldVisibility`, `normalizeFormLayout`, `normalizeSettingsVisibility`, `pagePathFailure`, `parseSchemaPath`, `parseVideoEmbed`, `publishedBlockData`, `publishedFieldValues`, `schemaFieldAt`, `seoTextLength`, `sha256CanonicalJson`, `textLength`, `toBlockMetadata`, `toBlockRegistryMetadata`, `toFieldMetadata`, `validateBlockData`, `validateBlockSettings`, `validateEntryAggregate`, `validateEntryPayload`, `validateFieldValue`, `validateModelFields`, `validateRichTextDocument`, `validateSnapshotListBudget`, `visitFieldDefinition`.


## Earlier implementation checkpoint and plan refinement (superseded below)

Shared, field, reference, block and entry declarations have been extracted into
five domain directories, with concrete entry re-exports. Existing leaf modules
were moved with `git mv`. Before pausing, content source tests pass (241 expanded
cases in six files), content builds, and the declaration/runtime export inventory
is byte-identical to the baseline (180/93). Documentation and shared-vocabulary
guards pass (23 cases). Source formatting was applied.

The graph check in `/tmp/rf04a/graph.mjs` found the back edge
`fields/definitions.ts → blocks/definition.ts`: `FieldValue` uses
`BlockDataValues`, so the original plan's placement creates type-only cycles.
The owner confirmed moving `BlockDataValues` and `FieldVisibilityTargets` to
`fields/definitions.ts` on 2026-11-03. Proposal, design and tasks now reflect that
refinement; no type-body or public-name changes are authorized or needed.
Tasks 2.3 and 3.2 were reopened for the new placements. At that checkpoint the implementation had
not yet incorporated this refinement and the graph check was failing.

Remaining work includes the refined type placement, acyclicity verification,
test/type-test split, stale expectation fix and type-test gate, size guard and
baseline, boundary cases, field-vocabulary guard paths, verification/roadmap
updates and all final workspace gates. Full root gates have not run. The current
field-vocabulary guard still points at the old declaration site (task 6.1).
The original type-test failure is not yet fixed. This checkpoint is not a
completed change and is not ready to archive.


## Completed implementation checks

- The owner-confirmed type placement is implemented. Graph check: 24 production modules, no cycles (including types), no upward directory imports. Export inventory is byte-identical to baseline: 180 declaration names with value/type meaning, 93 runtime keys. Internal helpers do not leak. Entry: 178 lines; 23 concrete modules in five domain directories; largest production module: fields/builders.ts, 736 lines.
- Source suite: 17 test files / 241 expanded cases. All 115 listed titles match baseline after sorting. Six type-test companions compile through the ordinary package typecheck; removing the capability expectation yields TS2322, then the directive was restored. Unchanged packaged export case passes.
- Size baseline: exactly 18 oversized production files, all outside content. Boundary cases exercise 1000/1001 lines, baseline equality/shrink/growth, stale missing/within-limit entries, and excluded tests/helpers. The move exposed a stalled lexical scan on the # in the unchanged block-class regex; the existing scanner now guarantees progress as the vocabulary scanner already does. A timeout-bounded regression proves a following forbidden import is still rejected. There are 11 new root boundary cases in total.
- Vocabulary guard reads fields/capabilities.ts and exempts only the existing block-settings declaration. A temporary duplicated list in fields/builders.ts is rejected with its file and line, then removed. Documentation link/shared-vocabulary guards pass.

## Legacy typing exceptions

The monolithic index test had one @ts-nocheck header before splitting. It now has 13 headers (the twelve companions plus shared helpers); every file retains the exact TODO(rf2) reason above. No assertion or fixture typing debt is silently removed.

- `packages/content/src/blocks/built-ins.test.ts`
- `packages/content/src/blocks/definition.test.ts`
- `packages/content/src/blocks/list-layout.test.ts`
- `packages/content/src/entries/aggregate.test.ts`
- `packages/content/src/entries/canonical-json.test.ts`
- `packages/content/src/fields/builders.test.ts`
- `packages/content/src/fields/layout.test.ts`
- `packages/content/src/fields/rich-text.test.ts`
- `packages/content/src/fields/validation.test.ts`
- `packages/content/src/fields/video-embeds.test.ts`
- `packages/content/src/references/internal-links.test.ts`
- `packages/content/src/references/media.test.ts`
- `packages/content/src/test-support/content-test-helpers.ts`


## Final workspace gates

All required gates pass:

- `pnpm typecheck`: 38 Turbo tasks plus root configuration typecheck.
- `pnpm lint`: 22 Turbo tasks, boundaries including the size ratchet, admin colors.
- `pnpm format:check`: all 1,772 matched files.
- `pnpm build`: 22 Turbo tasks.
- `pnpm test`: 64/64 Turbo tasks; 35 root files / 284 root cases. The previous
  RF3D gate had 273 root cases: the difference is exactly the 11 new boundary
  cases. Source/package case counts are preserved; content retains 115 listed
  titles / 241 expanded cases, Node SQLite 309, D1 218, admin 1,007.
- `pnpm exec openspec validate rf04a-content-module-split --type change --strict`.
- `pnpm spec:validate`: all 86 items pass (84 accepted specs and two active changes).
- `pnpm openapi:check`: no wire schema change.
- `git diff --check`: passes.

The source/packaged gate first needed an unsandboxed retry because SMTP tests
listen on local TCP ports (`listen EPERM` in the sandbox). All 64 package tasks
then passed. One root release-fixture test requires exactly Node 24.12.0 and
rejected Node 24.22.1; the complete `pnpm test` command was repeated successfully
with the installed Node 24.12.0 and Corepack pnpm 12.3.4 (64 package tasks reused
successful results, root cases ran again). Other gates ran on supported Node
24.22.1 with pnpm 12.3.4. No test or toolchain requirement was weakened.

The scratch checker additionally confirms all 214 declarations extracted from
index retain their bodies (ignoring trivia, export modifiers and formatting
commas/leading union bars). Final export inventory remains byte-identical and
the module graph remains acyclic. Original test assertions are unchanged.

Package source-suite expanded counts from the successful workspace run:

| Package | Passed cases |
| --- | ---: |
| `@lacecms/render` | 106 |
| `@lacecms/contracts` | 162 |
| `@lacecms/cli` | 170 |
| `@lacecms/domain` | 28 |
| `@lacecms/app-api` | 21 |
| `@lacecms/app-builder` | 54 |
| `@lacecms/platform-node` | 309 |
| `@lacecms/server` | 138 |
| `@lacecms/sdk` | 104 |
| `@lacecms/mcp` | 6 |
| `@lacecms/astro` | 79 |
| `@lacecms/config` | 76 |
| `@lacecms/app-docs` | 3 |
| `@lacecms/platform-cloudflare` | 218 |
| `@lacecms/test-utils` | 138 |
| `create-lace` | 43 |
| `@lacecms/content` | 241 |
| `@lacecms/db` | 27 |
| `@lacecms/application` | 139 |
| `@lacecms/auth` | 4 |
| `@lacecms/app-admin` | 1007 |

All 21 tasks are complete. The change is implemented and remains unarchived;
accepted specifications have not been synchronized as part of apply.

## Archive

On 2026-11-03 the owner requested archive and commit. The workspace-governance
delta was synchronized and compared exactly before moving the change here:
one added requirement with five scenarios. All 84 accepted specs pass strict
validation. The earlier implementation checkpoint and apply status above are
historical; this change is now archived with all 21 tasks complete.
