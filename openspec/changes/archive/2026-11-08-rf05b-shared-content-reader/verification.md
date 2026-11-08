# Verification — rf05b-shared-content-reader

Run on 2026-11-08 on branch `docs/refactoring-roadmap`.

| Check | Result |
| --- | --- |
| Baseline (task 1.1) | Node `repository-contract` 213 passed (file and memory SQLite); D1 `repository-contract` + `d1-content-repository.test.ts` 119 passed; D1 budget project 4 passed |
| After each read group (tasks 2.1, 3.1–3.8) | Node 213 and D1 119 passed with identical test titles; D1 budgets 4 passed after the build export moved |
| `db` `reads/content-reader.test.ts` | 5 passed: one two-group read per page, stale cursor fails before group two, re-read mismatch fails after it, chunking by `bindChunk`, single-row reads |
| Moved bodies | Every method-body line of both pre-split repositories found in the `repository/` modules; the only difference is the composite constructor's `options` parameter |
| Node package | 16 files, 313 passed (the `index.test.ts` build-export statement bound is 8: the shared protocol's in-transaction version re-read); packaged 4 files, 5 passed including `migration-executable` (`dist/migrate.js`) |
| Cloudflare package | 14 files, 219 passed; packaged 3 passed |
| `scripts/fixtures/oauth-mcp/compat.test.mjs` (new `dist/security/{oauth,service}.js` paths) | Passed |
| `tests/platform-release-version.test.mjs`, `tests/release-artifacts.test.mjs` (`src/runtime/release-version.ts`) | Passed |
| Export comparison (clean rebuild) | `platform-node`, `platform-cloudflare`: runtime keys and declaration names identical. `db`: + `SqlContentReader`, types `ContentReadSql`, `SqlReadStatement`, `SqlReadGroupRows` |
| Sizes | Node repository 2,291 → largest module `repository/entries.ts` 481; D1 2,696 → `repository/entries.ts` 646; `db` reader 472. Oversized baseline 4 → 2 entries (admin only) |
| Layout | Both platform packages declared in `scripts/source-layout.json`; `platform-node/src/migrate.ts` listed as a root entry; `platform-node` cycle removed from the cycle baseline; typecheck baseline unchanged |
| `pnpm build`, `pnpm test` | Pass (22 and 64 turbo tasks) |
| `pnpm exec vitest run tests/docs-links.test.mjs` | 6 passed |
| `pnpm typecheck`, `pnpm lint` (incl. boundary checker), `pnpm format:check` | Pass |
| `openspec validate rf05b-shared-content-reader --type change --strict` | Valid (`skip_specs`) |
