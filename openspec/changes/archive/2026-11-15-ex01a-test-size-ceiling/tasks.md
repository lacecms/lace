## 1. Adopt the workspace test size rule

- [x] 1.1 Update architecture §6 and §20, ADR 0020, `AGENTS.md`, `DEVELOPMENT.md` and the EX1A roadmap decision to match the workspace source scope, shared baseline and standalone fixture handling. Verify the documents describe the same covered paths as the delta spec.
- [x] 1.2 Apply the 1,000-line check to the covered test files through the existing size baseline. Update `tests/boundaries.test.mjs` to cover 1,000 and 1,001 lines, test baseline growth and stale entries, type tests, packaged JavaScript tests and exclusions. Verify `pnpm exec vitest run tests/boundaries.test.mjs --maxWorkers=2`, including the existing production import, layout and baseline cases.

## 2. Split oversized suites and preserve coverage

- [x] 2.1 Split `platform-node/src/index.test.ts` by composition and settings, dispatch, security, storage and SQLite/readiness/export coverage. Split `platform-cloudflare/src/worker.test.ts` by Worker composition and settings, content and media, dispatch and Pages tracking. Update the Node security and Cloudflare provider selectors in `scripts/security-resilience-verification.mjs` as needed. Verify the prior scenario inventory through both platform source suites and run the updated phase file selections directly. Run `tests/security-resilience-runner.test.mjs` for the runner's argument handling.
- [x] 2.2 Split `test-utils/src/store/entries.test.ts` by lifecycle/publication and query/projection coverage, and `test-utils/src/store/media.test.ts` by media lifecycle, metadata and usage/detach coverage. Verify the prior scenario inventory with `pnpm --filter @lacecms/test-utils test`.
- [x] 2.3 Split `server/src/routes/content.test.ts` by discovery, lifecycle and query/validation coverage, and `sdk/src/site/published-site.test.ts` by loader transport/revalidation, export assembly/pagination and site-view coverage. Update the role-denial reference in `docs/verification.md` if needed. Verify the prior scenario inventory through the server and SDK source suites.
- [x] 2.4 Split admin's `src/shared/api/admin-client.test.ts` by account/settings, content, build and media transport, and `src/pages/entry/EntryPage/EntryPage.test.tsx` by save/conflict, publication and form/validation interactions. Reuse the nearby companions where they already own a concern. Verify the prior scenario inventory with `pnpm --filter @lacecms/app-admin test`.

## 3. Verify the workspace guard and session boundary

- [x] 3.1 Verify `node scripts/check-boundaries.mjs` passes, every split file is at or below 1,000 lines, no new size exception is needed, and every remaining unchecked companion is explicitly listed in `scripts/test-typecheck-baseline.json`. Remove stale paths in the same change and confirm published export declarations match the pre-session checkout.
- [x] 3.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex01a-test-size-ceiling --type change --strict` and `pnpm spec:validate`.
