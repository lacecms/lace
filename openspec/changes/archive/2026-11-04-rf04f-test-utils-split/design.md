## Context

See proposal.md (Why). Measured at commit `ea198c38`.

**test-utils layout.**

- `packages/test-utils/src` has eight flat root production modules:
  - `adapters.ts` (208)
  - `assertions.ts` (60)
  - `build-export.ts` (144)
  - `error-matrix.ts` (461)
  - `gif.ts` (109)
  - `in-memory-content-store.ts` (1,518)
  - `security-contract.ts` (1,100)
  - `visibility-parity.ts` (152), the `./visibility-parity` subpath entry
- It also has `index.ts` (10 lines) and the `repository-contract/` directory.
  That directory has nine modules and the barrel `index.ts`, which
  concatenates `cases` arrays from area modules in a fixed order.

**Repository contract.**

- `case-names.test.ts` pins the 106 registered names in order.
- Area modules share fixtures across files:
  - `lifecycleState`, `unpublishCommand`, `revertCommand`, `changedPost` and
    `seedPublishedLifecycle` from `lifecycle.ts`;
  - `metadataUpdate`, `pendingBuilds` and `mediaMetadataState` from `media.ts`;
  - `evolvingPosts`, `seedEvolvingEntries`, `block`, `noteV1`, `noteV3`,
    `note`, `prepareNotes` and `syncNotes` from `sync.ts`;
  - `envelopeBlock` and `blockReference` from `envelope.ts`;
  - `globalEntry` and `seoReference` from `globals-seo.ts`.
- `repository-contract/conditional.ts` imports the root
  `visibility-parity.ts`. `security-contract.ts` imports the `ContractSql`
  type through the barrel.

**Domain runs.** Each area file's cases fall into contiguous runs by domain:

| File | Run (case numbers) | Domain |
|---|---|---|
| `builds.ts` | 1–9 | build dispatch, outbox and media deletion |
| | 10–13 | sync apply |
| | 14–21 | draft persistence and publication |
| `lifecycle.ts` | 1–7 | unpublish, revert, duplicate, delete |
| | 8–9 | entry and media listing |
| | 10 | build diagnostics |
| | 11–12 | publication rollback after SQL faults |
| | 13 | bulk media reads |
| `sync.ts` | 1–10 | model evolution and hints |
| | 11–15 | block migrations |
| `envelope.ts` | 1–4 | block envelopes and composites |
| | 5–9 | nested synchronization |
| | 10–11 | projection-only sync |
| `export.ts` | 1–3 | build export |
| | 4–8 | list, gallery and video migrations |
| | 9–15 | internal links |
| | 16–21 | public query identity and collection queries |
| | 22–24 | media tags |
| | 25–26 | import lookups |

`media.ts`, `globals-seo.ts` and `conditional.ts` are each one domain.

**Security contract.** `security-contract.ts` holds 17 cases in contiguous
runs, plus harness types and helpers:

| Cases | Domain |
|---|---|
| 1–4 | setup |
| 5–8 | user management and invitations |
| 9–12 | password resets, password changes, sessions, disable |
| 13–15 | build and import credentials, account events |
| 16–17 | fixed-window limits |

**In-memory store.**

- One class, `InMemoryContentStore` (lines 319–1518), plus 15 free functions.
- Its methods group as:
  - configuration sync (346–747);
  - entry lifecycle and listing (748–1004);
  - public delivery (1005–1089);
  - media (1090–1283);
  - build export (1284–1330);
  - private helpers (1331–1518).
- Private helpers `mediaUsage`, `assertActiveReferences`, `catalogItem`,
  `summarize` and `cursorOffset` are called from several groups.

**Tests.**

- `test-utils/src/index.test.ts`: 3,560 lines, 54 titles.
- `config/src/index.test.ts`: 1,328 lines, 50 listed titles.
- `config/src/index.type-test.ts`: 257 lines.
- Removing `@ts-nocheck` reports 492 errors in the test-utils test (240 of
  them TS2322) and 208 in the config test (118 of them TS2532).

## Goals / Non-Goals

**Goals:**

- No `test-utils` file in `scripts/oversized-source-baseline.json`, and no
  module over 1,000 lines. Runs aim for at most about 700 lines; the
  internal-links run (about 1,100 lines) splits into two contiguous runs.
- `test-utils` passes the RF4X layout check: an entry-only root, declared
  directory direction, no barrels and no cycles.
- Identical registration order, case names, public exports and listed test
  titles. Both runtime contract suites stay unchanged.
- Both monolithic tests become typed companions beside their modules.

**Non-Goals:** see proposal.

## Decisions

### 1. Repository contract: contiguous domain runs and an explicit registry

Each run moves verbatim into one module:

