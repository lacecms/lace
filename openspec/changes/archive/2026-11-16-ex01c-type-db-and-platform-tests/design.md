## Context

Each target package has a `tsconfig.test.json` that includes source tests and test-support. EX1A split the large runtime suites. EX2C already typed `platform-cloudflare/src/d1-sync-batch.test.ts`. EX2D moved the Node content repository and transaction executor into `@lacecms/db/node`, and the Node platform still owns connection lifecycle and runtime composition. The migrated `@lacecms/test-utils/sqlite` fixture serves the in-memory Node contract target. See [EX2D](../2026-11-16-ex02d-one-test-store/) and [architecture §20](../../../../docs/architecture/workspace.md#20-testing-strategy).

## Goals / Non-Goals

Make the remaining repository and runtime tests compile against their real contracts and preserve their runtime assertions.

## Decisions

1. **Type each suite at its current owner.** Use the checked-out baseline for migration. In `db`, use the current application inputs, SQL statement and binding types, and actual SQLite fixtures for reader, write and migration cases. Keep DB fixtures package-local to preserve dependency direction. Already-typed shared-plan and Node executor cases run as part of the package suite.
2. **Reuse the separate runtime harnesses.** Use Node's `src/test-support/node-runtime-harness.ts` for product runtimes. Keep the file-backed repository contract on the Node platform's database lifecycle and the in-memory variant on `@lacecms/test-utils/sqlite`. Use Cloudflare's `src/test-support/d1-test-harness.ts` and `worker-harness.ts` for local D1 and Worker cases. Keep per-case database isolation, cleanup, tracked async work and instrumented D1 statement, bind and query counts.
3. **Type input at its real boundary.** Use domain constructors, typed ports and driver-specific test doubles. Preserve intentionally malformed settings, HTTP bodies, persisted values and injected driver failures. Narrow unknown rows, responses and log entries before accessing their fields. Contain any necessary assertion to the deliberately invalid value and document the expected validation failure.
4. **Retire the baseline when it is empty.** Remove the matching directive and path together. Once all workspace entries are retired, delete the file and verify the existing boundary checker accepts the absent baseline. Keep the contributor guide's reference to the baseline as the legacy inventory and document the empty-baseline behavior.

## Risks / Trade-offs

- A broad cast can mask drift in driver rows, Worker bindings or contract harnesses. Use the same repository cases and failure injection hooks on all three targets and run both platform security suites. The [accepted repository contracts](../../../specs/content-repository-contracts/spec.md) define lifecycle and rollback coverage.
