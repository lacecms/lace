## 1. Architecture and execution

- [x] 1.1 Update architecture §9, §10 and §15–16 and amend ADR 0002 with the shared entry plan, typed admission, retained Node/D1 transaction boundaries and commit receipts. Check the runtime-delta table against the design and the D1 delta, including the remaining result-materialization difference and explicit composition limits.
- [x] 1.2 Add the ordered plan, typed guard outcome, result slots and affected-row/outbox metadata in `@lacecms/db`. Add the Node and D1 executors under each repository domain. Verify rejected admission, a successful multi-statement plan, rollback on exact-count or SQL failure, no persistent D1 tokens and positive outbox reporting only on commit. Verify that the SQL builders are available through the built `db` entry point and update its packaged-export assertion for the intended additions.

## 2. Entry and publication plans

- [x] 2.1 Route create, guarded duplicate and complete-draft save through shared `db` builders from both repository facades. Verify concurrent saves and singleton creation, stale duplicate source, missing or inactive media, preserved link/media projections and maximum-sized create/save through the shared contracts on Node and local D1. Confirm the D1 batch and bind ceilings on these paths.
- [x] 2.2 Share publication, unpublication and deletion statements, including the guarded and projected snapshot copies, routes, link-impact guards, published-state and build enqueue group, coalescing, idempotency and retention. Verify typed route and revision conflicts, replay and expiry, publication result parity, route-less publication, already-unpublished and stale-pointer cases, and rollback on actual SQL and deferred commit failures in the two repository contract suites. Verify stale revision takes precedence over invalid delivered links when admission races a save.
- [x] 2.3 Connect the executor's committed outbox result to the existing Worker registration. Verify enqueue, coalescing, zero-change guards, replay, draft-only commands, late failure and one post-commit `waitUntil` pass per request from Worker and D1 outbox tests. Verify that committed build payloads carry the same version as public state.

## 3. Explicit collection limits

- [x] 3.1 Make the application policy required and pass it through every real and test composition. Verify both runtimes advertise and enforce their existing limits, the application rejects missing policy and untrusted overrides, and direct repository queries enforce the runtime budget. Run the focused application, server and repository collection-query cases.

## 4. Verify the session

- [x] 4.1 Run the focused `db`, application, server and Worker suites and both complete repository contract suites using Node SQLite and actual local D1 (`pnpm --filter @lacecms/platform-node test src/repository-contract.test.ts` and `pnpm --filter @lacecms/platform-cloudflare test src/repository-contract.test.ts`). Verify unchanged public authorization, repository ports and wire contracts, and that new tests are typed and respect the source layout limits.
- [x] 4.2 Record the EX2A completion measurements in the roadmap progress log using the §3 write-path baseline. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex02a-shared-write-plans-entries --type change --strict` and `pnpm spec:validate`.
