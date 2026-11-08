## 1. Baseline

- [x] 1.1 Build `@lacecms/domain` and `@lacecms/auth` from clean `dist/` and record in `verification.md` (design decision 4):
  - the sorted runtime keys of each `dist/index.js`;
  - the declaration export names of each `dist/index.d.ts`;
  - sorted `vitest list` titles (domain 23, auth 4);
  - the current `scripts/source-cycle-baseline.json` and `scripts/test-typecheck-baseline.json` entries for both packages.

  Verify the raw lists exist in the session scratchpad and the counts match.

## 2. `@lacecms/domain` modules

- [x] 2.1 Create `shared/brands.ts`, `shared/errors.ts` and `shared/failures.ts` from design decision 1, importing them from `index.ts`. Verify `pnpm --filter @lacecms/domain typecheck` and `test` pass.
- [x] 2.2 Create `access/actors.ts`, `access/permissions.ts` and `access/errors.ts` (owner decision: account and rate-limit errors in `access/`), plus `media/metadata.ts`. Verify typecheck and tests pass.
- [x] 2.3 Move `build-status.ts` and `build-diagnostics.ts` with `git mv` into `builds/status.ts` and `builds/diagnostics.ts`, then create `builds/state.ts` and `builds/export-errors.ts`. Verify typecheck and tests pass.
- [x] 2.4 Move `seo.ts` with `git mv` to `content/seo.ts` so it imports `Brand` from `shared/brands.ts`, then create `content/routes.ts`, `content/blocks.ts`, `content/collection-queries.ts` and `content/entries.ts`. Verify typecheck and tests pass.
- [x] 2.5 Reduce `index.ts` to `packageName`, the `@lacecms/content` re-exports and the module re-exports, starting with the `// Directory dependencies:` header. Add `packages/domain` to `scripts/source-layout.json` with the measured directory sets, and remove the domain component from `scripts/source-cycle-baseline.json`. Verify:
  - `node scripts/check-boundaries.mjs` passes;
  - only `index.ts` remains as a root production module;
  - no module exceeds 400 lines;
  - the built runtime keys and declaration names equal the task 1.1 baseline.

## 3. `@lacecms/auth` modules

- [x] 3.1 Use `git mv` to move:
  - `trusted-origins.ts` and `client-address.ts` → `shared/`;
  - `import-actor.ts` → `import/actor.ts`;
  - `mcp-oauth.ts` → `mcp/oauth.ts`;
  - `oauth-guard.ts` → `mcp/guard.ts`;
  - `mcp-actor.ts` → `mcp/actor.ts`;
  - `mcp-consent.ts` → `mcp/consent.ts`;
  - `mcp-boundary.ts` → `mcp/boundary.ts`.

  Update the relative imports. Verify `pnpm --filter @lacecms/auth typecheck` and `test` pass.
- [x] 3.2 Create `mcp/provider.ts` with the provider and guard types moved from `mcp/boundary.ts`, and point `consent.ts` and `boundary.ts` at it. Move the Better Auth boundary from `index.ts` to `session/better-auth.ts`. Verify:
  - typecheck and tests pass;
  - a scratch scan reports no auth cycle.
- [x] 3.3 Reduce `index.ts` to `packageName` and re-exports under the `// Directory dependencies:` header. Add `packages/auth` to `scripts/source-layout.json`, and remove the auth component from `scripts/source-cycle-baseline.json`. Verify `node scripts/check-boundaries.mjs` passes, and the built runtime keys and declaration names equal the task 1.1 baseline.

## 4. Tests: split and typed

- [x] 4.1 Split `packages/domain/src/index.test.ts` into the design decision 3 companions, and move `index.type-test.ts` beside the module it asserts. Remove the directive, type every companion, and delete the domain entry from `scripts/test-typecheck-baseline.json`. Verify:
  - `pnpm --filter @lacecms/domain typecheck` (including type tests) and `test` pass;
  - the sorted titles equal the task 1.1 baseline;
  - no companion carries `@ts-nocheck`;
  - no production file changed for typing.
- [x] 4.2 Split `packages/auth/src/index.test.ts` into the design decision 3 companions, remove the directive, type every companion, and delete the auth entry from `scripts/test-typecheck-baseline.json`. Verify:
  - `pnpm --filter @lacecms/auth typecheck` and `test` pass;
  - the sorted titles equal the task 1.1 baseline;
  - no companion carries `@ts-nocheck`.

## 5. Consumers, documentation and gates

- [x] 5.1 Run `typecheck` for the workspace consumers of both packages and their packaged export tests (`pnpm exec turbo run test:packaged --filter=@lacecms/domain --filter=@lacecms/auth`), plus `pnpm compat:mcp` against rebuilt dist. Verify all pass unchanged.
- [x] 5.2 Add the RF4G session section to `docs/refactoring-roadmap.md` after RF4F. Update the §4 delivery row, and add §3 rows: intra-package cycles 5 → 3, test typecheck exceptions 139 → 137 (RF4F already took the baseline from 141 to 139). Record that the platform-node `client-address.ts` duplicate reported by the audit does not exist. Verify the docs link guard passes.
- [x] 5.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm exec openspec validate rf04g-domain-auth-layout --type change --strict`. Verify all pass, record the results in `verification.md`, and delete raw passed-run output.
