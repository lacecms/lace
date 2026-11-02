# RF3C verification

## Baseline

Node v24.22.1; project-pinned pnpm 12.3.4 through Corepack. Source counts from `pnpm exec vitest list`, counting lines containing ` > ` per package. Content build passed.

| Package | Cases |
| --- | --- |
| packages/content | 106 |
| packages/application | 131 |
| packages/test-utils | 58 |
| packages/render | 41 |
| packages/platform-node | 71 |
| packages/platform-cloudflare | 79 |
| apps/admin | 901 |

OpenAPI SHA-256: `2d27764152253af8a9616208077f59a64ddd896bdc114f46885bce155825a8d5`.

Content exports from `dist/index.d.ts` (145):

```text
BLOCK_SETTING_FIELD_TYPES
BlockConfigurationError
BlockDataValues
BlockDefinition
BlockDefinitionInput
BlockMetadata
BlockMigration
BlockMigrationError
BlockMigrationErrorCode
BlockMigrationInput
BlockMigrationOutput
BlockMigrations
BlockRegistry
BlockSettingsValues
BooleanFieldDefinition
BooleanFieldOptions
ChoiceDiagram
CommonFieldOptions
CompiledFieldSchema
ContentValidationError
ContentValidationIssue
ContentValidationMode
DateFieldDefinition
DatetimeFieldDefinition
DraftFieldValue
EntryAggregateBlock
EntryAggregateInput
EntryAggregateModel
EntryBlockData
EntryPayloadInput
FIELD_FILTER_OPERATIONS
FieldConfigurationError
FieldDefinition
FieldDefinitionVisitor
FieldFilterKind
FieldInternalLinkReference
FieldIsRequired
FieldMediaReference
FieldMetadata
FieldSortFamily
FieldType
FieldTypeCapability
FieldValue
FieldValueKind
FieldVisibility
FieldVisibilityRule
FieldVisibilityTargets
FormLayout
GroupFieldDefinition
InternalLinkReference
ItemLabelFieldType
JsonObject
JsonPrimitive
JsonValue
ListFieldDefinition
ListItemDefinition
ListQueryableFieldType
MAX_BLOCK_ANCHOR_LENGTH
MAX_BLOCK_CLASS_NAME_LENGTH
MAX_BLOCK_CLASS_TOKENS
MAX_BLOCK_CLASS_TOKEN_LENGTH
MAX_CONSECUTIVE_GROUPS
MAX_FIELD_CONTAINER_DEPTH
MAX_JSON_BYTES
MAX_LIST_ITEMS
MAX_SNAPSHOT_LIST_ITEMS
MAX_TITLE_LENGTH
MAX_TOP_LEVEL_BLOCKS
MediaFieldDefinition
ModelFieldDefinitions
ModelFieldValues
NoBlockSettings
NumberFieldDefinition
NumberFieldOptions
PlaceholderFieldOptions
PlaceholderFieldType
PublicInternalLinkReference
RichTextFieldDefinition
RichTextFieldOptions
SafeRichTextDocument
SafeRichTextMark
SafeRichTextNode
SearchableFieldType
SelectFieldDefinition
SelectFieldOptions
SelectPresentation
SeoTextFieldType
SettingsVisibility
StringFieldOptions
StringValueFieldOptions
TextFieldDefinition
TextareaFieldDefinition
UrlFieldDefinition
UrlFieldOptions
ValidatedEntryAggregate
ValidatedEntryAggregateBlock
ValidationPathSegment
WebCryptoLike
builtInBlocks
canonicalJsonByteLength
canonicalizeJson
collectFieldInternalLinks
collectFieldMedia
collectSnapshotInternalLinks
compileFieldSchema
declaresFieldVisibility
decodeFieldPath
defineBlock
defineBlockRegistry
detachFieldMedia
effectiveAltText
encodeFieldPath
field
fieldTypeCapabilities
fieldTypesWith
formFieldKeys
isBlockAnchor
isFieldVisible
isSafeUrl
isUrlFieldTarget
listLayoutSettings
listLayoutSettingsVisibility
migrateBlockData
normalizeBlockClassName
normalizeFieldDefinition
normalizeFieldVisibility
normalizeFormLayout
normalizeSettingsVisibility
publishedBlockData
publishedFieldValues
seoTextLength
sha256CanonicalJson
textLength
toBlockMetadata
toBlockRegistryMetadata
toFieldMetadata
validateBlockData
validateBlockSettings
validateEntryAggregate
validateEntryPayload
validateFieldValue
validateModelFields
validateRichTextDocument
validateSnapshotListBudget
visitFieldDefinition
```

## Content verification

Content typecheck passed; unchanged suite: 229 cases. Added 8 cases: 237 pass. Temporarily restored the pre-change projection lookup (raw values): the new `projects a group without a defaulted controller and retains key order` case fails, removing `media` incorrectly. Restored shared lookup.

## Delegation and parity verification

