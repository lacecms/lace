## 1. Architecture and decision record

- [x] 1.1 Update `docs/mvp-architecture.md`. Verify the text matches the spec deltas and `pnpm format:check` passes on the file.
  - Section 8: the `seo` model option, `seoDefaults` and `removedSeo`, their hash participation, and the sync classification rows for enabling SEO (compatible) and disabling it (destructive, hinted).
  - Section 9.3: `seo_json` and the SEO group.
  - Section 9.7: the `$seo` reference source and SEO usage.
  - Section 12: the public and admin `seo` DTOs, model DTO keys, the export `seo` section and the usage location.
  - Section 16: migration `0008`.
- [x] 1.2 Add `docs/adr/0011-seo-system-group.md` recording the CE4 owner decisions, design decisions D1–D8 and the fallback chain that CE4B implements, with rejected alternatives. Link it from section 24 and set CE4 to `in progress` in `docs/content-editor-roadmap.md`. Verify with `pnpm format:check`.

## 2. Domain rules and configuration

- [x] 2.1 `@lacecms/domain`:
  - add `EntrySeo` and `seo?` on `SnapshotBase`, and carry it through `cloneSnapshot`, `CompleteDraftMutation`/`saveCompleteDraft`, `publishContentEntry` and `revertContentDraft`;
  - add the SEO limits, `normalizeSeoText`, `isCanonicalUrl` and `normalizeEntrySeo` (issue codes of design D3);
  - widen `DraftMediaReference.sourceKey` with `"$seo"`.

  Add tests for normalization (trim, clear, empty group to none), every issue code and pointer, the canonical URL accept/reject table of the domain spec, limits at 200/201 and 500/501 code points, and group preservation across publish and revert. Verify with `pnpm --filter @lacecms/domain test`.
- [x] 2.2 `@lacecms/config`:
  - add `seo` and `removedSeo` to page and collection inputs and `seoDefaults` to global inputs;
  - normalize and validate them per design D6, including "at most one `seoDefaults`" in `assertUniqueModels`;
  - add `seo: true` to `contentModelStructure`, drop `seoDefaults` from it and strip `removedSeo` from hashes and the projection.

  Add tests for:
  - valid mappings, every rejection (undeclared or incompatible field, unknown key, `seo` on a global, `seoDefaults` on a page, two defaults globals, `removedSeo` with `seo`);
  - the structural/projection hash differences of the spec;
  - a pinned structural and projection hash of a model without SEO, equal to the value before this change.

  Verify with `pnpm --filter @lacecms/config test`.

## 3. Schema and shared SQL (`@lacecms/db`)

- [x] 3.1 Add `seoJson` to `contentSnapshots` in `schema.ts` and run `pnpm --filter @lacecms/db db:generate`. Keep the generated `0008_content_snapshot_seo.sql` as a single `ALTER TABLE … ADD` with a header comment, plus its snapshot and journal, and add it to `checkedInMigrations`. Verify the migration inventory test passes with `pnpm --filter @lacecms/db test`.
- [x] 3.2 Shared SQL and mappers:
  - add the column to `SNAPSHOT_COLUMNS_SQL`, `SnapshotRow`, `StoredSnapshot` and `snapshotValue` (parse and serialize canonical JSON);
  - add `seo_json = p.seo_json` to `revertDraftSnapshotSql`;
  - add `has_seo` to `SYNC_SNAPSHOTS_SQL`/`SyncSnapshotRow` and the scan mapper;
  - add the `remove-seo` case to `configurationSyncWriteStatements`;
  - map `$seo` in `mediaUsageEntries` to an SEO location.

  Add unit tests for the SQL rendering of `remove-seo` and for usage mapping of `$seo` rows. Verify with `pnpm --filter @lacecms/db test` and typecheck.

## 4. Application layer

