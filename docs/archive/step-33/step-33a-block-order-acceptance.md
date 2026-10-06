# Step 33A — Block order on draft save

The editor derives positions `1000, 2000, ...` from the displayed block array when explicitly saving or copying recovery JSON. Structural edits keep stable keys and block data. A successful response establishes the new clean baseline; failures preserve local edits. The server continues rejecting invalid order rather than sorting input.

Ordering failures use `CONTENT_INVALID_STATE` with a zero-based block index, a key only when it is a valid bounded ULID, and the required ordering rule and next action. Other domain errors keep generic transport messages. The editor exposes the reason, request ID, retry advice and **Copy my JSON** before a user chooses to reload.

## Verification

- Admin helper and entry-page tests cover sparse serialization, non-mutation, recovery JSON, preserved edits and successful retry.
- Domain and contracts tests cover non-positive, fractional, unsafe, duplicate and descending positions, safe key disclosure, content redaction and the narrow transport mapping.
- HTTP negative tests prove rejected requests do not advance the draft revision or change published export/version.
- SQLite and D1 repository contracts pass with the unchanged persistence model.
- `apps/admin/e2e/block-order.e2e.ts` runs the production Node HTTP/use-case/SQLite composition with a test identity and unused object-storage adapter. Pointer and keyboard reordering, middle insertion/duplication, removal and Undo each proceed through Save, reload, publication, authenticated build export and an actual reference Astro build. Each HTML result must retain displayed block keys and values. A deliberately corrupted request exercises real server rejection and retry.
- The existing editor Playwright suite protects keyboard authoring, conflict recovery, publication permissions, media and list behavior.

Run prerequisites and focused checks from the repository root:

```sh
pnpm exec turbo run build --filter=@lacecms/platform-node --filter=@lacecms/platform-cloudflare
pnpm --filter @lacecms/app-admin exec vitest run src/entities/content/draft.test.ts src/pages/entry/EntryPage/EntryPage.test.tsx --maxWorkers=2
pnpm exec vitest run packages/domain/src/index.test.mjs packages/contracts/src/index.test.mjs packages/server/src/app.test.mjs --maxWorkers=2
pnpm --filter @lacecms/platform-node exec vitest run src/index.test.mjs --maxWorkers=2
pnpm --filter @lacecms/platform-cloudflare exec vitest run src/d1-content-repository.test.mjs --maxWorkers=2
pnpm --filter @lacecms/app-admin exec playwright test block-order.e2e.ts editor.e2e.ts --workers=1
pnpm typecheck
pnpm lint
pnpm format:check
```

The browser proof requires local server ports and installed Chromium, but no Docker, MinIO or Cloudflare account. It uses a temporary database and site build directory and removes both on completion. No data migration or release-version change is required. Sessions 33B–33H, including packed-consumer regressions and the next alpha candidate, remain separate work.
