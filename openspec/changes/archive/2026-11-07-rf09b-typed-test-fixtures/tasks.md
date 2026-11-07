## 1. Baseline

- [x] 1.1 Confirm RF9A is archived, then record in `verification.md`:
  - the inventory facts from the proposal, re-checked with `git grep` (actor
    copies, the casts in `app-harness.ts`, `.mjs` files under `src/`,
    importers of both harnesses and of `@lacecms/platform-node/test`);
  - per-member test counts from `pnpm test`;
  - the platform-node packed manifest exports;
  - `turbo run test --dry=json` task hashes.

  Verify the raw lists exist in the session scratchpad.

## 2. Fixture layer

- [x] 2.1 Add `test-utils/src/fixtures/actors.ts` and `fixtures/ports.ts`.
  Declare `fixtures` in `scripts/source-layout.json`, export both from the
  test-utils entry, and update its packaged export list (design D1). Verify
  with `fixtures/*.test.ts`:
  - role actors are frozen and typed;
  - `fakePort` throws `<name>.<key> is not implemented by this fake` for a
    missing member;
  - `then` and symbol reads return `undefined`;
  - an implemented member is called with its arguments.
- [x] 2.2 Replace the actor copies in test-utils `test-support/fixtures.ts`,
  `repository-contract/shared.ts` and server `test-support/app-harness.ts`.
  Rebuild `accountSecurity` on `fakePort`, removing both `SecurityService`
  casts. Annotate the contracts `rest-fixtures.ts` actor. Verify:
  - test-utils, server and contracts tests pass with baseline counts;
  - `git grep "as unknown as SecurityService"` and
    `git grep "as SecurityService"` in test-support find nothing.

## 3. Typed helper modules

- [x] 3.1 Move the D1 harness to
  `platform-cloudflare/src/test-support/d1-test-harness.ts`, delete the
  `.mjs` and `.d.mts`, and switch all importers (design D2). Add `.ts`
  importing to the compat fixture `tsconfig.json` if `compat:mcp:types`
  needs it. Verify that these pass:
  - platform-cloudflare tests;
  - `tests/durable-restart.test.mjs` (plain-Node child) and
    `tests/security-boundary.test.mjs`;
  - `pnpm compat:mcp`;
  - the admin `collection-queries.e2e.ts` spec.
- [x] 3.2 Move `worker-bundle-harness.mjs` to
  `apps/api/src/test-support/worker-bundle-harness.ts`. Verify that the
  `apps/api` `test:packaged` passes.
- [x] 3.3 Add the JavaScript-source rule and
  `scripts/javascript-source-allowlist.json` to the boundary checker
  (design D2). Verify:
  - `tests/boundaries.test.mjs` covers an unlisted `.mjs` failure and a
    stale-entry failure;
  - the workspace passes `node scripts/check-boundaries.mjs`.

## 4. Node runtime harness

- [x] 4.1 Add `platform-node/src/test-support/node-runtime-harness.ts`, with
  `createTestActorResolver`, `minioTestEnvironment` and
  `openNodeTestRuntime` (design D3), and its own `.test.ts`. The test moves
  the "refuses outside Vitest" case and shows that `close` is idempotent.
  Verify that the platform-node tests pass.
- [x] 4.2 Switch to the harness: the four product tests, the two packaged
  product tests (passing `../dist/index.js`) and `apps/api`
  `node-server.test.ts`. Verify:
  - each file's test titles and counts are unchanged;
  - `platform-node` `test` and `test:packaged` and `apps/api` `test` pass;
  - the packaged product tests import nothing from `src/` except the harness.
- [x] 4.3 Make `./test` source-only, delete `src/test-actors.ts`, and extend
  RF9A's strip and boundary rules (design D4). Verify:
  - the packaged export test asserts the subpath is absent and that the
    built import fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`;
  - `tests/release-artifacts.test.mjs` shows that the stripped platform-node
    exports equal the baseline without `./test`;
  - `tests/boundaries.test.mjs` refuses a source-only export outside
    `test-support`.

## 5. Turbo hashes

- [x] 5.1 Add the `test:transit` task, reset `test` inputs and move the
  registry, `lace.config.ts` and site-fixture inputs to package-scoped
  tasks (design D5). Verify with `turbo run test --dry=json` around scratch
  edits, each reverted:
  - an edit in `packages/content/src` changes the contracts hash;
  - an edit in `packages/cli/src` leaves the content hash unchanged;
  - an edit in `registry/` changes the astro hash;
  - an edit in `lace.config.ts` changes the `platform-cloudflare` and
    `apps/api` hashes.

## 6. Documentation and verification

- [x] 6.1 Update architecture §6 and *Source tests and packaged output*, and
  `DEVELOPMENT.md`, to cover:
  - the fixture layer and the rule for packages below test-utils;
  - the Node harness;
  - the JavaScript-source allowlist;
  - test caching through dependency edges.

  Add the `./test` removal to roadmap §5 item 9. Verify that the docs link
  and root-scripts tests pass.
- [x] 6.2 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test` and `pnpm openapi:check`, then run
  `pnpm exec openspec validate rf09b-typed-test-fixtures --type change
  --strict`. Record the results and deviations in `verification.md`, and
  update the roadmap progress row.
