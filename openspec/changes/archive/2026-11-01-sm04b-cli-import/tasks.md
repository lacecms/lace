## 1. Architecture and documentation first

- [x] 1.1 Add ADR `docs/adr/0017-content-import-client.md` (import is an admin REST client, never a database writer; `cli -> contracts`; format v1 and edit protection) and update `docs/mvp-architecture.md` §6 (CLI scope and dependency direction) and §12 (import client note after the import lookups paragraph); verify with `pnpm docs:check`
- [x] 1.2 Add the `cli -> contracts` edge to `scripts/check-boundaries.mjs` and the `@lacecms/contracts`, `valibot` (runtime) and `@valibot/to-json-schema` (dev) catalog dependencies to `packages/cli/package.json`; verify `pnpm install --frozen-lockfile=false` updates the lockfile and `node scripts/check-boundaries.mjs` passes

## 2. Shared draft normalization

- [x] 2.1 Extract `normalizeDraftCandidate` from `ContentUseCases.validateDraft` in `packages/application/src/content-use-cases.ts` (aggregate validation, block rebuild with positions, SEO normalization, global title) and make `validateDraft` call it; verify existing application, db contract and server tests pass unchanged
- [x] 2.2 Export `normalizeDraftCandidate` and re-export `encodeEntryLink`, `canonicalizeJson`, `normalizeMediaTags`, `normalizeMediaText` and `isMediaFocalCoordinate` from `@lacecms/application`; add application tests for the three spec scenarios (prediction equals a saved draft through an in-memory use case, global title, invalid block data path)

## 3. Package format and JSON Schema

- [x] 3.1 Implement `packages/cli/src/import-format.ts` (format v1 Valibot schema, key rules, limits, slug/title/seo per model kind, block shape, unique keys, one entry per singleton and per collection slug) with tests for unknown version, duplicate keys, missing collection slug, global title and unknown properties, each asserting the JSON Pointer
- [x] 3.2 Add `scripts/generate-import-schema.mjs` and the committed `packages/cli/schema/lace-import.schema.json`, export it as `@lacecms/cli/lace-import.schema.json` and include `schema` in `files`; add a drift test and a test that a valid sample package passes the JSON Schema

## 4. Files and references

- [x] 4.1 Implement `import-files.ts` (relative POSIX paths without `.`/`..`/empty segments, realpath containment, regular file, 10 MiB limit, `detectMediaMimeType`, SHA-256) with tests for traversal, an escaping symlink, a directory, an oversized file, a PDF renamed to `.png` and identical bytes with differing metadata
- [x] 4.2 Implement `import-references.ts` (descriptor-driven walk over fields, groups, lists, block data and `seo.image`; placeholder, resolved and stripped rewrites; `encodeEntryLink`) with tests for misplaced references, unknown keys, global targets, literal pass-through, list-element and property stripping, and an `entry:abc%2F1` rewrite

## 5. Local validation and offline mode

- [x] 5.1 Implement `import-validate.ts`: load `lace.config.ts` like `content sync`, derive block keys `b<n>`, positions and current schema versions, run `normalizeDraftCandidate` in draft mode and in publish mode for entries that will publish, collect all issues with package pointers and no values; test with a fixture config covering a page, a global, a collection, a gallery block and SEO
- [x] 5.2 Implement argument parsing and usage in `import-command.ts` (`--url`, `--publish`, `--dry-run`, `--validate-only`, `--overwrite`, `--state`, `--json`; invalid combinations), dispatch `import` in `bin.ts`, and the `--validate-only` path; test that it makes no network request and needs no token

## 6. HTTP client and state

- [x] 6.1 Implement `import-client.ts` (origin rules incl. loopback HTTP, Bearer header, contract-validated responses, sanitized `IMPORT_*` errors, `Retry-After` seconds/HTTP-date with injected sleep and clock, 300 s and 10-wait bounds) with tests against a fake fetch: remote plain HTTP refused before sending, token never in errors, 429 retry, bound exceeded
- [x] 6.2 Implement `import-state.ts` (per-origin targets, atomic write, tolerant of a missing file, strict on a malformed one) with tests

## 7. Plan

- [x] 7.1 Implement credential and configuration checks in `import-plan.ts` (`IMPORT_UNAUTHORIZED`, missing `content:publish`, `IMPORT_CONFIG_MISMATCH` for model kind/version and block type/version) with tests against an in-process Node API (`src/import-api.mjs`)
- [x] 7.2 Implement media and entry lookups with state verification, singleton and ambiguous-slug errors, and classification (`upload/update/unchanged`, `create/update/unchanged/conflict`) using canonical comparison of normalized candidates; test first run, rerun, edited-since-import conflict, edit equal to package, `--overwrite`, and a stale state ID
- [x] 7.3 Implement publication planning (publish set, delivered-link edges only to targets without a published version, hidden blocks ignored, unpublished non-publishing target error, deterministic topological order, cycle error) with tests for the three spec scenarios
- [x] 7.4 Implement human and `--json` plan output, summary counts and `--dry-run`; test that a dry run issues only GET requests and prints every item

## 8. Apply

- [x] 8.1 Implement `import-apply.ts`: uploads with tags, GET-then-PATCH metadata with `If-Match`, creates with stripped candidates, complete saves with `expectedRevision`, publications with `Idempotency-Key`, state update after every write; test the request sequence against the in-process Node API, including stop on `409` with completed writes recorded
- [x] 8.2 Add the `import` operation to `diagnostics.ts` with reason/next-action text for each `IMPORT_*` code and the exit-code mapping; test JSON failure objects and that no token or file content appears in either output mode

## 9. Integration and documentation

- [x] 9.1 Add a CLI integration test (`src/import-apply.test.mjs`) against an in-process Node API (fixture project config, migrated SQLite, seeded admin, import token created through the security service): first run creates media and entries and publishes in order; a rerun performs no write; an interrupted run (fail after creates) completes on rerun without duplicates; an edited draft yields `IMPORT_CONFLICT` and `--overwrite` saves it; run with `pnpm turbo run test --filter=@lacecms/cli`
- [x] 9.2 Document `lace import` in `packages/cli/README.md` (options, environment, format summary, plan actions, exit codes, state file, same-release note) and add the SM4B row to the roadmap progress log; verify the documentation checks pass
- [x] 9.3 Run the narrowest package tests, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, boundary checks and `pnpm exec openspec validate sm04b-cli-import --type change --strict`; record results in `verification.md`
