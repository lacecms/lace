## Context

The inventory behind this change was made on 2026-11-07, after RF3G. It is
summarized in the proposal. Facts that shape the design:

- Dependency graph. `@lacecms/test-utils` depends on `application`,
  `config`, `content`, `contracts` and `domain`. `server`, both platforms,
  `mcp`, `cli`, `apps/api` and the admin list it as a development
  dependency. `db` does not, but may add it, because test-utils does not
  depend on `db`.
- Production actor model: `Actor`, `Role`, `attenuateActor` in
  `domain/src/access/actors.ts`, and `ActorId` in `domain/src/shared/brands.ts`.
- Typed fakes already in test-utils `adapters/fakes.ts`: clock, id
  generator, object storage, cache, site-build trigger, token hasher and
  dispatcher lease.
- `d1-test-harness.mjs` imports only Node built-ins and `miniflare`.
  `worker-bundle-harness.mjs` imports only Node built-ins.
- A prototype in the session scratchpad, deleted afterwards, showed that Node
  24.12.0 and 24.22.1 import an erasable `.ts` module from a plain `.mjs`
  without flags or warnings. The workspace `engines` field requires
  Node ≥ 24.12.0.
- Turbo 2.10.12. The `test` task has `dependsOn: []`, and its inputs add
  every package's sources and manifests.
- RF9A, which must be applied first, introduces the `@lacecms/source` condition,
  `withoutSourceCondition` and the boundary rule for `dist/` exports.

## Goals / Non-Goals

**Goals:** one typed fixture layer usable from every package above
test-utils; no type assertions in typed partial fakes; no untyped helper
modules under `src/`; one Node runtime harness that runs against source or
compiled output; no test-only code in published packages; precise test cache
keys.

**Non-Goals:** removing `@ts-nocheck` from the 137 baselined tests, and
rewriting their local literals (RF9D–RF9F); CLI fixture modules (RF7C/RF9F);
branded-id helpers (none are needed, per the inventory).

## Decisions

### D1. `test-utils/src/fixtures/`

New directory `fixtures`, declared in `scripts/source-layout.json` with no
dependencies. `repository-contract` and `store` may depend on it.

- `fixtures/actors.ts`:
  - `testActor(role: Role, id: string = role): Actor`;
  - frozen `admin`, `editor` and `viewer`;
  - `delegatedActor(base: Actor, authority)` over `attenuateActor`.
- `fixtures/ports.ts`:
  - `fakePort<Port extends object>(name: string, members: Partial<Port>): Port`.
    It returns a `Proxy` over a frozen copy of `members`. Reading a missing
    string key returns a function that throws
    `Error("<name>.<key> is not implemented by this fake")`. Symbol keys and
    `then` read as `undefined`, so `await`, equality and inspection behave.
    The single assertion lives inside `fakePort`, once.
  - `silentLogger` and `allowAllRateLimiter`, typed against their ports.

The test-utils entry exports these. `test-support/fixtures.ts` and
`repository-contract/shared.ts` re-import the actors instead of defining
them. Server `test-support/app-harness.ts` uses the actors and builds
`accountSecurity` with `fakePort<SecurityService>("SecurityService", …)`,
removing both `as SecurityService` casts. Contracts annotates its
`rest-fixtures.ts` actor as `Actor`, because contracts may not depend on
test-utils.

Rejected: putting fixtures in `domain` or `application`. Test code would ship
in production packages.

### D2. Typed helpers instead of `.mjs`

- `platform-cloudflare/src/d1-test-harness.mjs` and `.d.mts` become
  `src/test-support/d1-test-harness.ts`. The code is the same, with
  annotations taken from the `.d.mts` and only erasable syntax (no enums,
  parameter properties or namespaces). All importers switch to the new path
  with a `.ts` extension:
  - ten Cloudflare tests and `test-support/worker-harness.ts`;
  - `tests/security-boundary.test.mjs`, `tests/d1-http-budgets.acceptance.mjs`,
    `tests/support/durable-claim-child.mjs`,
    `tests/support/cross-runtime-fixture.mjs`;
  - four `scripts/fixtures/oauth-mcp/*` files;
  - `apps/admin/e2e/support/collection-query-backend.mjs`.

  Most importers run under Vitest or Playwright, which compile TypeScript
  themselves. `tests/support/durable-claim-child.mjs` runs as a plain Node
  child process of `tests/durable-restart.test.mjs`, so it depends on Node's
  type stripping. Its type imports from sibling modules (`cache`, `d1`,
  `r2-storage`) must use `import type`. Node erases those, but it does not map
  a runtime `.js` specifier onto a `.ts` file, so the harness imports no
  sibling source module at runtime. It needs none today.
