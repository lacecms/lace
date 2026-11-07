## Why

Roadmap step RF9 (test foundation), session RF9B. It follows RF9A and must
land before RF5. RF5 rewrites security ports and runtime composition, and the
tests that cover them should share typed fixtures rather than local copies.

An inventory (2026-11-07) found:

- **Actor fixtures.** Typed `admin`/`editor` actors are defined in three
  test-support modules: test-utils `test-support/fixtures.ts`, test-utils
  `repository-contract/shared.ts` and server `test-support/app-harness.ts`.
  Contracts has an unannotated `actor` in `rest-fixtures.ts`. About 30
  baselined (`@ts-nocheck`) test files define their own actors, many with
  plain-string ids.
- **Port fakes.** Typed full fakes exist in test-utils `adapters/fakes.ts`.
  The only partial fake in typed code, server `accountSecurity`, uses
  `as unknown as SecurityService`. Clock, id generator and logger literals
  repeat in 30, 9 and 8 files.
- **Branded ids.** Tests call the domain and application brand constructors.
  No test casts to a branded type, so the roadmap's "branded id fixtures"
  have nothing to replace. This change adds no id helper and records the
  correction.
- **Untyped `.mjs` helpers under `src/`.**
  - `platform-cloudflare/src/d1-test-harness.mjs` (123 lines, with a
    hand-written `.d.mts`) is imported by ten Cloudflare tests, root
    acceptance tests, the OAuth/MCP compatibility fixtures and an admin e2e
    backend.
  - `apps/api/src/worker-bundle-harness.mjs` (65 lines) serves two packaged
    tests.
  - The three CLI fixture modules move with the CLI layout in RF7C/RF9F.
- **Node runtime setup.** Four platform-node product tests and two packaged
  product tests repeat one sequence: temporary directory, migrate, settings
  from nine environment values, `createNodeRuntime` with the test actor
  resolver, content sync, fetch helper and teardown. `apps/api`
  `node-server.test.ts` repeats it twice, with its own MinIO environment
  copy.
- **`createTestActorResolver`.** It ships in the published
  `@lacecms/platform-node/test` subpath. Its only consumers are repository
  tests: `apps/api` `node-server.test.ts`, the two platform-node packaged
  product tests and the export-list test. Nothing in templates, docs,
  registry or scripts uses it. By the roadmap rule, it leaves the published
  package.
- **Turbo `test` inputs.** They include every `packages/*/src/**` and
  `packages/*/package.json`, because the old alias table ignored dependency
  edges. Any source edit invalidates every package's test cache.

## What Changes

- `@lacecms/test-utils` gains a typed `fixtures/` directory:
  - actor fixtures (`testActor(role, id?)`, frozen `admin`, `editor` and
    `viewer`, and a delegated-authority builder over `attenuateActor`);
  - `fakePort<Port>(name, members)`, a typed partial fake whose unimplemented
    members throw a named error when called;
  - silent logger and rate-limiter fakes.

  The three test-support actor copies and the server `accountSecurity` cast
  use them. Packages below test-utils in the graph (`content`, `domain`,
  `config`, `application`, `contracts`) cannot import it. They keep
  package-local typed test-support, and contracts annotates its `actor`.
- `d1-test-harness.mjs` and its `.d.mts` become
  `platform-cloudflare/src/test-support/d1-test-harness.ts`, written in
  erasable TypeScript. Plain-Node consumers (root `.mjs` tests, OAuth/MCP
  fixtures, admin e2e) import the `.ts` file through Node's built-in type
  stripping, available on the supported Node ≥ 24.12.
  `worker-bundle-harness.mjs` becomes `apps/api/src/test-support/worker-bundle-harness.ts`.
- New `platform-node/src/test-support/node-runtime-harness.ts`. It opens a
  migrated runtime with test settings, an optional actor, storage and
  content sync, and returns a typed fetch helper and an idempotent close. It
  also owns `createTestActorResolver` and the MinIO test environment. The
  four product tests, the two packaged product tests and `apps/api`
  `node-server.test.ts` use it.
- `@lacecms/platform-node/test` becomes a source-only export, with no
  compiled target and absent from the packed manifest.
  `src/test-actors.ts` is deleted. **Public change:** the published
  `@lacecms/platform-node` no longer exports `./test`. This is a CHANGELOG
  candidate.
- The boundary checker refuses non-test `.mjs` modules under a member's
  `src/`, except an explicit list. The list holds the production scripts
  (`minio-init.mjs`, `dev-bootstrap.mjs`, docs `catalog.mjs`, site
  `video-embed.browser.mjs`) and the three CLI fixture modules until RF9F.
- Turbo `test` hashes follow dependency edges through a transit task. The
  blanket `packages/*/src/**` and `packages/*/package.json` inputs go, and
  the registry, root config and site-fixture inputs move to the packages
  that read them.
- Non-goals: removing `@ts-nocheck` from baselined tests (RF9D–RF9F);
  rewriting their local actor and fake literals (they adopt the layer when
  typed); test size splits (RF9C); CLI helpers (RF7C/RF9F).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: adds *Test helpers are typed, shared and
  unpublished* and *Source test caching follows dependency edges*.

## Impact

- Architecture §6 (test-support convention) and *Source tests and packaged
  output*. No runtime behavior changes.
- Code:
  - `packages/test-utils/src/fixtures/*` and the test-utils entry and layout
    entry;
  - server `test-support/app-harness.ts`;
  - test-utils `test-support/fixtures.ts` and
    `repository-contract/shared.ts`;
  - contracts `test-support/rest-fixtures.ts`;
  - the platform-cloudflare harness move, with its ten tests and seven
    external importers;
  - the `apps/api` harness move;
  - the platform-node harness, four product tests, two packaged tests, the
    packaged export list and manifest;
  - `apps/api/src/node-server.test.ts`;
  - `scripts/check-boundaries.mjs` and its tests, `scripts/source-layout.json`
    and `turbo.json`.
- Public API: `@lacecms/platform-node/test` is removed from the published
  package. Listed in roadmap §5 item 9.
- Dependencies: RF9A (the `@lacecms/source` condition makes the source-only export
  possible). Followed by RF9C and RF5.
