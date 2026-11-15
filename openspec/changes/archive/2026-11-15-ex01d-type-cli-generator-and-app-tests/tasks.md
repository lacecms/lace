## 1. Restore source test typechecking

Before editing each member, capture its source test case names with `pnpm --filter <member> exec vitest list` for comparison in task 2.1.

- [x] 1.1 Type the CLI test exceptions for the package entry, blocks, doctor, operator, import and upgrade using the existing CLI types and fixture helpers. Retire the CLI paths from the baseline and run `pnpm --filter @lacecms/cli typecheck` and `pnpm --filter @lacecms/cli test`, including the existing transport failures, invalid import inputs and upgrade recovery cases.
- [x] 1.2 Type the `create-lace` `site-modes` and `scenario-guides` suites. Retire their baseline paths and run `pnpm --filter create-lace typecheck` and `pnpm --filter create-lace test`. Verify that the existing mode, manifest, generated guide and file ownership assertions still run.
- [x] 1.3 Type the API `project-config`, `content-sync`, `production` and `node-server` suites. Retire their baseline paths and run `pnpm --filter @lacecms/app-api typecheck` and `pnpm --filter @lacecms/app-api test`, including the existing SQLite synchronization and Node server cases.
- [x] 1.4 Type the builder `runner` and `handler` suites using the typed builder fixture, build callback and Node HTTP boundary. Retire their baseline paths and run `pnpm --filter @lacecms/app-builder typecheck` and `pnpm --filter @lacecms/app-builder test`. Verify the existing request rejection, serialization, sanitized failure and release-switch cases.

## 2. Verify session completion

- [x] 2.1 Check that the four members have zero `@ts-nocheck` directives and baseline entries and that every unrelated baseline path is still present. Compare the collected source test case names with their pre-migration list using each member's `vitest list`. Review the diff to confirm production source, templates, packaged suites and public export and bin declarations are unchanged. Run `node scripts/check-boundaries.mjs`.
- [x] 2.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex01d-type-cli-generator-and-app-tests --type change --strict` and `pnpm spec:validate`.