- [x] 4.1 Use cases:
  - add `seo` to `CompleteDraftInput` and `NormalizedDraft`;
  - call `normalizeEntrySeo` in `validateDraft` with the model's SEO flag, after aggregate validation;
  - add the `$seo`/`image` reference before the reference cap and the active-media check;
  - make `publish` re-validate the stored `seo`, and `duplicate` pass the source draft's `seo`;
  - add the SEO variant to `MediaUsageLocation`.

  Verify with `pnpm --filter @lacecms/application typecheck`. Adapter errors are expected until groups 5–6.
- [x] 4.2 Sync classification:
  - add `seo` to `MODEL_IDENTITY_PROPERTIES`, the `seo-enabled` (compatible) and `seo-disabled` (destructive, `hinted` by `removedSeo`) changes, and `removedSeo` in `StructureHints`;
  - track SEO holders in the evidence accumulator;
  - in `decideEvolution`, accept, emit `{action: "remove-seo"}` or refuse with `SEO_REMOVAL_HAS_DATA`;
  - add the new diagnostic code and the text/JSON report entries.

  Verify with typecheck.
- [x] 4.3 In-memory fake (`@lacecms/test-utils`): persist `seo` through create, save, publish, revert and duplicate, apply `remove-seo` (clear groups and `$seo` references), and map `$seo` usage. Add application tests for:
  - save and publish with SEO;
  - omitting `seo` clears it, and `seo: null` is accepted on a model without SEO;
  - `seo_not_allowed` with no port call;
  - an unavailable SEO image;
  - a 201st reference counted through the SEO image;
  - the publish fingerprint changes when only `seo` changes;
  - duplicate and revert copies;
  - viewer refusal;
  - sync: enabling SEO on a populated model, the `SEO_REMOVAL_HAS_DATA` refusal with holder counts, hinted prune, disabling without data, an inert `removedSeo`, and a mapping-only change without a version bump that advances public state.

  Verify with `pnpm --filter @lacecms/application test` and `pnpm --filter @lacecms/test-utils test`.

## 5. Runtime adapters

- [x] 5.1 Node repository: add `seo_json` to `insertSnapshot`, the `saveCompleteDraft` update, the `publish` snapshot copy and revert (via the shared SQL). Sync singleton inserts write `NULL`, and sync applies `remove-seo` inside the guarded mutation. Verify with the Node contract run from group 6.
- [x] 5.2 D1 repository: the same changes in `addSnapshotInsert`, `saveCompleteDraft`, the `publish` batch, revert and the sync batch. Verify with the D1 contract run from group 6.

## 6. Repository contract and migration tests

- [x] 6.1 Extend `packages/test-utils/src/repository-contract.ts` with an SEO-enabled collection fixture and the cases of the content-repository-contracts delta:
  - lifecycle copies;
  - `$seo` reference rows after save, publish, revert and duplicate;
  - `MEDIA_IN_USE` and usage location;
  - public media and media dictionary for a published-only SEO image, and absence for a draft-only one;
  - hinted prune with failure injection and a retry;
  - block migration and field rename/removal leaving SEO untouched.

  Verify with `pnpm --filter @lacecms/platform-node test` and `pnpm --filter @lacecms/platform-cloudflare test`.
- [x] 6.2 Migration tests: Node (`migrate.test.mjs`) and D1 (`d1-migration.test.mjs`) migrate a populated `0007` database to `0008`. Assert unchanged rows, `seo_json` `NULL` on existing snapshots, intact foreign keys, and a round-tripped SEO group after the migration. Verify both runtime test commands pass.
- [x] 6.3 Media metadata: add a contract or application case showing that a metadata edit of media used only by a published SEO image advances the published version and requests a `media_metadata` build, while a draft-only SEO image does not. Verify with the runtime contract runs.

## 7. Contracts, server and OpenAPI

