## 1. Architecture and decision record

- [x] 1.1 Update `docs/mvp-architecture.md` and verify the text matches the spec deltas and `pnpm format:check` passes on the file:
  - section 9.4: the envelope columns and the partial anchor index;
  - section 9.5: anchor uniqueness per snapshot (entry);
  - section 10: hidden blocks validated in draft mode at publication, and omitted from public delivery and the media dictionary;
  - section 11: `defineBlock({ settings })` and the `({ data, settings })` migration signature, with the quote example updated;
  - section 12: admin and public block DTO shapes and block metadata `settings`;
  - section 16: migration `0009`.
- [x] 1.2 Add `docs/adr/0012-block-envelope.md` recording the CE6 owner decisions, the CE6A class-name decision (D3), the hidden-block delivery rule (D8) and the migration signature (D5), with rejected alternatives. Link it from section 24, set CE6 to `in progress` in `docs/content-editor-roadmap.md`, and replace open decision 5 with the decision. Verify with `pnpm format:check`.

## 2. Content rules and definitions (`@lacecms/content`)

- [x] 2.1 `defineBlock({ settings })`:
  - add the `Settings` generic, `normalizeBlockSettings` (`select`/`boolean`/`number`/`text`, required `defaultValue`), `BlockMetadata.settings` (only when non-empty), `toBlockMetadata` and `BlockSettingsValues`;
  - add `validateBlockSettings`.

  Add unit and type tests for valid settings, each rejected type, a missing default, `renamedFrom`, an empty map yielding no metadata key, and the inferred settings type. Verify with `pnpm --filter @lacecms/content test` and typecheck.
- [x] 2.2 Migration signature (design D5):
  - `BlockMigration`, `BlockMigrationInput`/`Output`, `migrateBlockData(definition, {data, settings}, fromVersion)`;
  - `migrationResult` checks the envelope shape, and absent settings carry over;
  - the built-in `image` migration becomes `2: (block) => block`.

  Update the existing migration tests and type tests, and add cases for a settings rename, omitted settings and each invalid result shape. Verify with the content tests.
- [x] 2.3 Envelope rules and aggregate validation (design D2):
  - export `isBlockAnchor`, `normalizeBlockClassName` and the limits;
  - extend `validateEntryAggregate`: optional envelope keys, the issue codes of the block-registry delta, anchor uniqueness including hidden blocks, settings validation, and draft-mode data for hidden blocks;
  - extend `EntryAggregateBlock` and `ValidatedEntryAggregate` with the envelope.

  Add tests for the anchor accept/reject table, duplicate anchors, class-name normalization and rejection, `hidden` type, settings defaults, unknown settings and invalid choices, and a hidden incomplete block passing publish mode while the visible one fails. Verify with the content tests.

## 3. Domain and configuration

- [x] 3.1 `@lacecms/domain`: add the envelope to `ContentBlock`. `cloneBlock` completes defaults and copies `anchor`/`className` (design D1), and publish, revert and duplicate clones carry it. Update TS block literals in domain tests and fixtures. Add tests for envelope preservation across publish and revert and for completion of a legacy block. Verify with `pnpm --filter @lacecms/domain test` and typecheck.
- [x] 3.2 `@lacecms/config`: add tests that pin the structural and projection hash of a model allowing only built-in blocks to its pre-change value, and that show a settings choice or default change altering the structural hash. Verify with `pnpm --filter @lacecms/config test`. No source change is expected beyond types.

## 4. Schema and shared SQL (`@lacecms/db`)

- [x] 4.1 Add the envelope columns, the `hidden` check and the partial unique anchor index to `contentBlocks` in `schema.ts`. Run `pnpm --filter @lacecms/db db:generate`, then make `0009_content_block_envelope.sql` the additive statements of design D6 with a header comment, plus its snapshot and journal. Add it to `checkedInMigrations`, and verify the inventory test with `pnpm --filter @lacecms/db test`.
- [x] 4.2 Shared SQL and mappers:
  - add the envelope columns to `BLOCK_COLUMNS_SQL`, `BlockRow`, `storedSnapshots` and `copySnapshotBlocksSql`;
  - add `hidden`/`settings_json` to `SYNC_MIGRATION_BLOCKS_SQL`, `SyncMigrationBlockRow` and `syncMigrationPage`;
  - write `settings_json` in the migration rewrite (`MIGRATED_BLOCK_VALUES` 5);
  - drop hidden blocks in `publicEntry`;
  - add the hidden-source exclusion to `publicSnapshotMediaSql` and `PUBLIC_MEDIA_SQL`.

  Add unit tests for the rewrite SQL rendering, for `storedSnapshots` envelope parsing and for `publicEntry` filtering. Verify with `pnpm --filter @lacecms/db test` and typecheck.