| Module | Run |
|---|---|
| `builds/dispatch.ts` | builds 1–9 |
| `builds/diagnostics.ts` | lifecycle 10 |
| `sync/apply.ts` | builds 10–13 |
| `sync/evolution.ts` | sync 1–10 |
| `sync/block-migrations.ts` | sync 11–15 |
| `sync/nested.ts` | envelope 5–9 |
| `sync/projection-only.ts` | envelope 10–11 |
| `sync/list-migrations.ts` | export 4–8 |
| `entries/publication.ts` | builds 14–21 |
| `entries/publication-failures.ts` | lifecycle 11–12 |
| `entries/lifecycle.ts` | lifecycle 1–7 |
| `entries/listing.ts` | lifecycle 8–9 |
| `entries/envelope.ts` | envelope 1–4 |
| `entries/globals-seo.ts` | `git mv` |
| `entries/conditional.ts` | `git mv` |
| `media/catalog.ts` | `git mv media.ts` |
| `media/bulk-reads.ts` | lifecycle 13 |
| `media/tags.ts` | export 22–24 |
| `media/import-lookups.ts` | export 25–26 |
| `links/projections.ts` | export 9–11 |
| `links/removal.ts` | export 12–15 |
| `delivery/build-export.ts` | export 1–3 |
| `delivery/queries.ts` | export 16–21 |

**Fixtures.**

- Fixtures used by more than one run move to `entries/fixtures.ts`,
  `sync/fixtures.ts` and `media/fixtures.ts`.
- `shared.ts` keeps the harness types, checkpoints and cross-domain helpers,
  and gains no new content.
- Each run module calls `registerContract` on its own exported `cases` array,
  as today.

**Registry.**

- `repository-contract/registry.ts` imports the 23 run modules and concatenates
  them in the original sequence (builds 1–9, sync apply, publication, …,
  conditional) into the frozen `contentRepositoryContractCases`.
- `case-names.test.ts` imports from `registry.ts` and keeps its 106-name list
  unchanged. A misplaced run fails it.
- The barrel `index.ts` is deleted. The package entry imports `registry.ts`,
  `shared.ts` (types and checkpoint constants) and `media/catalog.ts`
  (`MEDIA_METADATA_CHECKPOINTS`) explicitly.

**Direction inside `repository-contract/`:** `shared.ts` ← domain fixtures ←
runs ← `registry.ts`. A run may import another domain's `fixtures.ts`, but
never another run module.

*Alternatives:*

- Group all cases of a domain in one module and reorder the registry by a
  name list. Rejected: registration order is part of both runtime suites and
  is pinned; a name-sorted registry would add a second source of truth.
- Keep area files and only cut them by size. Rejected: §6 requires domain
  ownership, and the audit found the area names misleading.

### 2. Security contract

`security-contract/` holds:

| Module | Contents |
|---|---|
| `harness.ts` | `SecurityContractHarness`, `SecurityContractRuntime`, `SecurityContractCase`, `SECURITY_CONTRACT_EPOCH`, `createUserByInvitation` and the private helpers |
| `setup.ts` | setup run |
| `users.ts` | users and invitations run |
| `passwords-sessions.ts` | passwords and sessions run |
| `credentials.ts` | credentials run |
| `rate-limits.ts` | rate-limit run |
| `registry.ts` | exports the frozen `securityContractCases` in the original order |

- Each run exports `readonly SecurityContractCase[]` literals moved verbatim.
- `ContractSql` is imported from `repository-contract/shared.ts`.
- A new `security-contract/case-names.test.ts` pins the 17 names. It is the
  only new test and has no runtime effect.

### 3. In-memory store: a linear class chain with verbatim bodies

Method bodies move unchanged into a chain of classes, one module each:

| Module | Contents |
|---|---|
| `store/support.ts` | the free functions and constants |
| `store/state.ts` | `InMemoryContentStoreState`: constructor, fields, `setStoredModelStates`, `storedModelStates`, the shared private helpers made `protected` |
| `store/media.ts` | media methods |
| `store/sync.ts` | configuration-sync methods |
| `store/entries.ts` | lifecycle and listing methods |
| `store/delivery.ts` | public reads and `exportBuildContentPage` |
| `store/in-memory-content-store.ts` | `export class InMemoryContentStore extends …Delivery implements` (the existing interface list), with no new members |

- The shared private helpers made `protected` in `state.ts` are `mediaUsage`,
  `assertActiveReferences`, `catalogItem`, `summarize`, `cursorOffset`,
  `actorSummary` and `publicationIdempotencyMapKey`.
- The chain order follows the call graph, so a layer calls only its own or
  earlier layers' methods.
- If a method needs a later layer, it moves to the earliest layer that has
  every callee. If that is impossible, the callee is declared `protected
  abstract` on the earlier layer and implemented later. Both forms keep the
  bodies verbatim.
- The entry exports only `InMemoryContentStore`. Intermediate classes stay
  module-internal, so the declaration export names are unchanged. Their
  members become `protected` instead of `private`, which is visible only in
  declaration text.

