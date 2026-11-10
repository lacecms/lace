## 1. Configuration and shared contracts

- [x] 1.1 Export `CONTENT_ENTRY_SYSTEM_SORTS` and its type from `@lacecms/content` (design D2) and derive `contentEntrySystemSortSchema` in `@lacecms/contracts` and `CONTENT_ENTRY_SORTS` in `@lacecms/application` from it; verify the existing contracts and application sort tests pass unchanged
- [x] 1.2 Accept `listOptions.defaultSort` in `packages/config/src/models/list-options.ts` and `types.ts` (design D1): system sorts or `field:`/`-field:` keys of the normalized `sortableFields`, `-updatedAt` normalized to omission, `defaultSort` alone valid; verify `list-options.test.ts` covers every scenario of "Collections declare a default admin sort" for configuration (invalid key, unsortable key, unknown name, non-string, old default equals omission including hashes, system default without fields) and `define.type-test.ts` rejects a bad system name and an unsortable field type
- [x] 1.3 Add `defaultSort` to `collectionListOptionsSchema` and the model metadata check in `@lacecms/contracts` (design D4), keep it in the model projection, regenerate `apps/api/openapi/api-v1.json`; verify `collection-queries.test.ts` and `model-projection.test.ts` accept a valid default, reject a field default outside `sortableFields`, and `pnpm openapi:check` passes

## 2. List behavior

- [x] 2.1 Resolve the effective sort in `ContentUseCases.list` (design D3); verify `collection-queries.test.ts` in `@lacecms/application` shows an omitted sort using the collection default, an explicit sort overriding it, pages and default-less collections keeping `-updatedAt`, and an omitted-sort cursor rejected at `/after` after the default changes
- [x] 2.2 Add a server route test (`packages/server/src/routes/content.test.ts`) and a configuration-sync test in `@lacecms/application` for adding `defaultSort` with a trusted baseline (no version bump, snapshot rewrite, published-state advance or build); verify both pass, then run `pnpm --filter @lacecms/application test` and `pnpm --filter @lacecms/server test`
- [x] 2.3 Add a repository-contract case for a `field:order` default listed without sort (two pages, missing values last) and verify it passes on Node and local D1 through `pnpm turbo run test --filter=@lacecms/platform-node --filter=@lacecms/platform-cloudflare`

## 3. Admin

- [x] 3.1 Keep every valid sort in `parseCollectionSearch`, drop the model default in `resolveCollectionListSearch`, add `defaultCollectionSort(model)` and use it in `CollectionEntries` for the Sort selector, header state and the always-explicit API sort (design D5); verify `collection-search`, `collection-query.test.ts` and `CollectionEntries.test.tsx` cover the four admin scenarios
- [x] 3.2 Give a model of the `e2e/support/collection-query-backend.mjs` mock a `field:order` default and extend `e2e/collection-queries.e2e.ts` with opening in the default, selecting and reloading `-updatedAt`, and selecting the default again; verify the admin unit suite and that e2e file pass

## 4. Documentation

- [x] 4.1 Document `defaultSort` in `apps/docs` content-modeling "Collection list queries", internal `docs/collection-queries.md`, the generated-project `templates/docs/lace-operations.md` example and architecture §8 "Collection list metadata"; regenerate snapshots with `node scripts/generated-project-acceptance.mjs snapshots --update`; verify `pnpm docs:check`, `pnpm vitest run tests/docs-links.test.mjs tests/architecture-document.test.mjs` and the snapshot phase pass
- [x] 4.2 Remove the default collection sort item from `backlog.md` and record the progress-log row in `docs/refactoring-roadmap.md`

## 5. Verification

- [x] 5.1 Run root typecheck, Oxlint, Oxfmt check, `pnpm test`, the cross-runtime verification project (`pnpm exec vitest run --config vitest.verification.config.mjs --project cross-runtime`), `pnpm spec:validate` and `pnpm exec openspec validate collection-default-sort --type change --strict`; verify all pass
