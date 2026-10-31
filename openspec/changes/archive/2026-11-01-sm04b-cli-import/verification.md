# Verification: sm04b-cli-import

Date: 2026-11-01. Node 24.12.0 (pinned), pnpm 12.3.4.

| Check | Result |
| --- | --- |
| `pnpm turbo run test --filter=@lacecms/cli --filter=@lacecms/application` | pass: CLI 38 files / 318 tests, application 8 files / 123 tests |
| `pnpm turbo run test --filter=@lacecms/server --filter=@lacecms/db` (after the normalizer extraction) | pass: 104 + 25 tests |
| `node packages/cli/scripts/generate-import-schema.mjs --check` | pass (no drift) |
| `pnpm format:check` | pass |
| `pnpm lint` (Oxlint, boundary and admin-color checks; new `cli -> contracts` edge) | pass |
| `pnpm typecheck` | pass |
| `pnpm test` (root) | pass |
| `pnpm build` | pass |
| `pnpm acceptance:starter`, `pnpm acceptance:existing-site` | pass |
| `pnpm openapi:check` | pass (no REST change) |
| `pnpm spec:validate`, `openspec validate sm04b-cli-import --type change --strict` | pass (84 items) |
| `pnpm docs:check` | pass |
| `pnpm install --frozen-lockfile` | pass |

## Coverage notes

- The integration tests (`src/import-apply.test.mjs`, `src/import-plan.test.mjs`) run
  `runImportCommand` against an in-process Node API (`src/import-api.mjs`): migrated
  SQLite, synchronized fixture configuration, a seeded administrator and a real import
  token from the security service. Images are accepted by a stub inspector; uploads,
  hash lookups, metadata patches, creates, saves, publication and the Bearer allowlist
  are the real server paths.
- Covered: first run order and reference resolution, rerun with and without the state
  file writing nothing, edit protection (`conflict`, `--overwrite`, edit equal to the
  package), interrupted run resumed without duplicates, `409` stop with completed
  writes recorded, dry run reading only, missing publish capability, model-version
  mismatch, ambiguous slug, link cycles, unpublished targets, hidden-block links,
  stale state IDs, offline `--validate-only`, settings and transport rules, binary
  JSON and human failures without the token.
- `429` handling is covered by client tests with an injected clock and sleep; the
  in-process API runs without rate limits.
- Not run here (SM4C scope): acceptance journeys against local Node (Docker/MinIO)
  and local Worker installations.
