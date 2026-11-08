# Verification — rf09b-typed-test-fixtures

## 1. Baseline (commit `ea2bf6c2`, RF9A archived)

Raw lists were kept in the session scratchpad (`inventory.txt`,
`hashes-before.txt`, `titles-before.txt`, `baseline-test.log`).

- Inventory, re-checked with `git grep`:
  - actor copies: test-utils `test-support/fixtures.ts` (`admin`, `editor`),
    test-utils `repository-contract/shared.ts` (frozen `editor`, `admin`),
    server `test-support/app-harness.ts` (`admin`, `editor`); contracts
    `rest-fixtures.ts` `actor` unannotated;
  - casts: `app-harness.ts` `security as SecurityService` (fixture input) and
    `as unknown as SecurityService` (`accountSecurity`);
  - non-test `.mjs` under `src/`: `apps/api/src/{dev-bootstrap,worker-bundle-harness}.mjs`,
    `apps/docs/src/catalog.mjs`, `apps/site/src/video-embed.browser.mjs`,
    `packages/cli/src/{import-api,import-fixtures,upgrade-fixtures}.mjs`,
    `packages/platform-cloudflare/src/d1-test-harness.mjs`,
    `packages/platform-node/src/minio-init.mjs`;
  - D1 harness importers: nine Cloudflare tests and `worker-harness.ts`,
    four `scripts/fixtures/oauth-mcp` files, `tests/d1-http-budgets.acceptance.mjs`,
    `tests/security-boundary.test.mjs`, `tests/support/{cross-runtime-fixture,durable-claim-child}.mjs`,
    `apps/admin/e2e/support/collection-query-backend.mjs`;
  - worker-bundle harness importers: the two `apps/api` packaged tests;
  - `@lacecms/platform-node/test` / `test-actors` importers: `apps/api`
    `node-server.test.ts`, four platform-node product tests, two packaged
    product tests and the packaged export test.
- Member test counts: as recorded after RF9A (application 18/139, app-api
  5/22, astro 7/80, cli 27/172, contracts 31/168, platform-cloudflare 14/219,
  platform-node 15/311, server 17/152, test-utils 15/148, admin 199/1009, …).
- Platform-node packed manifest exports: `.` and
  `./test` → `./dist/test-actors.{d.ts,js}` (pinned in
  `tests/fixtures/release-export-maps.json`).
- `turbo run test --dry=json`: 22 `test` task hashes recorded.

## 2. Implementation checks

- 2.1 `test-utils/src/fixtures/actors.ts` (`testActor`, frozen `admin`,
  `editor`, `viewer`, `delegatedActor`) and `fixtures/ports.ts` (`fakePort`,
  `silentLogger`, `allowAllRateLimiter`), declared as `fixtures` in
  `scripts/source-layout.json` (`store` and `repository-contract` may depend
  on it), exported from the entry; the packaged export list adds the eight
  names. `fixtures/{actors,ports}.test.ts` (7 tests): frozen typed role
  actors, a named `SecurityService.deleteSession is not implemented by this
  fake` error, `then`/symbol reads `undefined` (the fake is awaitable), an
  implemented member called with its arguments.
- 2.2 The three actor copies import the shared fixtures; server
  `importResolution` uses `delegatedActor(testActor(role, "admin"), …)`.
  `accountSecurity` and the fixture `security` option are built with
  `fakePort<SecurityService>`; the recorder infers each member's argument and
  result types from the port, so the two branded token results use
  `opaqueTokenSecret`. Contracts annotates `actor: Actor`. test-utils 155
  (148 + 7), server 152, contracts 168 pass. `git grep "as unknown as
  SecurityService"` and `"as SecurityService"` in test-support: none.
- 3.1 `platform-cloudflare/src/test-support/d1-test-harness.ts` replaces the
  `.mjs` and `.d.mts`, erasable syntax only, sibling modules imported for
  types only. TypeScript importers use `./test-support/d1-test-harness.js`;
  plain `.mjs` importers use the `.ts` path. Typing exposed two runtime
  details the old declaration hid: tests call `first(column)` and Better
  Auth's D1 adapter calls `raw()` on the counting binding, so both stay on
  the counted statement. Miniflare's declared R2/KV binding types do not name
  Lace's interfaces, so those two bindings are asserted once. Passed:
  platform-cloudflare 14/219; `tests/durable-restart.test.mjs` (plain-Node
  child via type stripping) and `tests/security-boundary.test.mjs`;
  `pnpm compat:mcp` (12 files, 228 tests); admin `collection-queries.e2e.ts`
  (4 Node and D1 cases).
