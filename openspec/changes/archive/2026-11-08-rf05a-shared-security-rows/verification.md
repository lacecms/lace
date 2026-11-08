# Verification — rf05a-shared-security-rows

Run on 2026-11-08 on branch `docs/refactoring-roadmap`.

| Check | Result |
| --- | --- |
| Baseline (task 1.1) | Node security + repository contract 230 passed; D1 123 passed; 17 security-contract titles per runtime |
| `platform-node` security-contract, repository-contract, index | 258 passed |
| `platform-cloudflare` security-contract, repository-contract, worker | 154 passed |
| `scripts/fixtures/oauth-mcp/compat.test.mjs` (imports `dist/d1-security.js`) | 93 passed |
| `application` `ports/security.test.ts`, `db` `security/rows.test.ts` | 3 and 10 passed; both packaged export pins pass |
| Server credential-related route tests | 26 passed |
| Moved bodies | Every original line of both adapter classes found in the port modules after the planned renames (whitespace and trailing commas ignored) |
| Export comparison | `platform-node`, `platform-cloudflare`: runtime keys and declaration names identical. `db`: +10 shared names. `application`: +`SENSITIVE_RATE_LIMIT_POLICIES`, `SETUP_TOKEN_TTL_MS`, type `SensitiveRateLimitPolicy` |
| Security-contract titles | Identical to baseline on both runtimes (17 each) |
| Local copies | `rg` for the old helper names, `setupExpiryMs` and `const limits` in `packages/platform-*/src`: none |
| Sizes | `security.ts` 860 → 202, `d1-security.ts` 984 → 215; largest new module D1 `security/account.ts` 629. No baseline file changed |
| `pnpm build`, `pnpm test` | Pass (64 turbo tasks; root suite 36 files, 350 tests) |
| `pnpm exec vitest run tests/docs-links.test.mjs` | 6 passed |
| `pnpm typecheck`, `pnpm lint` (incl. boundary checker), `pnpm format:check` | Pass |
| `openspec validate rf05a-shared-security-rows --type change --strict` | Valid (`skip_specs`) |