Application unchanged suite: 139 pass. Admin unchanged suite: 997 pass; with the 10 shared parity cases: 1007 pass under jsdom. Test-utils typecheck and build pass, including `dist/visibility-parity.js`; the pure subpath imports content only. All 10 parity cases pass for effective visibility, raw projection, publish validation (missing required targets at exact paths), published sync pruning and unchanged draft values.

Cleared form controllers are unset before write validation, since null controllers are never valid stored values. Raw sync/projection deliberately do not insert defaults; ordinary publication materializes them. The runtime contract checks raw snapshots against literal expected projections and compares publication with the normalized sync projection, while checking conditional target keys against the independently declared visible sets.

Negative sync experiment: temporarily restored only application's original default lookup (null treated as present), added `scratch stored null controller` to a scratch copy of the parity table, and ran that case. It failed at the published sync assertion: received `{kind: null}` instead of `{kind: null, media: "image"}`. Restored both files in `finally`; no scratch case or inline application matcher remains (`git status`/diff inspected).

## Vocabulary guard

The tree guard and three new negative fixtures pass (8 root guard cases total). Inline matching reports `inline-visibility.ts:2: inline field visibility match`; duplicate declarations report their exact file and line. The exact settings match in `BlockSettingsFields.tsx` is allowlisted as a separate presentation-only rule.

Source search (excluding dist) finds exactly four functions: content's `effectiveVisibilityValues` and `isFieldVisible`, application's delegating `visibleUnder`, and admin's delegating `effectiveFormValues`.

## Execution environment

Initial sandboxed Node run: 303 pass, 6 SMTP fixture failures caused by `listen EPERM: operation not permitted 127.0.0.1`. Sandboxed D1 run interrupted; Node and D1 suites rerun outside the sandbox to permit local test ports. No production networking change.

## Runtime and quality results

- Test-utils: 5 files / 69 expanded cases (baseline 59 + 10 parity cases).
- Node: 13 files / 309 expanded cases (baseline 307 + one contract case in both file-backed and in-memory SQLite).
- Cloudflare: 13 files / 218 expanded cases (baseline 217 + one D1 contract case).
- Contract registrations: 105 → 106; pinned order preserved. Test-utils pins that list; the Node and D1 suites execute it.
- Root documentation link guard: 2 files / 6 cases pass.
- Root typecheck (38 Turbo tasks plus project config), lint (22 tasks plus boundary/color guards), Oxfmt check, build (22 tasks), OpenAPI check and strict change validation pass.
- OpenAPI SHA-256 unchanged: `2d27764152253af8a9616208077f59a64ddd896bdc114f46885bce155825a8d5`.
- Built content declaration exports compared programmatically: the 145 baseline declarations plus only `effectiveVisibilityValues` (146 final). Packaged runtime export test passes with only that addition. Existing re-export statements are unchanged.

### Final listed titles

`vitest list` lists source titles without expanding tables or dynamic repository registrations. Expanded run totals are recorded above; no old title was removed.

| Package | Baseline | Final | Added titles |
| --- | ---: | ---: | ---: |
| content | 106 | 111 | 5 (8 expanded cases) |
| application | 131 | 131 | 0 |
| test-utils | 58 | 59 | 1 (10 expanded parity cases) |
| render | 41 | 41 | 0 |
| platform-node | 71 | 71 | 0 (dynamic contract adds 2 expanded cases) |
| platform-cloudflare | 79 | 79 | 0 (dynamic contract adds 1 expanded case) |
| app-admin | 901 | 902 | 1 (10 expanded parity cases) |

The first full root run caught the test-utils packaged export expectation missing the planned `visibilityParityCases` export. Updated that list and asserted the packaged subpath exposes the same pure table. No production change; the complete root run is repeated below. Existing unrelated Oxlint warnings remain; none originate in added code.

## Completed full run

The second full run passed all 64 Turbo tasks (21 cached, 4m8.816s), including every source and packaged suite, then root Vitest passed 263/264 cases: the unrelated release-preparation negative test requires exactly Node 24.12.0 and rejected the host's Node 24.22.1 before its injected failure. Repeated the complete `pnpm test` with installed Node 24.12.0 and pnpm 12.3.4: **all 64 Turbo tasks passed (64 cached from the completed package run), and all 35 root files / 264 expanded cases passed** (15.37s). No test or release check was weakened.

Final source counts: content 237, application 139, test-utils 69, render 106, Node 309, D1 218, admin 1007. The final source list comparison and declaration/OpenAPI comparisons above remain valid. All 16 tasks are complete; architecture and roadmap updated. No migration, template, accepted specification or archive changed.

## Archive

Archived 2026-11-02 after comparing the verified delta with the accepted `conditional-fields` specification. Synchronized its one added requirement and all five scenarios, preserving every existing requirement and scenario. All 84 accepted specifications pass strict validation; all 16 implementation tasks remain complete.
