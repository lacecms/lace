## 1. Baseline and small packages

- [x] 1.1 Record `pnpm exec vitest list | grep -c " > "` for `application`, `db`, `auth`, `server`, `mcp` (expected 130, 26, 4, 85, 5) in the verification note.
- [x] 1.2 Convert `db` (`index.test.mjs` → `index.test.ts`, configs, `tsconfig.test.json`, packaged smoke test, scripts, remove the interim build prefix); verify 26 cases from source with `packages/db/dist` absent and `pnpm --filter @lacecms/db typecheck` passes.
- [x] 1.3 Convert `auth`; verify 4 cases from source and typecheck.
- [x] 1.4 Convert `mcp`; verify 5 cases from source and typecheck.

## 2. Application

- [x] 2.1 Convert the nine per-module application test files (`accounts`, `conditional-publication`, `configuration-evolution`, `configuration-migration`, `configuration-visibility`, `content-authority`, `draft-normalization`, `email`, `image-container`) to `.test.ts` importing their modules; verify they pass from source.
- [x] 2.2 Split `index.test.mjs` into `index.test.ts`, `configuration-sync.test.ts`, `site-build.test.ts`, `media-use-cases.test.ts`, `collection-queries.test.ts`, `build-export.test.ts`, `internal-links.test.ts` and `import-tokens.test.ts` per the line-range map in design; verify the eight files together list exactly the 31 original test names and the package totals 130 cases.
- [x] 2.3 Add the application configs, `tsconfig.test.json`, packaged smoke test and scripts, remove the interim prefix; verify `pnpm --filter @lacecms/application test` passes without `dist/` and typecheck passes.

## 3. Server

- [x] 3.1 Create `src/test-support/app-harness.ts` with the helpers listed in design decision 2, typed against `@lacecms/server` source; verify `node scripts/check-boundaries.mjs` passes and the module exports no test.
- [x] 3.2 Split `app.test.mjs` into `app.test.ts`, `routes-session-settings.test.ts`, `routes-accounts.test.ts`, `routes-users-invitations.test.ts`, `routes-builds.test.ts`, `routes-media.test.ts`, `routes-content.test.ts`, `routes-public-export.test.ts`, `routes-mcp.test.ts` and `routes-import.test.ts` per the route-group map; verify the files together list exactly the 65 original test names.
- [x] 3.3 Convert `build-site.test.mjs`, `email.test.mjs` and `index.test.mjs` to `.test.ts`; add configs, `tsconfig.test.json`, packaged smoke test and scripts; remove the interim prefix; verify `pnpm --filter @lacecms/server test` passes 85 cases from source and typecheck passes.

## 4. Gates

- [x] 4.1 Count `// @ts-nocheck` headers added in this session and list each with its `TODO(rf2)` reason in the verification note; verify the count against the RF2A count.
- [x] 4.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test` and `pnpm spec:validate`; verify all pass with the five packages at baseline counts plus one packaged case each.
- [x] 4.3 Add the progress-log row to `docs/refactoring-roadmap.md` and note in RF4B/RF4D session text which test file accompanies each future module; verify the root link guard passes.
