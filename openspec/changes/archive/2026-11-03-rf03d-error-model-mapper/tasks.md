## 1. Baseline

- [x] 1.1 Create `verification.md` and record the source case counts of `content`, `domain`, `config`, `application`, `contracts`, `server`, `mcp` and `test-utils` (`pnpm exec vitest list | grep -c " > "` per package), the SHA-256 of `apps/api/openapi/api-v1.json`, the public export lists of the same packages (`pnpm --filter <pkg> build`, names exported by `dist/index.d.ts`), and the current classification of every error case of design decision 9 through `classifyError`, server `app.onError` (status, body, `retry-after`) and MCP `get_entry`; verify the note lists every case with its three outcomes.
- [x] 1.2 Add `packages/test-utils/src/error-matrix.ts` with `errorMatrixCases` per design decision 9 for every class that exists at baseline, using the baseline values (export it from the index; the bare `LaceError`, `InvariantError` and `ContractValidationError` cases are added with those classes in 2.4 and 3.2), and `packages/server/src/error-matrix.test.ts` throwing each case from the harness's `content.loadAdminEntry` through `GET /api/v1/admin/entries/:entryId`; verify `pnpm --filter @lacecms/server test` passes on the unchanged code.

## 2. Error base

- [x] 2.1 Add `packages/content/src/errors.ts` with `LaceError` and `InvariantError` per design decision 1, export both from `packages/content/src/index.ts`, and make `FieldConfigurationError`, `ContentValidationError`, `BlockConfigurationError` and `BlockMigrationError` extend `LaceError` with the codes of design decision 2 (constructors, `name`, messages and properties unchanged); verify `pnpm --filter @lacecms/content typecheck` and the content suite pass at the baseline count.
- [x] 2.2 Make `ConfigurationError` (config) and `DomainError` (domain) extend `LaceError`; re-export `LaceError` from domain; verify the config and domain suites pass at their baseline counts and `apps/api/src/project-config.ts` still matches `name === "ConfigurationError"` (existing api test).
- [x] 2.3 Move `AccountErrorCode`, `AccountError` and `RateLimitExceededError` to `packages/domain/src/index.ts` per design decision 3 (`RateLimitExceededError` gains code `RATE_LIMITED`; `retryAfterSeconds` and message unchanged) and re-export them from `packages/application/src/accounts.ts`; verify the application suite passes at its baseline count with `accounts.test.ts` unchanged.
- [x] 2.4 Add unit cases: each class from 2.1–2.3 is `instanceof LaceError` with its declared `code` and its own `name`; `InvariantError` keeps `cause`; add the bare `LaceError` (internal code) and `InvariantError` matrix cases (500 `INTERNAL_ERROR`); verify they pass.

## 3. Classifier

- [x] 3.1 In `packages/contracts/src/index.ts` add `ContractValidationError`, re-export `LaceError`, replace the four status/message tables with the total `errorMappings` table and its compile-time subset checks, rewrite `classifyError` and `transportError` per design decision 4, and add optional `headers` to `ClassifiedError`; verify `pnpm --filter @lacecms/contracts typecheck` passes and every existing `classifyError` case in `index.test.ts` passes unchanged.
- [x] 3.2 Add the `ContractValidationError` matrix case and `packages/test-utils/src/error-matrix.test.ts`: `classifyError` equals each case (with `headers["retry-after"]` for the rate-limit case), and the totality test of design decision 9 over the five packages' exports; verify it passes, and record in `verification.md` a temporary experiment in which an exported scratch error class without a case makes the totality test fail naming it (revert; `git status` clean of the experiment).

## 4. Server

- [x] 4.1 Replace server `RequestValidationError` with `ContractValidationError`, make `AuthorizationError` extend `LaceError<"AUTHORIZATION_DENIED">`, reduce `app.onError` to the `/mcp`/OAuth `503` branch plus `errorResponse(classifyError(error))`, and apply `classified.headers` in `errorResponse`, per design decision 5; verify `grep -n "AccountError\|RateLimitExceededError" packages/server/src/app.ts` finds nothing and the server suite passes at its baseline count plus the matrix test, with no expected value of a 1.2 case changed.

## 5. MCP

- [x] 5.1 Remove `ArgumentFailure` and route every tool failure through `classifyError` per design decision 6; verify the existing MCP case "SDK calls preserve safe validation, known application, protocol and internal errors" passes unchanged.
- [x] 5.2 Add an MCP matrix case to `packages/mcp/src/index.test.ts`: for every `errorMatrixCases` entry thrown from `content.loadAdminEntry`, `get_entry` returns an error whose structured content equals `classifyError(create()).body` and contains no `retry-after`; verify it passes, and record in `verification.md` that the `AccountError` and `RateLimitExceededError` cases differ from their 1.1 baseline (`INTERNAL_ERROR`) while every other case equals it.

## 6. Raw errors

- [x] 6.1 Convert the twelve raw sites per design decision 7: `encodeEntryLink`, `parseSchemaPath` and `schemaFieldAt` throw `TypeError`; the three canonical-JSON checks, the two `configuration-evolution.ts` traversals and the three `media-use-cases.ts` sites throw `InvariantError`; messages unchanged. Add content cases asserting `toThrow(TypeError)` for an invalid entry link ID, a non-string and an invalid schema path and an invalid traversal; verify the content, config, application and test-utils suites pass.
- [x] 6.2 Run `grep -rn "new Error(" packages/content/src packages/application/src --include='*.ts'` excluding tests; record in `verification.md` that it finds no match.

## 7. Guard

- [x] 7.1 Extend `tests/shared-vocabulary.test.mjs` per design decision 9 (single owner for `LaceError`, `InvariantError`, `AccountError`, `RateLimitExceededError`, `ContractValidationError`, `classifyError`; `new Error(` flagged in content and application source) with a flagged fixture under `tests/fixtures/shared-vocabulary/`; verify the guard passes on the tree and the fixture fails with its file and line.
- [x] 7.2 Add `LaceError` and `InvariantError` to content's, `LaceError`, `AccountError` and `RateLimitExceededError` to domain's, and `LaceError` and `ContractValidationError` to contracts' `packaged-exports.packaged.test.mjs`; verify `test:packaged` passes for the three packages and application's export list equals its baseline.

## 8. Documentation and gates

- [x] 8.1 Update `docs/mvp-architecture.md` §12 *Contract rules* with the error-model bullet of design decision 10, add `docs/adr/0019-error-model.md` and its `docs/adr/README.md` row, and move the roadmap baseline row "error conventions" from 4 to 1 with a progress-log row; verify the root link guard passes.
- [x] 8.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`, `pnpm openapi:check` and `pnpm exec openspec validate rf03d-error-model-mapper --type change --strict`; verify all pass, `api-v1.json` has the baseline SHA-256, export lists equal the baseline plus the additions of the proposal, and per-package case counts equal the baseline plus the cases added here, recorded in `verification.md`.
