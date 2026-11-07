## Why

`@lacecms/test-utils` holds the last seven entries of
`scripts/oversized-source-baseline.json` that RF4 owns:

| File | Lines |
|---|---:|
| `repository-contract/export.ts` | 3,139 |
| `in-memory-content-store.ts` | 1,518 |
| `repository-contract/builds.ts` | 1,489 |
| `repository-contract/sync.ts` | 1,250 |
| `repository-contract/envelope.ts` | 1,195 |
| `security-contract.ts` | 1,100 |
| `repository-contract/lifecycle.ts` | 1,044 |

The RF2C area files are not domains. For example, `export.ts` holds the build
export plus list/gallery/video migrations, internal links, collection queries,
media tags and import lookups. They are joined by the subdirectory barrel
`repository-contract/index.ts`, and the package has eight flat root modules.

The RF4X audit added two monolithic tests whose packages were already split:

- `test-utils/src/index.test.ts`: 3,560 lines, 54 listed titles;
- `config/src/index.test.ts`: 1,328 lines, 50 listed titles, beside 12
  `config` modules with no companions.

Both carry `@ts-nocheck`.

This is Session RF4F of `docs/refactoring-roadmap.md` (Step RF4), extended by
owner request on 2026-11-04 with:

- splitting both monolithic tests;
- typing the split companions under the RF4X rule;
- removing the barrel;
- declaring `test-utils` in `scripts/source-layout.json`.

It applies architecture §6, ADR 0020 and the RF4X guards.

## What Changes

### `test-utils` layout

`src/` keeps only the two package entries: `index.ts` and
`visibility-parity.ts` (the `./visibility-parity` subpath). Everything else
moves into domain directories:

| Directory | Contents |
|---|---|
| `shared/` | assertions, GIF fixtures |
| `adapters/` | deterministic infrastructure fakes |
| `delivery/` | build-export readers |
| `errors/` | error matrix |
| `visibility/` | the parity cases; the root subpath entry re-exports them, so contract modules no longer import a root entry |
| `store/` | the in-memory content store |
| `repository-contract/` | |
| `security-contract/` | |

The directory direction is declared in `scripts/source-layout.json` and in
the entry header.

### Repository contract by domain, order preserved

Each oversized area file is cut into **contiguous runs** of cases that share
one domain. Each run becomes a module under `repository-contract/`:

| Directory | Runs |
|---|---|
| `builds/` | dispatch, diagnostics |
| `entries/` | publication, publication failures, lifecycle, listing, envelope, globals-SEO, conditional |
| `sync/` | apply, evolution, block migrations, nested, projection-only, list migrations |
| `media/` | catalog, bulk reads, tags, import lookups |
| `links/` | projections, removal |
| `delivery/` | build export, queries |

- Fixtures shared across runs move into per-domain `fixtures.ts` modules.
- A non-barrel `repository-contract/registry.ts` concatenates the runs in the
  original sequence and exports `contentRepositoryContractCases`.
- `case-names.test.ts` keeps pinning all 106 names in order.

### Security contract by domain

`security-contract.ts` splits into contiguous runs under `security-contract/`:

- harness and helpers
- setup
- users and invitations
- passwords and sessions
- credentials
- rate limits

A `registry.ts` keeps the 17 case names in order. A new case-name test pins
them.

### In-memory store by domain

`InMemoryContentStore` keeps its name, its public methods and their bodies.
Its methods move verbatim into a linear class chain, one file per concern:

| Layer | Contents |
|---|---|
| `state` | fields and copies |
| `media` | media usage and catalog helpers |
| `sync` | configuration-sync reads and writes |
| `entries` | lifecycle commands, listing |
| `delivery` | public reads, build export |
| `in-memory-content-store.ts` | the final exported class with its `implements` list |

Helpers shared between layers become `protected`. Free functions move to
`store/support.ts`.

### Tests

Every listed title is preserved, and the companions are type-checked (owner
decision 2026-11-04).

- **`test-utils/src/index.test.ts`** splits into companions beside the store,
  adapter, assertion and delivery modules they exercise. The package identity
  case stays at the root.
- **`config/src/index.test.ts`** splits into companions beside `models/`,
  `structure/` and `configuration/`. `config/src/index.type-test.ts` moves
  beside the module it asserts.
- **Typing.** Removing the directive today reports 492 errors in the
  test-utils test and 208 in the config test. Most are:
  - partial fakes and loose fixture literals (TS2322/TS2741);
  - possibly-undefined indexing (TS2532/TS18048);
  - untyped callbacks (TS7006).

  Both entries leave `scripts/test-typecheck-baseline.json` (−2).

### Guards

- The seven `test-utils` entries leave
  `scripts/oversized-source-baseline.json`, which becomes 4 entries: admin
  ×2, platform ×2.
- `packages/test-utils` joins `scripts/source-layout.json`.
- No module in the package exceeds 1,000 lines.

## Non-goals

- Changing any contract case body, case name or registration order. The Node
  SQLite and D1 harnesses (`repository-contract.test.ts`,
  `security-contract.test.ts` in the platform packages) stay unchanged.
- Changing public exports of `@lacecms/test-utils` (`.` and
  `./visibility-parity`) or of `@lacecms/config`.
- Changing production code of other packages for typing. If a fix would need
  one, the session stops.
- A size limit for test files. Typing the remaining baselined tests of other
  packages.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). This is a behavior-preserving split. RF4X
`workspace-governance` already covers the layout, size and typecheck
baselines that this change shrinks.

## Impact

- **Roadmap.** Implements RF4F after RF4X. It precedes RF4G; the two share no
  files except the three guard baselines, which change in different entries.
- **Code.** `packages/test-utils/src/**` and `packages/config/src/**` tests
  only (no `config` production change). `scripts/oversized-source-baseline.json`,
  `scripts/test-typecheck-baseline.json` and `scripts/source-layout.json`.
- **Consumers.** Platform contract harnesses and admin import
  `@lacecms/test-utils` and `@lacecms/test-utils/visibility-parity`. These
  specifiers and export names stay identical.
- **Dependencies.** None added.
