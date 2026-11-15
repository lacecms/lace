## 1. Restore core test typechecking

- [x] 1.1 Migrate the `contracts` suites with existing DTOs and `rest-fixtures.ts`. Remove their baseline entries and verify the package's `typecheck` and `test` tasks, including schema rejection cases.
- [x] 1.2 Migrate `content` and `application` with their package-local fixtures and branded IDs. Remove their baseline entries and verify `typecheck` and `test` for both packages, including existing type tests and invalid-input cases.
- [x] 1.3 Migrate `server` and `mcp` using the existing app harness and test-utils actors and port fakes where applicable. Include the server content-route companions from EX1A. Remove the two packages' baseline entries and verify `typecheck` and `test` for both.
- [x] 1.4 Migrate `sdk`, `astro` and `render`, including the published-site companions from EX1A. Use typed client, framework and render fixtures and preserve malformed response and render rejection cases. Remove the three packages' baseline entries and verify `typecheck` and `test` for each.

## 2. Verify session completion

- [x] 2.1 Confirm the eight packages have zero `@ts-nocheck` directives and baseline entries, the remaining packages' entries are intact, and the published export declarations match the pre-session checkout. Run `node scripts/check-boundaries.mjs`.
- [x] 2.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex01b-type-core-package-tests --type change --strict` and `pnpm spec:validate`.