## 5. Application layer

- [x] 5.1 Use cases:
  - add `ContentBlockInput` to `CompleteDraftInput`;
  - `validateDraft` passes envelopes to `validateEntryAggregate` and maps normalized envelopes back with positions, which also covers the fingerprint;
  - media references are still collected from hidden blocks;
  - `duplicate` keeps envelopes under new keys.

  Verify with `pnpm --filter @lacecms/application typecheck`. Adapter errors are expected until group 6.
- [x] 5.2 Sync migration (`configuration-migration.ts`):
  - pass `{data, settings}` to `migrateBlockData`;
  - validate data in draft mode for hidden or draft blocks and settings with defaults;
  - report `settings.*` paths;
  - emit `settings` on `ConfigurationSyncMigratedBlock`.

  Update `configuration-migration.test.mjs` to the new signature and add cases for a hidden published block with a missing required field (valid), invalid migrated settings (refused with a `settings.` path), and a new setting receiving its default. Verify with `pnpm --filter @lacecms/application test`.
- [x] 5.3 In-memory fake (`@lacecms/test-utils`): persist envelopes through every lifecycle path, apply migrated settings, filter hidden blocks in `publicView`, and ignore hidden-source references in the public media dictionary and `loadPublicMedia`. Add application tests for:
  - save and publish with envelopes;
  - omitted envelope values defaulting;
  - a duplicate anchor refused with no port call;
  - publishing an unfinished hidden block, while the visible one fails;
  - the fingerprint changing when only `hidden` changes;
  - hidden-block media counting toward the reference limit and requiring active media;
  - duplicate and revert copies.

  Verify with `pnpm --filter @lacecms/application test` and `pnpm --filter @lacecms/test-utils test`.

## 6. Runtime adapters

- [x] 6.1 Node repository: add the envelope to `insertBlocks` (plain binds) and the publish block copy. The revert and duplicate copies and the migration rewrite come through the shared SQL. Verify with the Node contract run in group 7.
- [x] 6.2 D1 repository: in `addBlockInserts`, bind one envelope JSON per row and extract the columns (design D7); add the envelope to the publish block copy. Verify with the D1 contract run in group 7.

## 7. Repository contract and migration tests

- [x] 7.1 Extend `packages/test-utils/src/repository-contract.ts` with a block type that declares settings, and with the cases of the content-repository-contracts delta:
  - lifecycle copies of every envelope value;
  - a sync block migration that renames a setting and keeps the anchor, class name and hidden flag;
  - hidden-block media: deletion guard and usage;
  - hidden blocks absent from public page, collection, slug, path and global reads and the export;
  - hidden-only media absent from dictionaries and the public media read, while shared media stays;
  - a draft and its published copy sharing anchors.

  Update the existing migration fixture to the new signature. Verify with `pnpm --filter @lacecms/platform-node test` and `pnpm --filter @lacecms/platform-cloudflare test`.
- [x] 7.2 Migration tests: Node (`migrate.test.mjs`) and D1 (`d1-migration.test.mjs`) migrate a populated `0008` database to `0009`. Assert unchanged rows, the default envelope values, intact foreign keys, rejection of a duplicate anchor in one snapshot by the index, acceptance of the same anchor in another snapshot, and rejection of `hidden = 2`. Fix the hard-coded migration counts in `platform-node` `index.test.mjs` and the prior migration test. Verify both runtime test commands pass.

## 8. Contracts, server and OpenAPI

