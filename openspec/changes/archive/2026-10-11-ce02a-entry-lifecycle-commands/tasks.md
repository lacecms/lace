## 1. Domain and ports

- [x] 1.1 Add `CONTENT_NOT_PUBLISHED` and `CONTENT_PAGE_SINGLETON` to `DomainErrorCode` (`packages/domain`), with domain unit tests that construct each failure and check its code; verify `pnpm --filter @lacecms/domain test`.
- [x] 1.2 Add the port types to `packages/application/src/index.ts`: `UnpublishContentEntryCommand`, `UnpublishContentEntryResult`, `RevertContentDraftCommand`, `duplicateOf` on `CreateContentEntryInput`, the statuses `reverted` and `unpublished`, and `unpublish`/`revertDraft` on `ContentEntryCommandPort`. Add the unpublication idempotency fingerprint helper. Verify with `pnpm --filter @lacecms/application typecheck`.

## 2. Use cases (`@lacecms/application`)

- [x] 2.1 Implement `ContentUseCases.unpublish` (permission first, `CONTENT_NOT_PUBLISHED`, stale-ID conflict, idempotency scope and fingerprint, build outcome mapping) and the page refusal in `delete` (D4). Add application tests with `InMemoryContentStore` for editor/viewer denial, not-published, stale ID, replay, a different-input key reuse, and admin page delete refused with an editor-published page also refused as `CONTENT_PAGE_SINGLETON`.
- [x] 2.2 Implement `ContentUseCases.revertDraft` (permission, `CONTENT_NOT_PUBLISHED`, published-ID guard pass-through). Add tests for success (draft equals published, status `published`, version unchanged), a stale revision and a viewer denial.
- [x] 2.3 Implement `ContentUseCases.duplicate` and `duplicateTitle` (D3: page refusal, caller-revision check, new block keys, no slug, draft-mode validation, media references, `duplicateOf` guard). Add tests for the copy shape, the 200-character and surrogate-boundary titles, page refusal, a caller revision mismatch, and a source unchanged after duplication.

## 3. In-memory parity double (`@lacecms/test-utils`)

- [x] 3.1 Implement `unpublish`, `revertDraft` and the `duplicateOf` guard in `InMemoryContentStore`. Use the same guards, codes, idempotency scope, version and build behavior, and keep failures atomic. Verify with the application tests from group 2 and `pnpm --filter @lacecms/test-utils test`.

## 4. SQL adapters

- [x] 4.1 Node: implement `unpublish` (checkpoints `unpublish.route`, `public-state`, `build-outbox`, `unpublish.snapshot`; replay; classification), `revertDraft` (set-based copy, both revisions) and the `duplicateOf` guard in `create`, each in one transaction. Verify with the Node contract run from group 5.
- [x] 4.2 D1: implement `unpublish` (guard with the idempotency condition, conditional statements, post-batch replay/not-published/conflict classification), `revertDraft` (guard token, conditional delete, copy and update statements) and the guarded `create` for `duplicateOf` (guarded entry insert and existing token-aware helpers). Verify with the D1 contract run from group 5 and the batch statement budget.

## 5. Cross-runtime contract cases (`@lacecms/test-utils` repository contract)

- [x] 5.1 Contract case "unpublishes a publication and keeps the draft": a page and a collection entry with changed drafts. Check that the route and by-path lookup are gone, the build export omits them, the snapshot rows, blocks and media references of the publication are deleted, the draft is unchanged, the version increments once and one pending build carries the target version. A second unpublication fails with `CONTENT_NOT_PUBLISHED`, a stale ID with `CONTENT_REVISION_CONFLICT`, and republication works afterwards. Verify on Node and D1.
- [x] 5.2 Contract case "replays an idempotent unpublication from a second repository" (including different-input key reuse) and "rolls back unpublication at every injected checkpoint" with exported `UNPUBLICATION_CHECKPOINTS`; verify on Node and D1.
- [x] 5.3 Contract case "reverts a changed draft to its publication": title, slug, fields, block keys and data, and media references copied; the draft revision is + 1 and the published revision equals it; status `published`; version and outbox unchanged. A stale revision, a publication replaced after read and an unpublished entry each fail with nothing changed. Verify on Node and D1.
- [x] 5.4 Contract case "creates a duplicate only while the source revision matches": a guarded create succeeds; a stale source revision fails with `CONTENT_REVISION_CONFLICT` and a missing source with `CONTENT_INVALID_STATE`, with entry, snapshot, block and reference counts unchanged. Verify on Node and D1.

## 6. Transport (`@lacecms/contracts`, `@lacecms/server`)

- [x] 6.1 Add the error codes to `errorCodeSchema`, `domainErrorStatus` (`409`) and `domainErrorMessage`, plus the unpublish/revert/duplicate request schemas, `unpublicationOutcomeSchema`, `unpublishContentEntryResultSchema` and `toUnpublishContentEntryResultDto`. Add contracts tests for strict bodies, the result shape and error classification.
- [x] 6.2 Add the three routes with `describeRoute` OpenAPI metadata, `revision()` for revert, a new `optionalRevision()` for duplicate (agreement and strong-tag rules) and `optionalIdempotencyKey()` for unpublish. Add `app.test.mjs` cases for success shapes and statuses (`200`/`200`/`201`), viewer `403`, editor unpublish `403`, page delete/duplicate `409 CONTENT_PAGE_SINGLETON`, unpublish of an unpublished entry `409 CONTENT_NOT_PUBLISHED`, missing `expectedPublishedSnapshotId` `422`, If-Match disagreement and weak tag `422`, an unpublish replay with `not-dispatched`, and public by-path `404` after unpublish.
- [x] 6.3 Regenerate `apps/api/openapi/api-v1.json` with `pnpm openapi:generate` and verify with `pnpm openapi:check`.

## 7. Documentation

- [x] 7.1 Update `docs/mvp-architecture.md`: section 10 (commands, permissions, atomic steps, page rule, removed sentences), 9.3 (unpublish and revert effects on the published snapshot), 9.8 (revision-only alignment is not public output) and 12 (routes). Add `docs/adr/0008-entry-lifecycle-commands.md`. Set CE2 to `in progress` in `docs/content-editor-roadmap.md`. Verify with `pnpm format:check` (Oxfmt) on the changed docs.

## 8. Verification

- [x] 8.1 Run the focused suites (domain, application, contracts, test-utils, server, platform-node and platform-cloudflare contract runs), then root `pnpm typecheck`, `pnpm lint` (Oxlint), `pnpm format:check` (Oxfmt) and `pnpm exec openspec validate ce02a-entry-lifecycle-commands --type change --strict`; all pass.
