## 1. Coverage of the reported block-removal path

- [x] 1.1 Add a repository contract case in `packages/test-utils/src/repository-contract.ts`: an entry whose draft and published snapshot use an image in an `image` block; save the draft without the block → usage lists the block location with states `["published"]` and `markForDeletion` fails `MEDIA_IN_USE`; publish → `usageCount` 0 and `markForDeletion` succeeds. Verify with `pnpm turbo run test --filter=@lacecms/test-utils --filter=@lacecms/platform-node --filter=@lacecms/platform-cloudflare` (memory, Node SQLite and D1 all pass).
- [x] 1.2 Add a server HTTP case in `packages/server/src/app.test.mjs` with real `ContentUseCases`, an `image` block and a gallery block: create, publish, save the draft without the image block, assert detail usage is published-only and `DELETE` returns `409 MEDIA_IN_USE`, publish, assert `DELETE` returns `202`. Verify with `pnpm turbo run test --filter=@lacecms/server`.

## 2. Pure detach helper

- [x] 2.1 Add `detachFieldMedia(definitions, values, mediaId)` next to `collectFieldMedia` in `packages/content/src/index.ts` (clear matching `media` leaves, drop matching elements of media lists, recurse groups and lists, return the same object when nothing matches) and export it. Verify with new cases in the content package tests for root, nested group, list of media, list of groups and untouched values.

## 3. Application

- [x] 3.1 Add `ContentUseCases.detachMedia({ actor, entryId, mediaId })`: `content:write`, load entry, detach from fields, every block's data and `seo.image`, skip unchanged drafts, `validateDraft(..., "draft")`, `saveCompleteDraft` at the loaded revision. Verify with application tests for a field, a hidden block, an SEO image, an unchanged draft and a revision conflict.
- [x] 3.2 Add the optional `drafts` port to `MediaUseCaseDependencies` and `detach?: "drafts"` to `DeleteMediaUseCaseInput`; implement the ordered checks (both permissions, active item, published usage, truncated usage) before any draft change, then detach each entry and call `markForDeletion`. Verify with application tests for success, published refusal with unchanged revisions, 51-entry refusal, missing `content:write`, inactive item, missing port, and a guard race that leaves the item `active`.
- [x] 3.3 Wire `drafts: content` into `MediaUseCases` in `packages/platform-node/src/runtime.ts` and `packages/platform-cloudflare/src/worker.ts`. Verify with `pnpm typecheck` and the existing runtime tests.

## 4. Transport

- [x] 4.1 Add a `mediaDeleteQuerySchema` (`detach?: "drafts"`) to `packages/contracts/src/index.ts` with contract tests for `drafts`, absent, `all` and repeated values. Verify with `pnpm turbo run test --filter=@lacecms/contracts`.
- [x] 4.2 Validate the query on `DELETE /api/v1/admin/media/:mediaId` in `packages/server/src/app.ts` and pass `detach` to `requestDeletion`; extend the HTTP case with `detach=drafts` → `202 deleting usageCount 0` with the drafts cleared, and `detach=all` → `422 /detach`. Regenerate and stage `api-v1.json`. Verify with the server tests and `pnpm openapi:check`.

## 5. Admin

- [x] 5.1 Extend `client.deleteMedia(id, { detachDrafts })` in `apps/admin/src/shared/api/admin-client.ts` to send `?detach=drafts`. Verify with an `admin-client.test.ts` case.
- [x] 5.2 Classify loaded usage in `MediaDetailsPanel` (loading/failed, published, truncated, drafts-only) and render the guidance from the spec, including the "publish or unpublish releases the item" line with entry links. Verify with `MediaDetailsPanel.test.tsx` cases for each state.
- [x] 5.3 Add the detach mode to `DeleteMediaDialog` (entry names, warnings, detaching request, entry query invalidation, partial-change refusal message in `mediaDeletionDescription`). Verify with `DeleteMediaDialog.test.tsx` and `useMediaDeletion.test.ts` cases for confirm, cancel focus return and refusal.
- [x] 5.4 Add an admin e2e case for confirming deletion of draft-only media with mocked API responses. Verify with the admin Playwright suite for the media library.

## 6. Documentation and verification

- [x] 6.1 Update `docs/mvp-architecture.md` § Media deletion to describe the detach option, its refusals and per-entry recovery. Verify the text matches the delta specs.
- [x] 6.2 Run root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm exec openspec validate media-detach-delete --type change --strict`; all pass.
