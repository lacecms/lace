## 1. Restore persistence and runtime test typechecking

- [ ] 1.1 Confirm EX1B and EX2D are implemented on the target checkout. Migrate the `db` exceptions in the resulting baseline using the current statement, row and port types. Remove the `db` entries and verify `pnpm --filter @lacecms/db typecheck` and `pnpm --filter @lacecms/db test`.
- [ ] 1.2 Migrate `platform-node` exceptions, including surviving EX1A companions and post-EX2D repository cases, using the existing Node fixtures. Remove its entries and verify `pnpm --filter @lacecms/platform-node typecheck` and `pnpm --filter @lacecms/platform-node test`, including the repository and security contracts and both SQLite compositions.
- [ ] 1.3 Migrate `platform-cloudflare` exceptions, including surviving EX1A Worker companions and post-EX2D repository cases, using the existing local D1 and Worker harnesses. Remove its entries and verify `pnpm --filter @lacecms/platform-cloudflare typecheck` and `pnpm --filter @lacecms/platform-cloudflare test`, including repository and security contracts, D1 batch cases and Worker query budgets.

## 2. Verify session completion

- [ ] 2.1 Confirm `db` and both platforms have zero `@ts-nocheck` directives and baseline entries, the remaining packages' entries are intact, and the published export declarations match the pre-session checkout. Run `node scripts/check-boundaries.mjs`.
- [ ] 2.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex01c-type-db-and-platform-tests --type change --strict` and `pnpm spec:validate`.
