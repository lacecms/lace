## 1. Architecture and planning documents

- [x] 1.1 Add ADR `docs/adr/0018-conditional-fields.md` (owner-level `visibility` format, controller and chain rules, draft semantics for hidden fields, retention and published projection, structural identity, rejected `visibleWhen`, "type only" and clearing alternatives, SM5A/SM5B branch gap); verify the architecture section from 1.2 links it
- [x] 1.2 Update `docs/mvp-architecture.md` §8: replace "General conditional forms and conditional validation remain deferred" with a *Conditional fields (SM5)* section stating the format, evaluation, validation, retention/projection and identity invariants, and narrow the LIST2 paragraph to settings; verify with `git diff` that no other invariant changes
- [x] 1.3 Mark SM5 and SM5A `in progress` in `docs/site-migration-roadmap.md` and record the owner decisions and the draft-semantics refinement in the SM5A section; verify the overview table and progress log agree

## 2. Content declaration and metadata

- [x] 2.1 Add `FieldVisibility`/`FieldVisibilityRule` types and `normalizeFieldVisibility` to `packages/content/src/index.ts` per design D2–D3; verify unit tests for every rejection in the `conditional-fields` load-time requirement (unknown target/controller, self, text controller, chain, empty/duplicate/undeclared values, non-boolean values, extra property, non-JSON input) with exact paths, and for optional controllers being accepted
- [x] 2.2 Accept `visibility` in `field.group` (`normalizeCompositeOptions`), `normalizeFieldDefinition` and `toFieldMetadata`, and reject it on scalar and list descriptors; verify unit tests for nested list-item groups at the deepest CE7 depth, JSON round trip, deep freeze and unchanged encodings without rules
- [x] 2.3 Accept data `visibility` in `defineBlock`, `BlockDefinitionInput`, `BlockMetadata` and `toBlockMetadata`, keeping `settingsVisibility` separate and rejecting data rules that name settings; verify unit tests and unchanged built-in block metadata
- [x] 2.4 Add type tests in `packages/content/src/index.type-test.ts` for restricted targets, select/boolean controllers and option literals in groups and blocks; verify `pnpm --filter @lacecms/content typecheck`

## 3. Evaluation, validation and projection

- [x] 3.1 Export `isFieldVisible` with effective-value semantics (present value, else default, else no match); verify unit tests for defaults, optional absent controllers, booleans and independent list items
- [x] 3.2 Thread owner rules through `normalizeFieldMap` per design D4 (unconditional first, hidden targets in draft mode recursively, declaration order kept), and through `validateModelFields`, `validateBlockData`, `validateFieldValue` for groups and `validateEntryAggregate` via `EntryAggregateModel.visibility`; verify unit tests for every `content-validation` scenario (hidden required, visible required, hidden maxLength and unsafe URL, hidden minItems, invalid controller, list budget counting hidden lists) with unchanged issue codes and paths
- [x] 3.3 Export `publishedFieldValues` and its block-data variant per design D5; verify unit tests that only hidden targets are removed, nested visible groups and list items are walked, and list length, order and retained key order are unchanged
- [x] 3.4 Pass model rules from `normalizeDraftCandidate` into aggregate validation in `packages/application/src/content-use-cases.ts`; verify application tests that a save keeps hidden values and toggling back restores them, and that publish accepts a hidden empty required field

## 4. Configuration

- [x] 4.1 Accept model-level `visibility` in `packages/config/src/index.ts` (`CommonModelInput`, `normalizeCommonModel`, typed against model fields) and keep it in projection and structure identity; verify config tests that structure hashes change with rules, that unopted fixtures keep their hashes, and `settingsVisibility` stays projection-only
- [x] 4.2 Reject `seoDefaults` references to visibility targets while allowing model `seo` fallbacks, `listFields`, `listOptions` and `itemLabel`; verify config tests naming the global and option
- [x] 4.3 Add config type tests in `packages/config/src/index.type-test.ts` for model-level rules; verify `pnpm --filter @lacecms/config typecheck`

## 5. Contracts and OpenAPI

- [x] 5.1 Accept and validate `visibility` in `packages/contracts` model, group and block metadata (normalization equality, settings unchanged); verify contracts tests for round trip and forged rules at each owner
- [x] 5.2 Add the shared `FieldVisibility` schema to `packages/contracts/src/field-openapi.ts` for content models, group field metadata and block metadata and regenerate the OpenAPI document; verify `pnpm openapi:check` and that content DTO schemas are unchanged

## 6. Schema evolution

- [x] 6.1 Add `field-visibility-added`, `field-visibility-removed` and `field-visibility-changed` to `packages/application/src/configuration-evolution.ts` with rename pairing and the classes of design D7, and stop treating model or group `visibility` as `breaking`; verify unit tests for add, remove, narrow, widen, controller change, renamed target and controller, added field with rule and removed target
- [x] 6.2 Extend `transformConfigurationSyncFields` and its callers with baseline rules: prune newly hidden published values, skip backfills into hidden published occurrences, check newly visible published occurrences with publish semantics and hidden ones with draft semantics; verify unit tests for each `schema-evolution` scenario including the backfilled controller default and media reference removal
- [x] 6.3 Apply configured block data rules and the block-data projection to published block rewrites in `packages/application/src/configuration-migration.ts`; verify application tests for a versioned identity migration that hides a published block data value
- [x] 6.4 Add configuration-sync cases to `packages/test-utils/src/repository-contract.ts`: narrowing prunes only published snapshots with unchanged revisions, one published-state advance and one pending build; refused rule removal names snapshots without writes; stale plan rejected; verify on in-memory SQLite, file-backed SQLite and local D1

## 7. Cross-runtime verification and completion

- [x] 7.1 Add a cross-runtime case saving and publishing an entry with model, list-item group and block data rules on Node and the local Worker; verify identical acceptance, issue paths and stored drafts with `pnpm exec vitest run --config vitest.cross-runtime.config.mjs`
- [x] 7.2 Run the narrowest package tests, then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, `pnpm acceptance:starter` and `pnpm exec openspec validate sm05a-conditional-field-semantics --type change --strict`; record results in `openspec/changes/sm05a-conditional-field-semantics/verification.md`
- [x] 7.3 Add an SM5A row to the roadmap progress log with the verification summary; verify the roadmap table and log agree
