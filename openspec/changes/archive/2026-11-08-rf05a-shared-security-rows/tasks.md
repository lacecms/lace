## 1. Baseline

- [x] 1.1 Record the runtime export keys and sorted `dist/index.d.ts` declaration names of `@lacecms/platform-node`, `@lacecms/platform-cloudflare`, `@lacecms/db` and `@lacecms/application`, the test-title multiset of both `security-contract.test.ts` files and the line counts of `security.ts` and `d1-security.ts`; run both platforms' `security-contract` and `repository-contract` suites green as the comparison point.

## 2. Shared owners

- [x] 2.1 Add `SensitiveRateLimitPolicy` and the frozen `SENSITIVE_RATE_LIMIT_POLICIES` table to `packages/application/src/ports/security.ts` and `SETUP_TOKEN_TTL_MS` to `accounts/use-cases.ts` with values copied from the adapters (design D2); add a unit test pinning all eleven policies, the frozen object and the TTL, and add the two runtime names to the application packaged export pin. Verify the application tests and typecheck.
- [x] 2.2 Create `packages/db/src/security/rows.ts` with `securityRole`, `managedUser` (`Number(row.disabled) === 1`), `userProfile`, `invitationRecord`, `sessionRecord`, `buildTokenMetadata`, `normalizedEmail`, `isUniqueViolation`, `INVITATION_COLUMNS_SQL` and `ACTIVE_INVITATION_SQL` (design D1), export it from the `db` entry and add the ten names to the db packaged export pin. Add a typed `rows.test.ts` covering role rejection, the optional `name`/`userAgent`/`lastUsedAt`/`revokedAt` keys, the inviter display-name fallback, email normalization failures and unique-violation detection. Verify the db tests, typecheck and the boundary checker.

## 3. Node adapter

- [x] 3.1 Create `packages/platform-node/src/security/secrets.ts` and move `account.ts`, `session.ts` and `token.ts` port classes out of `NodeSecurityService` verbatim, importing the shared rows, policies and `SETUP_TOKEN_TTL_MS` (design D3); reduce `security.ts` to the delegating `NodeSecurityService` and `NodeFixedWindowRateLimiter` reading `SENSITIVE_RATE_LIMIT_POLICIES`. Verify with `git diff --color-moved` that method bodies are unchanged apart from imports, then run the Node `security-contract`, `index.test.ts` and `repository-contract` suites green.

## 4. D1 adapter

- [x] 4.1 Create `packages/platform-cloudflare/src/security/secrets.ts` and `statements.ts`, and move the `account.ts`, `session.ts` and `token.ts` port classes out of `D1SecurityService` verbatim, replacing `this.statement(...)` with `bindStatement(this.database, ...)` and importing the shared rows, policies and TTL (design D3); reduce `d1-security.ts` to the delegating `D1SecurityService` and `D1FixedWindowRateLimiter`. Verify with `git diff --color-moved`, then run the D1 `security-contract`, `worker.test.ts` and `repository-contract` suites and the OAuth MCP compatibility test (`scripts/fixtures/oauth-mcp/compat.test.mjs`, which imports `dist/d1-security.js`) green.

## 5. Server

- [x] 5.1 Type the security dependency of `packages/server/src/routes/credentials.ts` as `TokenSecurityPort`, including the `buildTokenDto` input (design D4). Verify the credential route tests and server typecheck.

## 6. Verification and documentation

- [x] 6.1 Compare against task 1.1: platform runtime keys and declaration names identical; db and application differ only by the added names; contract test-title multisets identical; no local copy of a shared helper remains (`rg "function (role|user|profile|invitation|session|buildToken|normalizedEmail|isUniqueViolation)\\b|setupExpiryMs|const limits" packages/platform-*/src` finds nothing); every touched production file is under 1,000 lines and no size, cycle or typecheck baseline grows. Run `pnpm build`, `pnpm test` and the boundary checker.
- [x] 6.2 Update the RF5A section, the §3 security duplication row and the progress log in `docs/refactoring-roadmap.md` with the module ownership and line counts; run `pnpm exec vitest run tests/docs-links.test.mjs`.
- [x] 6.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate rf05a-shared-security-rows --type change --strict`; record the results in `verification.md` and resolve failures before completion.
