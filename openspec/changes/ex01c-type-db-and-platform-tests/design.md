## Context

The current checkout has independent source-test TypeScript projects for `db`, `platform-node` and `platform-cloudflare`. EX1A splits the large runtime suites, and EX2D lands the post-convergence test store. Plan implementation against the post-EX2D locations and responsibilities. See [EX2](../../../docs/extensibility-roadmap.md#step-ex2--shared-write-plans) and [architecture §20](../../../docs/architecture/workspace.md#20-testing-strategy).

## Goals / Non-Goals

Make repository and runtime tests compile against their real contracts and keep all runtime assertions meaningful. Persistence changes, additional driver abstractions, site-build behavior changes and EX1D work sit outside this session.

## Decisions

1. **Follow ownership after EX2D.** Use the checked-out manifests and `scripts/test-typecheck-baseline.json` as the inventory. For the suites left in `db`, type pure plans, guards, bindings and result fixtures using current `db` and application signatures. Keep DB-only fixtures package-local. Avoid making the DB suites depend back on a runtime adapter to obtain setup.
2. **Keep runtime harnesses explicit.** Reuse Node's `src/test-support/node-runtime-harness.ts` where test runtimes are opened through that harness, and Cloudflare's `src/test-support/d1-test-harness.ts` and `worker-harness.ts` for D1 and Worker cases. Type each driver's test doubles against the driver surface it actually uses. Keep temporary SQLite cleanup, per-case D1 isolation, tracked async work and the existing Worker query-budget assertions in place. A common fake driver would hide transaction and batch differences that these tests cover.
3. **Type transport input at its real boundary.** Use domain constructors and typed ports for valid data. Keep intentionally malformed settings, HTTP bodies, persisted values and driver failures in tests of runtime validation. Narrow unknown responses and log entries before asserting their shape. Where an invalid input deliberately bypasses the compile-time contract, contain any necessary assertion to that input and explain the case.
4. **Keep the cross-runtime proof executable.** Run the current DB and platform source suites, including the same shared repository contract cases against migrated file-backed and in-memory Node SQLite and local D1/Miniflare. Keep the existing security-contract suites in both platform test runs. The accepted [repository contracts](../../specs/content-repository-contracts/spec.md) govern behavior throughout this change.

## Risks / Trade-offs

- Manual inventories from the RC5 checkout can go stale before EX2D lands. Use package-level completion checks and the current locations to account for suites that were split, replaced or already typed.
- Broad casts of DB rows or Worker bindings would hide drift. Prefer typed fixtures, explicit mocks at external boundaries and narrowing of parsed values. Keep named errors, query counts and assertions about cleanup and committed effects.