- 3.2 `apps/api/src/test-support/worker-bundle-harness.ts` replaces the
  `.mjs`; `apps/api` `test:packaged` 4/4.
- 3.3 `scripts/javascript-source-allowlist.json` lists the seven remaining
  modules with reasons; the checker rejects an unlisted non-test `.mjs`/`.js`
  under `src/`, any JavaScript test-support module and a stale entry
  (`tests/boundaries.test.mjs`: one allowed and three rejected cases).
  `node scripts/check-boundaries.mjs` passes.
- 4.1 `platform-node/src/test-support/node-runtime-harness.ts`:
  `createTestActorResolver`, `minioTestEnvironment`, `openNodeTestRuntime`.
  Its test covers the moved "refuses outside Vitest" case and an idempotent
  `close` that removes the directory. platform-node 16/313.
- 4.2 The four product tests, the two packaged product tests (passing
  `../dist/index.js`) and `apps/api` `node-server.test.ts` (`fixture()` and
  the preflight test) open runtimes through the harness. `vitest list`
  titles are unchanged except the moved Vitest-guard test. platform-node
  `test` and `test:packaged` and `apps/api` `test` (5/21) pass; the packaged
  product tests import only the harness from `src/`.
- 4.3 `./test` is `{ "@lacecms/source": "./src/test-support/node-runtime-harness.ts" }`
  and `src/test-actors.ts` is deleted. `withoutSourceCondition` removes an
  export left without a target; the release test shows the stripped
  platform-node map equals the pinned map without `./test`. The packaged
  export test shows `import("@lacecms/platform-node/test")` from plain Node
  fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The boundary checker refuses a
  source-only export outside `src/test-support/`.
- 5.1 `test:transit` (`dependsOn: ["^test:transit"]`) feeds `test`; the
  blanket inputs are gone. Dry-run probes, each reverted:
  - `packages/content/src` edit: 20 `test` hashes change, including
    `@lacecms/contracts#test`;
  - `packages/cli/src` edit: only `@lacecms/cli#test` changes;
  - `registry/` file: only `@lacecms/astro#test` changes;
  - `lace.config.ts` edit: only `@lacecms/platform-cloudflare#test` and
    `@lacecms/app-api#test` change.
- 6.1 Architecture §6 and *Source tests and packaged output* and
  `DEVELOPMENT.md` cover the fixture layer, the Node harness, the
  JavaScript-source allowlist and dependency-edge caching. Roadmap §5 item 9
  already lists the `./test` removal. Docs link and root-scripts tests pass.

## 3. Final checks (6.2)

- Root `pnpm typecheck`: exit 0.
- `pnpm lint` (Oxlint, boundaries, admin colors, Drizzle schema): exit 0
  after removing two imports left unused by the actor replacement and one
  unused type import in the D1 harness.
- `pnpm format:check`: exit 0 (four new or edited files formatted).
- `pnpm openapi:check`: exit 0.
- `pnpm test`: 64 Turbo tasks successful; root suite 36 files, 340 tests
  (RF9A 335, plus four JavaScript-source and one source-only boundary case).
  Member counts: test-utils 155, platform-node 313 (+ 5 packaged),
  app-api 21 (+ 4 packaged), platform-cloudflare 219, server 152,
  contracts 168, admin 1009.
- `pnpm exec openspec validate rf09b-typed-test-fixtures --type change --strict`: valid.

## 4. Deviations

- The harness also returns `settings`, `sync(config?)` and
  `reopen(config)`, and accepts `actors` and `runtimeDefaults`:
  field-guidance reopens one database with a changed configuration, and
  `node-server.test.ts` keeps the runtime's own logger and rate limiter,
  its own resolver (test or anonymous) and its prepare/apply sync.
- TypeScript importers of the D1 harness keep the repository's `.js`
  specifier convention; only plain `.mjs` importers name the `.ts` file.
- A JavaScript module under `test-support/` is refused even when listed,
  since the requirement says shared helpers are TypeScript.
