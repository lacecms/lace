## Context

All four members already include `src/**/*.test.ts` and typed `src/test-support/` helpers in their no-emit `tsconfig.test.json` with `@lacecms/source` resolution. The member `typecheck` scripts already run those projects. Architecture §6 and §20 define the source layout and the separate packaged-output test tier.

## Goals / Non-Goals

**Goals.** Check valid fixtures and mocks against their owning types. Preserve the values, execution paths and assertions of cases that exercise runtime rejection.

**Non-goals.** Production contracts, dependency edges, TypeScript settings, packaged-output tests and EX2's persistence fixture changes are outside this migration.

## Decisions

1. **Use the contracts and fixtures nearest each suite.** The CLI's RF7C helpers `import-fixtures.ts`, `import-api.ts` and `upgrade-fixtures.ts` remain the common setup for their respective suites. Use the CLI's actual options, package shapes and transport signatures to type the block, doctor, operator, import and upgrade tests. In `create-lace`, use `GenerateOptions`, `CliTerminal`, `ProjectManifest` and the site-mode types for the generator and prompt fixtures. Treat serialized manifests, generated `package.json` files and Compose output as data read back from disk or a process. Check fields the tests consume before accessing them.
2. **Preserve the API and builder test boundaries.** In `apps/api`, type synchronization fakes from `runLocalContentSync` and its target, reuse the existing `@lacecms/platform-node/test` harness in the Node server suite and keep the migrated SQLite case. Type project config, dispatch and HTTP fixtures from their existing interfaces. In `apps/builder`, reuse `builder-harness.ts` for fixed-command runner cases. Use the handler's Node HTTP signature and typed build callback for request, response and recorded-call fixtures. Keep authorization, invalid request, concurrency, failure diagnostics and atomic release assertions on their current paths.
3. **Keep deliberately invalid input at the boundary it tests.** Type accurate mocks from the actual signatures and narrow parsed JSON and caught errors from `unknown` where a test consumes their fields. If a runtime-rejection case deliberately passes an invalid value directly to a typed API, limit the assertion to that argument and state why. Keep helpers local to their owners and use existing test-only exports. Broad casts, `any` and blanket suppressions would hide fixture drift. Widening production interfaces for fixtures would change contracts that this migration relies on.
4. **Shrink the inventory by member.** Use the corresponding prefixes in `scripts/test-typecheck-baseline.json` as the worklist on the apply checkout. Retire each directive and path in the same change after the member's test project passes. Keep the remaining DB and platform entries in the baseline. EX1C checks the inventory on its post-EX2D checkout and deletes the file once the full workspace inventory is empty. The boundary checker already treats a missing file as an empty baseline.

## Risks / Trade-offs

- A fixture rewrite can send a negative case through a different validation branch. Keep the malformed payloads, expected errors and side-effect assertions. Compare source-suite collection before and after the migration and run the same member suites.
- This session types the API and CLI fixtures against the current synchronization contract. EX2 must update affected callers and fixtures alongside its contract changes. The EX1C handoff should use the live baseline because EX2 may move or replace DB and platform tests.
