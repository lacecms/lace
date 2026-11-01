## 1. Architecture and planning documents

- [x] 1.1 Update `docs/mvp-architecture.md` per design D9 (§8 conditional fields: projection adopted by publication, references and render; §9.3: published snapshots and references hold the projection; §10 step 2: opted content inserts supplied projected values and references and guards projected links); verify with `git diff` that no other invariant changes
- [x] 1.2 Set ADR 0018 status to "accepted; SM5A and SM5B implemented" and remove the branch-gap sentence; mark SM5B `in progress` in `docs/site-migration-roadmap.md` with a proposed progress row; verify the overview table and log agree

## 2. Content helpers and internal links

- [x] 2.1 Add `declaresFieldVisibility(fields, visibility?)` to `packages/content/src/index.ts` (true when the owner or any nested group or list-item group declares rules); verify unit tests for model-level, nested group, list-item group, block data and unopted field maps
- [x] 2.2 Make `collectSnapshotInternalLinks` visibility-aware per design D4 (model rules and each block's data rules; links inside hidden targets get `delivered: false`, hidden blocks unchanged); verify unit tests for hidden model field, hidden list-item link, hidden block-data link, visible link and unopted output equal to before

## 3. Published value types

- [x] 3.1 Add the `Visibility` parameter to `BlockDataValues`, group `FieldValue`, `BlockMetadata`, `BlockDefinition` and `defineBlock` inference per design D7; verify new type tests in `packages/content/src/index.type-test.ts` (required targets optional, controllers unchanged, nested list-item groups) and unchanged inference for blocks without rules with `pnpm --filter @lacecms/content typecheck`
- [x] 3.2 Add the `Visibility` parameter to config `ModelFieldValues` and infer and expose `visibility` on `definePage`, `defineCollection` and `defineGlobal` results; verify type tests in `packages/config/src/index.type-test.ts` and `pnpm --filter @lacecms/config typecheck`

## 4. Publication use case

- [x] 4.1 Add `PublishedProjection` and optional `PublishContentEntryCommand.projection` to `packages/application/src/index.ts`, and update the in-memory fake repository to write a supplied projection; verify application typecheck and fake-repository unit tests
- [x] 4.2 In `ContentUseCases.publish`, refuse a loaded draft revision that differs from `expectedRevision`, compute projected fields, every block's data, media references (fields, blocks, SEO image) and internal links per design D1, run the publish-mode link check over projected links only, and attach `projection` exactly when `declaresFieldVisibility` holds for the model or a draft block type (memoized); verify application tests for the gallery, model-level, hidden-block and unopted scenarios of `conditional-fields`, hidden and visible link-to-unpublished-target outcomes, and a draft unchanged after publication
- [x] 4.3 Verify server enforcement on every write path with application tests: hidden required target not demanded and visible required target reported with exact list-index and block-key paths for create, save, duplicate and publish; and with an import route test that `--validate-only` reports a hidden over-long value and accepts a valid hidden value

## 5. Repositories

- [x] 5.1 Add shared SQL to `packages/db` per design D3 (projected snapshot insert, block copy with bound `data_json`, media-reference insert from bound rows, `INVALID_PROJECTED_LINK_TARGETS_SQL` over `json_each`) and a block-key set check; verify `@lacecms/db` unit tests for the SQL helpers and bound-row encoders
- [x] 5.2 Implement the projected path in the Node repository `publish` with the existing checkpoints and transaction, keeping the copy path when `projection` is absent; verify Node repository tests
- [x] 5.3 Implement the projected path in the D1 repository `publish` inside the single guarded batch (link guard in the snapshot insert, post-failure issue report, `publishedEntry` built from the projection); verify D1 repository tests and that bind and statement counts stay within the existing budgets
- [x] 5.4 Add the `content-repository-contracts` cases (projected publication, atomic guard on projected links, hidden link does not block, checkpoint failure rollback, replay, copy path unchanged, hidden media usage draft-only with no build on metadata edit) to `packages/test-utils/src/repository-contract.ts`; verify on the in-memory fake, in-memory and file-backed SQLite and local D1

## 6. Delivery and render

- [x] 6.1 Add delivery tests that public entry and global reads, the build export pages, media dictionary and link manifest, and MCP/admin `get_entry` published snapshots omit hidden values while draft reads and admin draft list queries keep them; verify on Node and Cloudflare server tests
- [x] 6.2 Return `publishedBlockData` of the validated value from render `parseBlockData` per design D6 and infer optional targets in `BlockDataOf`; verify render tests for the stale-value, visible-required-missing, nested list-item and hidden-target-default scenarios, and render type tests

## 7. Agent and API guidance

- [x] 7.1 Update MCP tool descriptions per design D8 and add an MCP test that discovery returns REST-equal rules and that save-then-publish keeps the draft value and omits it from the published snapshot; verify `pnpm --filter @lacecms/mcp test`
- [x] 7.2 Extend the `FieldVisibility` OpenAPI description with published omission and regenerate the document; verify `pnpm openapi:check` and a contracts test that public DTO schemas accept published values without hidden required targets
- [x] 7.3 Add a conditional-fields paragraph to `docs/mcp.md` and `docs/content-import.md` (fill targets only when selected; hidden values kept in drafts, never published); verify links and wording with `git diff`

## 8. Cross-runtime verification and completion

- [x] 8.1 Extend the cross-runtime suite with an entry using model, list-item group and block-data rules that is saved, published and read publicly and through the build export on Node and the local Worker; verify identical published values and references with `pnpm exec vitest run --config vitest.cross-runtime.config.mjs`
- [x] 8.2 Run the narrowest package tests, then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, `pnpm acceptance:starter` and `pnpm exec openspec validate sm05b-conditional-field-delivery --type change --strict`; record results in `openspec/changes/sm05b-conditional-field-delivery/verification.md`
- [x] 8.3 Mark SM5B done in the roadmap section and add an implemented row to the progress log with the verification summary; verify the roadmap table and log agree