*Alternatives:*

- Free functions over a state object. Rejected: every `this.x` in about 1,200
  lines would be rewritten, which is not a verifiable move.
- Keep the class whole and move only helpers. Rejected: about 1,150 lines
  remain, above the ceiling.

### 4. Remaining root modules

| Destination | Source |
|---|---|
| `shared/assertions.ts` | `git mv` |
| `shared/gif.ts` | `git mv` |
| `adapters/fakes.ts` | `git mv adapters.ts` |
| `delivery/build-export.ts` | `git mv` |
| `errors/error-matrix.ts` | `git mv` |
| `visibility/parity-cases.ts` | `visibility-parity.ts` content |

- The root `visibility-parity.ts` becomes the subpath entry:
  `export * from "./visibility/parity-cases.js"`.
- Contract modules import `visibility/parity-cases.ts`.
- Tests move with their modules: `error-matrix.test.ts` and `errors.test.ts`
  to `errors/`, `visibility-parity.test.ts` to `visibility/`.
- `contract-sources.test.ts` and `route-parity.test.ts` stay at the root as
  package-level tests.

**Directory direction:**
`shared ← adapters, delivery, errors, visibility ← store ← repository-contract,
security-contract`. The declaration records the measured edges; an edge
against this order stops implementation for a design update.

### 5. Test splits and typing

**test-utils.** The 54 titles of `src/index.test.ts` move to companions by the
module they exercise:

| Companion | Titles |
|---|---|
| `shared/assertions.test.ts` | checkpoint and query-plan helpers |
| `adapters/fakes.test.ts` | deterministic fakes, dispatcher leases |
| `store/media.test.ts` | media byte policy, creation, binaries, deletion, usage, metadata, draft detaching |
| `store/sync.test.ts` | prepared plans, renames, SEO, nested and query-only sync, CE9A |
| `store/entries.test.ts` | lifecycle, global singleton, unpublish, revert, duplicate, listing, envelopes, SEO fingerprints, conditional projection |
| `store/delivery.test.ts` | public reads, build-export paging, rejected builds |

The identity case stays in `src/index.test.ts`. Shared setup moves to
`src/test-support/` as typed helpers.

**config.**

| Companion | Titles |
|---|---|
| `models/define.test.ts` | metadata, globals, routes, keys |
| `models/fields.test.ts` | composites, item labels, placeholders, layouts, visibility |
| `models/list-options.test.ts` | listOptions and list fields |
| `models/seo.test.ts` | SEO options and defaults |
| `structure/canonical.test.ts` | hashes, projections, hints, structure identity |
| `configuration/define-config.test.ts` | registry, starter expansion, root fixture snapshot |

- The identity case stays in `src/index.test.ts`.
- `index.type-test.ts` moves beside the module whose types it asserts, and
  stays in `typecheck`.
- A test asserting several modules goes beside the module named first in its
  title.
- The existing `__snapshots__` move with their test, and are compared, not
  rewritten.

**Typing rules.**

- Typed fixture builders live in each package's `src/test-support/`, which is
  always checked.
- Partial port fakes use `Pick<Port, …>` or full typed fakes from `adapters/`.
- Deliberately malformed inputs pass through `unknown` with a comment naming
  the invariant.
- Possibly-undefined reads use explicit assertions (`expect(x).toBeDefined()`
  plus a narrowed local) rather than non-null assertions.
- No production signature changes. If one is needed, implementation stops for
  a design update.

### 6. Verification baseline

Recorded before moving anything:

- the runtime keys of `dist/index.js` and `dist/visibility-parity.js`;
- the declaration export names of both declaration entries;
- `vitest list` titles of `test-utils`, `config`, `platform-node` and
  `platform-cloudflare` (the contract harness titles include case names);
- the 106 and 17 contract names.

After the move, all must be identical except one new listed title (the
security case-name pin). Node SQLite and D1 contract suites run from source
on both runtimes.

## Risks / Trade-offs

- **[Class chain changes `private` to `protected`.]** This is visible in
  declaration text only; consumers use the exported class. The declaration
  export-name comparison stays exact.
- **[A run module needs a fixture from another run.]** → Move it to that
  domain's `fixtures.ts`. A run-to-run import breaks the registry-only
  dependency rule, and the layout check plus review catch it.
- **[Typing 700 errors uncovers a test passing for the wrong reason.]** → Fix
  the fixture, keep the title and assertion intent, and record it in
  verification. If the meaning would change, stop.
- **[Session size.]** About 9,000 moved lines plus 700 type fixes is the
  largest RF4 session. Tasks are ordered so each group ends green, and typing
  is its own task group, so it can pause without leaving a broken tree.

## Migration Plan

Repository-only refactor; rollback is a revert. After this session:

- the oversized baseline has 4 entries (admin ×2, platform ×2: RF5/RF6);
- the typecheck baseline shrinks by 2.
