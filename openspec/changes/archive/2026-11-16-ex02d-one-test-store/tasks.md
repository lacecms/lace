## 1. Record the ownership decisions

- [x] 1.1 Update architecture §6, §9, §14–16 and §20 and resolve the EX2D author-profile question in the roadmap before changing code. Verify the documentation names the Node DB subpath, the two production repository implementations, the three contract targets, the source-only fixture and the security-owned projection. Keep the effective D1 query limits and authorization boundaries documented.

## 2. Separate attribution from provider tables

- [x] 2.1 Add the shared projection schema, forward backfill and atomic account maintenance. Verify a fresh database and an upgrade from the previous migration on Node and local D1, including existing attributed content, default roles, blank names, account insertion, rename, role change, disable, deletion and rollback. Verify the migration ledger, foreign keys and unchanged content and build state.
- [x] 2.2 Route collection summaries, explicit editor descriptions, media catalog list and detail, snapshot/build hydration and both publication role reads through the projection. Run collection SQL snapshots, schema/statement drift checks and shared cases for live names and roles, deleted accounts, blank names and system actors. Verify that content and media SQL has zero direct reads or joins of provider account tables.
- [x] 2.3 Verify account setup, invitation, self-service and role changes on both runtimes. Run SQL instrumentation for first and continued collection pages, maximum media catalog pages, public export with globals and publication. Confirm the existing read and write budgets, index use, bind counts and batch counts with multiple authors and unchanged authorization and payload shapes.

## 3. Share the SQLite repository and fixture

- [x] 3.1 Extract the Node repository and native transaction executor into the Node DB subpath. Keep the existing platform exports, factories and option semantics. Verify both native SQLite modes, the write-plan and publication race cases, the compiled Node subpath and platform export tests, and the packaged Worker smoke test. Confirm the Worker bundle remains independent of the Node driver.
- [x] 3.2 Add the typed source-only fixture and reuse it in the in-memory Node repository contract runner. Verify migration and close behavior, foreign keys, independent fixture databases, two repository instances over one fixture database and unchanged SQL observation and failure injection. Verify pnpm and Turbo resolve test dependencies without a cycle and include DB migration changes in the fixture consumers' source test cache inputs.

## 4. Migrate repository consumers and retire the fake

- [x] 4.1 Convert the server harness and MCP fixtures to SQLite. Verify REST lifecycle, list filters and cursors, media attribution and usage, conditional public export, and MCP tool authority and draft/publication results. Replace fake state inspection with persisted reads and keep injected port failures explicit.
- [x] 4.2 Retain the store's distinct persistence assertions in the SQLite-backed application tests or shared contract cases. Verify revision and route conflicts, immutable publications and rollback, content projection and filtering, media usage and deletion, stale sync, and paged delivery. Run the same shared cases on both Node SQLite modes and local D1, including the case-name inventory.
- [x] 4.3 Delete the JavaScript content store, its fake-only helpers and the obsolete export. Verify no live references remain, the pure visibility/filter parity subpaths still work in browser tests, and relevant verification runners, package exports and source-layout checks still pass. Update only stale entries in the source and test baselines.

## 5. Validate EX2D

- [x] 5.1 Run the relevant tests for `db`, `test-utils`, `application`, `server`, `mcp`, both platform packages and admin parity consumers. Record the final repository implementation count, removed fake code and content-to-provider SQL count in the roadmap progress log. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex02d-one-test-store --type change --strict` and `pnpm spec:validate`.