- `apps/api/src/worker-bundle-harness.mjs` becomes
  `src/test-support/worker-bundle-harness.ts`. Its two packaged tests run
  under Vitest, which compiles it.
- The boundary checker gains a JavaScript-source rule. Under each member's
  `src/`, every `.mjs` or `.js` file that is not a test and not under
  `test-support` must appear in `scripts/javascript-source-allowlist.json`.
  The list names each file with a reason: `platform-node/src/minio-init.mjs`,
  `apps/api/src/dev-bootstrap.mjs`, `apps/docs/src/catalog.mjs`,
  `apps/site/src/video-embed.browser.mjs`, and
  `cli/src/{import-fixtures,upgrade-fixtures,import-api}.mjs` until RF9F.
  Stale entries fail, as in the other baselines.

### D3. Node runtime harness

`platform-node/src/test-support/node-runtime-harness.ts` exports:

- `createTestActorResolver(actor)`, moved with its Vitest-only guard.
- `minioTestEnvironment`, one copy instead of two.
- `openNodeTestRuntime(platform, options)`:
  - `platform` is the subset
    `{ createNodeRuntime, migrateNodeDatabase, parseNodeRuntimeSettings, runLocalContentSync }`,
    typed as `Pick<typeof import("../index.js"), …>`. Source tests pass the
    source entry and packaged tests pass `../dist/index.js`.
  - `options`: `{ config, actor?, storage?, sync?: boolean, settings?: Record<string, string> }`.
  - It returns `{ runtime, directory, request(path, init?), close() }`, and
    `close` is idempotent. It also registers `onTestFinished(close)`, so
    callers do not need `try/finally`.

The four product tests (`form-layout`, `media-gif`, `field-guidance`,
`list-layout`), the two packaged product tests (`internal-links`,
`rich-text`) and `apps/api` `node-server.test.ts` (`fixture()` and its
inline copy, `minioEnvironment`) use it. The baselined files keep
`@ts-nocheck`, and only their setup code changes. `index.test.ts`,
`migrate.test.ts` and the contract suites open databases without a runtime.
They stay as they are and are typed in RF9E.

### D4. The test subpath becomes source-only

`packages/platform-node/package.json` gets
`"./test": { "@lacecms/source": "./src/test-support/node-runtime-harness.ts" }`.
`src/test-actors.ts` is deleted.

- RF9A's `withoutSourceCondition` is extended: an export left empty after
  stripping is removed. The packed manifest therefore lacks `./test`.
- RF9A's boundary rule is extended: a source-only export is allowed only when
  its target is under `src/test-support/`.
- The packaged export test asserts that the subpath is absent, and that
  importing it from the built package fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- `apps/api` keeps importing `@lacecms/platform-node/test`, which resolves to
  source through the condition. The "refuses outside Vitest" test moves to
  `platform-node/src/test-support/node-runtime-harness.test.ts`, beside its
  module.

Rejected: moving the harness into test-utils. test-utils would then depend on
`platform-node`, and platform-node depends on test-utils, which is a cycle.

### D5. Turbo transit for test hashes

`turbo.json`:

```json
"test:transit": { "dependsOn": ["^test:transit"] },
"test": { "dependsOn": ["test:transit"], "outputs": [] }
```

`test:transit` has no script, so Turbo runs nothing for it. It hashes the
package's files and its dependencies' transit hashes, which is the documented
transit-node pattern. The `test` inputs return to `$TURBO_DEFAULT$`. Inputs
outside members move to package-scoped entries:

- `@lacecms/astro#test`: `registry/**` and `apps/site/src/fixtures/**`;
- `@lacecms/platform-cloudflare#test` and `@lacecms/app-api#test`:
  `lace.config.ts`.

`globalDependencies: ["vitest.shared.mjs"]` stays. Verification compares
`turbo run test --dry=json` hashes before and after a scratch edit in
`content`, `cli` and `registry`, reverted afterwards.

## Risks / Trade-offs

- [Type stripping semantics] → only erasable syntax and type-only sibling
  imports. `tests/durable-restart.test.mjs` exercises the plain-Node path.
  `pnpm compat:mcp` and the admin e2e collection-query spec exercise the
  compiled paths.
- [A missed input makes a stale cache pass] → the dry-run hash checks cover
  each moved input. A test that reads another repository path must declare
  it in the same change.
- [Public subpath removal] → no known consumer outside the repository. It is
  listed as a CHANGELOG candidate.
- [`Proxy` fakes surprise test frameworks] → symbols and `then` are excluded,
  and the server suites exercise the security fake.