- [x] 8.1 `@lacecms/contracts`:
  - add the envelope entries (design D9) to `contentBlockSchema` and a strict `publicBlockSchema` without `hidden`, used by public entries, globals and the export;
  - add `toPublicBlockDto`, which skips hidden blocks, and update `toContentBlockDto`;
  - export `PublicBlockDto`;
  - make `isBlockMetadata` accept `settings`;
  - re-export the content anchor and class predicates if the admin needs them.

  Add contract tests for:
  - requests with and without envelope values, and a malformed anchor, class name, hidden value or unknown block key;
  - admin DTO output;
  - a public block without `settings` parsing to `{}`, and one with `hidden` rejected;
  - public mappers skipping hidden blocks;
  - block metadata with valid and invalid settings.

  Verify with `pnpm --filter @lacecms/contracts test`.
- [x] 8.2 `@lacecms/server`: type the request blocks as `ContentBlockInput` and pass envelopes to the use cases. Add `app.test.mjs` cases with a settings-declaring block:
  - save and read the envelope through the admin;
  - `422` issues at `/blocks/<i>/anchor` and `/blocks/<i>/settings/<key>`;
  - public page, list, global and export reads without hidden blocks and with envelope keys;
  - hidden-only media absent from the dictionary and `404` from the public media route.

  Verify with `pnpm --filter @lacecms/server test`.
- [x] 8.3 Regenerate `apps/api/openapi/api-v1.json` with `pnpm openapi:generate`, stage it, and verify `pnpm openapi:check` passes.

## 9. SDK and admin

- [x] 9.1 `@lacecms/sdk`: set `PublishedBlock` to `PublicBlockDto` and update TS fixtures. Add a test that an export block with envelope keys parses and is exposed, and that a legacy block without `settings` yields `{}`. Verify with `pnpm --filter @lacecms/sdk test` and the render/astro typechecks.
- [x] 9.2 Admin:
  - `BlockEditor` `insertDefinition` adds `hidden: false` and the declared setting defaults;
  - `duplicate` drops `anchor`;
  - the save round-trips envelopes.

  Add unit tests for the new-block defaults, duplicate without anchor, a save request carrying loaded envelope values, and `issueLocation` mapping envelope paths to block level. Verify with `pnpm --filter @lacecms/app-admin test` and the admin typecheck.

## 10. Documentation and acceptance

- [x] 10.1 Update the following, and verify links resolve, `pnpm format:check` passes and `node scripts/generated-project-acceptance.mjs snapshots --update` is rerun after the template doc edit (then passes without `--update`):
  - `docs/database-migrations.md`: migration `0009`, additive, no backfill, with backup and rollback notes;
  - `docs/compatibility.md`: block envelope keys, hidden-block omission, the migration signature break, new issue codes and migration `0009`;
  - `docs/configuration-synchronization.md`: the migration example and settings;
  - the managed `packages/create-lace/templates/docs/lace-operations.md` migration example.
- [x] 10.2 Run the D1 HTTP budget acceptance (`pnpm exec vitest run --config vitest.d1-budgets.config.mjs`). Update its block expectations for the envelope keys and verify a 200-block save, publish and export stay within the budgets.

## 11. Verification

- [x] 11.1 Run the narrowest affected package tests, then:
  - root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`;
  - `pnpm openapi:check` and `pnpm acceptance:starter`;
  - `pnpm exec openspec validate ce06a-block-envelope-contract --type change --strict`.

  Verify that all pass, or record any environment-limited step with its reason.

## Verification notes

- 2026-10-12: root `pnpm test` (40/40 tasks), `pnpm turbo run typecheck --concurrency=1` (35/35), `pnpm lint` (no new warnings), `pnpm format:check`, `pnpm openapi:check` (with the regenerated `api-v1.json` staged), `pnpm acceptance:starter`, the generated-project snapshot check, the D1 HTTP budget acceptance (a 200-block create stays at 32 queries) and `openspec validate ce06a-block-envelope-contract --type change --strict` passed. Admin browser e2e was not run; CE6A adds no envelope UI.
- Implementation details beyond the design: the contracts type `settings` as `Readonly<Record<string, unknown>>` (`BlockSettingsDto`), because a Valibot default over the recursive JSON object type exceeds TypeScript's instantiation depth; the server casts it back to a JSON object for the use case. The migration scan reads data and settings through one `with target(...)` CTE so its single bound type list is reused. Raising the migration count fixed hard-coded counts and positional `content_blocks` inserts in `platform-node` `index.test.mjs`, `cli` `commands.test.mjs` and the D1 budget acceptance; the 200-block migration rewrite now needs 20 statements (was at most 19).