- [x] 7.1 `@lacecms/contracts`:
  - add `seoValueSchema`, `seoInputSchema` (domain predicates) and the re-exported limits;
  - add optional `seo` on snapshot DTOs, requests and public entries, plus `toSeoDto`;
  - add model DTO `seo`/`seoDefaults` with kind checks;
  - add `exportSeoSchema` with its default on `buildExportSchema`;
  - add the `seo` usage variant;
  - add the `seo`/`seoModels` options on the snapshot, entry and public mappers, and the `seo` argument of `toBuildExportDto`.

  Add contract tests for:
  - valid and invalid SEO requests (relative canonical, over-long title, wrong type, unknown key);
  - public and admin DTOs with and without `seo`, and a global with `seo` rejected;
  - model DTOs with `seo` on a global or `seoDefaults` on a page rejected;
  - an export with and without the `seo` section;
  - the usage variant.

  Verify with `pnpm --filter @lacecms/contracts test`.
- [x] 7.2 `@lacecms/server`:
  - pass `seo` from create and save requests to the use cases;
  - build the SEO-model set and the export `seo` section once from configuration;
  - pass the SEO flag to admin entry mappers and `seoModels` to public mappers;
  - copy `seo`/`seoDefaults` into model DTOs.

  Add `app.test.mjs` cases with an SEO-enabled test configuration:
  - save and read SEO through the admin;
  - `422` issues under `/seo` (including `seo_not_allowed`);
  - public page, collection item, by-path, list and export entries with `seo`, and entries of non-SEO models without it;
  - the export `seo` section;
  - an SEO image in the public media dictionary and served by the public media route;
  - the media detail usage location.

  Verify with `pnpm --filter @lacecms/server test`.
- [x] 7.3 Regenerate `apps/api/openapi/api-v1.json` with `pnpm openapi:generate`, stage it, and verify `pnpm openapi:check` passes.

## 8. SDK and admin

- [x] 8.1 `@lacecms/sdk`: add `seo?` to `PublishedEntry` and copy it in `buildSite`. Add tests for an entry with `seo`, one without it, and an export with the `seo` section that parses. Verify with `pnpm --filter @lacecms/sdk test`.
- [x] 8.2 Admin:
  - `admin-client` `saveDraft` accepts `seo?`;
  - `EntryPage` sends the loaded draft's `seo` unchanged and omits it when absent;
  - `usageLocationLabel` returns `SEO image · <states>`.

  Add unit tests for the save request with and without `seo` and for the label. Verify with `pnpm --filter @lacecms/app-admin test` and the admin typecheck.

## 9. Documentation and acceptance

- [x] 9.1 Update:
  - `docs/database-migrations.md`: migration `0008`, additive, no backfill, with backup and rollback notes;
  - `docs/compatibility.md`: entry and admin `seo` keys, export `seo` section, usage variant, new issue and diagnostic codes, migration `0008`;
  - `docs/node-api.md` if it documents snapshot or export shapes.

  Verify links resolve and `pnpm format:check` passes.
- [x] 9.2 Run the D1 HTTP budget acceptance (`pnpm exec vitest run --config vitest.d1-budgets.config.mjs`) and verify the export query formula is unchanged and passes.

## 10. Verification

- [x] 10.1 Run the narrowest affected package tests, then:
  - root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`;
  - `pnpm openapi:check` and `pnpm acceptance:starter`;
  - `pnpm exec openspec validate ce04a-seo-data-contract --type change --strict`.

  Verify that all pass, or record any environment-limited step with its reason.

## Verification notes

- 2026-10-12: root `pnpm test` (40/40 tasks), `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` (with the regenerated `api-v1.json` staged), `pnpm acceptance:starter`, the D1 HTTP budget acceptance and `openspec validate ce04a-seo-data-contract --type change --strict` passed. Root `pnpm typecheck` passed (35/35) once the platform builds were cached; on a cold cache it can fail with `Stale platform release version`, because turbo runs `@lacecms/platform-node#build` (which rewrites `src/release-version.ts`) concurrently with that package's own `typecheck --check`. `pnpm turbo run typecheck --concurrency=1` passes cold. The race predates this change.
- Raising the migration count to nine required updating `packages/platform-node/src/index.test.mjs` (hard-coded count and a positional `content_snapshots` insert) and the `0007` Node migration test, which migrates to the latest version and now sees the empty `seo_json` column.
