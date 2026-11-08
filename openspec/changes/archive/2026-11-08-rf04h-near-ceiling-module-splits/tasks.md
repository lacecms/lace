## 1. Baseline

- [x] 1.1 Capture application and content runtime exports, declaration names and existing test-title multisets; run the focused application configuration/content/media and content field/block suites to establish a comparison baseline.

## 2. Application configuration and outbox

- [x] 2.1 Move dispatcher event, retry and lease contracts to `ports/outbox.ts`, update consumers and entry exports; verify outbox tests, typecheck and unchanged public names.
- [x] 2.2 Split evolution into structure diff, hints and evidence owners, update direct imports and entry exports; verify configuration evolution tests and deterministic report assertions.
- [x] 2.3 Replace `plan-support.ts` with model-copy, diagnostics and snapshot-count owners, update callers and entry exports; verify configuration plan, migration and visibility suites.
- [x] 2.4 Extract the configuration fixture concepts to typed `src/test-support/configuration-fixtures.ts`, retaining each fixture's defaults and paging; split affected evolution tests beside their owners, type all split companions and remove deleted baseline entries. Correct the invalid projection-only assertions: check `plan.isValid` and call `configurationSyncContentWrites` for each actual operation with its corresponding model. Verify configuration suites, test typecheck and test-title multiset.

## 3. Application use cases

- [x] 3.1 Extract content draft validation, visibility and publication projection helpers while preserving the facade, cache lifetime, authorization and call order; verify content use-case and publication tests.
- [x] 3.2 Extract media types, upload, metadata and projection helpers while preserving the facade, errors, cleanup and logging; move related tests beside owners and type split companions, removing deleted typecheck baseline entries. Verify media suite and test typecheck.

## 4. Content definitions

- [x] 4.1 Separate field descriptor normalization and metadata projection from builders with direct acyclic imports and unchanged entry exports; move and type related test companions, remove deleted baseline entries, and verify field runtime and type tests.
- [x] 4.2 Separate block settings, registry and migration responsibilities, using independent types/constants where needed; preserve exports and type signatures, move and type relevant tests, and verify block runtime and type tests.

## 5. Verification and documentation

- [x] 5.1 Compare runtime exports, declaration names and test-title multisets to task 1.1; run `pnpm build`, `pnpm test`, and the boundary checker. Confirm no source in the touched packages exceeds 1,000 lines and no baseline grows.
- [x] 5.2 Update RF4H and the progress log in `docs/refactoring-roadmap.md` with actual module ownership, test-baseline changes and verification; run `pnpm exec vitest run tests/docs-links.test.mjs`.
- [x] 5.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate rf04h-near-ceiling-module-splits --type change --strict`; record results and resolve failures before completion.
