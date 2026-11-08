## Context

- See proposal.md *Why*. Observed read-side differences between the two
  repositories, method by method:
  - Execution: Node `this.connection.prepare(sql).all(...)` / `.get(...)`,
    synchronous; D1 `await this.all(sql, ...)` / `await this.first(sql, ...)`,
    where `all`/`first` bind `undefined` as `null`.
  - Chunking: Node `SQLITE_BIND_CHUNK = 200`; D1 `D1_MAX_BOUND_PARAMETERS =
    100` (`describeActors`, `loadMediaMany`, `publicMedia`,
    `loadSnapshots`).
  - Otherwise identical text: `listMedia`, `listMediaTags`,
    `loadMediaCatalogItem`, `loadMediaUsage`, `describeActors`,
    `listPublic`, `loadPublic`, `loadPublicGlobal`, `publishedContentVersion`,
    `loadPublicMedia`, `loadMedia`, `loadMediaMany`, `loadDeletingMedia`,
    `listSiteBuilds`, `getSiteBuild`, `load`, `loadDraft`, `loadPublished`,
    and the private `entryRow`, `loadEntry`, `hydrate`, `loadSnapshots`,
    `publicMedia`. Every `.get`/`first` statement is `limit 1`, a primary-key
    lookup or the `published_state` singleton.
  - Different by design: `exportBuildContentPage` (Node: one
    `connection.transaction` reading version, candidates and five ranged
    sets; D1: two `database.batch` calls with a version re-read), `list`
    (Node binds an object of numbered parameters and uses
    `NODE_LIST_QUERY_LIMITS`; D1 binds positionally with
    `CLOUDFLARE_LIST_QUERY_LIMITS`) and the configuration-sync reads (D1
    reads the state together with its guard JSON).
- Reads inside writes: Node publication and unpublication reload the
  committed entry with the synchronous `loadEntry` inside their
  better-sqlite3 transaction (which cannot await), and create, save, revert
  and delete use `entryRow`/`loadEntry` around their transactions. D1 write
  paths await `loadEntry`, `entryRow` and `loadMedia`. Media writes on both
  runtimes await `loadMedia`.
- Specs that constrain the move: `node-content-repositories` "Node
  build-export pages read one consistent snapshot" (one read transaction per
  page) and `d1-content-repositories` "D1 build-export pages use bounded
  batched reads" (at most two batches, at most twelve statements, at most 100
  bound parameters). D1 statement budgets are pinned by
  `d1-content-repository.test.ts` and `tests/d1-http-budgets.acceptance.mjs`
  through `countingD1`.
- Layout state: neither platform package is in `scripts/source-layout.json`;
  `platform-node` has the cycle `content-repository.ts` → `index.ts`
  (`NodeDatabase` type) → `runtime.ts` → `index.ts` (`openNodeDatabase`);
  `migrate.ts` imports `migrateNodeDatabase` from `index.ts`. RF5A already
  created `src/security/` in both packages. Only
  `image-inspector-pass-through.test.ts` imports a module other than the
  package entry or `test-support/`.
- Path readers outside the packages: `dist/migrate.js` (Compose files,
  generated-project template, `scripts/release-images.mjs`, frozen template
  fixtures, `migration-executable.packaged.test.mjs`); `src/minio-init.mjs`
  (Compose, release images, `make-api-runtime.mjs`); `dist/oauth.js` and
  `dist/security.js` / `dist/d1-security.js`
  (`scripts/fixtures/oauth-mcp/compat.test.mjs`, `baseline.mjs`);
  `src/release-version.ts`, written by `scripts/platform-release-version.mjs`
  for both platforms and asserted by two root tests.

## Goals / Non-Goals

**Goals:** one implementation of every identical read; a repository's
public read method is a one-line delegation; observable results, SQL text,
statement counts per D1 request and Node transaction scope are unchanged;
both platform packages are declared in the layout with no cycle and no
module over 1,000 lines; platform export lists unchanged.

**Non-Goals:** sharing any write path or the write-side helpers; removing
the Node synchronous loader (RF5C's publication return-path alignment
decides whether in-transaction reloads remain); moving package-level test
suites; changing `createLaceApp` inputs.

## Decisions

### D1. `SqlContentReader` in a new `db` directory `reads/`

```ts
export interface SqlReadStatement { readonly sql: string; readonly params: readonly unknown[] }
export interface ContentReadSql extends LinkReadSql {
  /** Largest identifier group bound into one `in (...)` list. */
  readonly bindChunk: number;
  /** Runs `first`, then the statements `next` derives from its rows, as one consistent read. */
  readGroups(
    first: readonly SqlReadStatement[],
    next: (rows: readonly (readonly unknown[])[]) => readonly SqlReadStatement[],
  ): Promise<readonly [readonly (readonly unknown[])[], readonly (readonly unknown[])[]]>;
}
export class SqlContentReader implements ContentLinkReadPort, … {
  constructor(sql: ContentReadSql, resolveModel: ContentModelResolver)
}
```

The class implements the read members of `ContentEntryReadPort` (without
`list`), `PublicContentReadPort`, `MediaReadPort`, `MediaListPort`,
`MediaCatalogPort`, `SiteBuildReadPort`, `ContentLinkReadPort` (delegating to
an internal `SqlContentLinkReader` over the same `all`) and
`loadDeletingMedia`. Method bodies are the existing ones with
`this.connection.prepare(s).all(...p)` / `await this.all(s, ...p)` →
`await this.sql.all(s, ...p)`, `get`/`first` → a private
`first(s, ...p)` returning `(await this.sql.all(s, ...p))[0]`, and the chunk
constant → `this.sql.bindChunk`. `loadEntry` stays public on the reader
(`load` already returns it; write paths call it). Owned only here: the
`hydrate`, `loadSnapshots` and `publicMedia` helpers.

`reads` depends on `builds`, `content`, `delivery`, `links`, `media` and
`shared`; nothing depends on it. The `db` entry header and
`scripts/source-layout.json` gain the directory; the entry adds
`export * from "./reads/content-reader.js"`.

Rejected: placing the reader in `links/` beside `SqlContentLinkReader` (would
make `links` depend on `builds`, `delivery` and `media`, reversing today's
direction); in `builds/` (the export is one of twenty reads); a synchronous
reader generic over the execution mode (D1 cannot be synchronous, and two
signatures per method doubles the surface the move is meant to halve); an
additional `first` capability (every single-row statement is bounded, so
`all(...)[0]` returns the same row and keeps the capability at the roadmap's
`{ all }` plus chunk).

### D2. Build export runs one protocol with runtime atomicity

The shared `exportBuildContentPage` is the D1 sequence: group one reads the
version (`BUILD_EXPORT_FIRST_PAGE_VERSION_SQL` or `BUILD_EXPORT_VERSION_SQL`)
and `BUILD_EXPORT_CANDIDATES_SQL`; `next` asserts the cursor version,
computes the range and returns group two — version, routes, snapshots,
blocks, media and, on the first page, globals; the reader asserts the
re-read version and assembles the page with `expected`. `readGroups` is:

- Node: `connection.transaction(() => { a = first.map(all); b = next(a).map(all); return [a, b] })()`.
  One SQLite read transaction covers both groups, as the Node requirement
  demands; a version failure thrown by `next` ends the transaction before
  group two, as today. The only difference from today is one additional
  `select version` inside the same transaction (always equal) and the order
  of the five ranged reads, neither observable. `index.test.ts` bounds the
  page's statements at 8 instead of 7; the bound stays independent of the
  entry count, which is what the test guards.
- D1: `database.batch(first)` then `database.batch(next(rows))`, binding as
  `bind()` does today. Batches, statement count and order are identical.

Rejected: keeping `exportBuildContentPage` per runtime (it is the largest
read and the roadmap lists it); an async callback inside a manual
`BEGIN`/`COMMIT` on Node (other requests on the shared connection could
interleave statements into the read transaction); running the two groups as
two Node transactions (would add a mid-page `BUILD_EXPORT_VERSION_CHANGED`
that the Node requirement excludes).

### D3. Repositories delegate; write side splits into area classes over a base

Per platform, `src/repository/`:

| Module | Node | D1 |
| --- | --- | --- |
| `sql.ts` | `nodeContentReadSql(connection)`: `all`, `bindChunk` 200 (`SQLITE_BIND_CHUNK`), `readGroups` | `d1ContentReadSql(database)`: `all`, `bindChunk` `D1_MAX_BOUND_PARAMETERS`, `readGroups`; `bind` |
| `base.ts` | abstract `NodeRepositoryBase(connection, resolveModel, options, reader)` and `NodeRepositoryOptions`: protected `entryRow`, synchronous `loadEntry`/`hydrate`/`loadSnapshots` (in-transaction reloads only), `loadMedia` → reader, `insertSnapshot`, `insertBlocks`, `insertReferences`, `checkLinkRemoval`, `replaceInternalLinks`, `bumpLinkGraph`, `bumpPublicState`, `enqueueSiteBuild`, `checkpoint`, `nextId`, `throwWriteError` | `batch.ts`: `MutationBatch`, `Condition`, `numberedValues`, `rowsPerStatement` and the guard SQL constants; `base.ts`: abstract `D1RepositoryBase(database, resolveModel, options, reader)` and `D1RepositoryOptions`: protected `batch`, `guard`, `releaseGuard`, `execute`, `all`, `first`, `run`, `nextId`, `entryRow`, `loadMedia` → reader (write paths call `this.reader.loadEntry`), `checkLinkRemoval`, `addInternalLinkDiff`, `addSnapshotInsert`, `addBlockInserts`, `addReferenceInserts`, `addPublicStateBump`, `addSiteBuildEnqueue`, `queueReceipt`, `stateVersion` |
| `collection-list.ts` | — (the composite keeps `list`, which needs only the connection) | `D1CollectionList`: `list` (needs the base's `all`/`first`) |
| `configuration-sync.ts` | `ConfigurationSyncStateReadPort` + `ConfigurationSyncApplyPort`, `readConfigurationSyncStateNow`, `SQLITE_MIGRATION_PARAMETERS` | same ports, `readSyncState` |
| `entries.ts` | `ContentEntryCommandPort` | same, plus `publishedEntry`, `replayPublication`, `replayUnpublication` |
| `media.ts` | `MediaCommandPort` + `completeMediaDeletion`/`failMediaDeletion`, `requireLeasedMediaDeletionEvent`, `refuseDeletion`, `refuseMetadataUpdate` | same, plus `requestMediaDeletion` |
| `dispatch.ts` | `DispatcherLeasePort` | same |
| `site-builds.ts` | `SiteBuildCommandPort` + `SiteBuildDispatchPort`, `requireLeasedSiteBuild`, `finishLeasedSiteBuild` | same, plus `finishLeasedSiteBuild`, `transitionSiteBuild` |
| `repository.ts` | `NodeContentRepository`, `NodeRepositoryOptions`, `nodeContentRepository`, `ContentModelResolver` re-export | `D1ContentRepository`, `D1RepositoryOptions`, `d1ContentRepository` |

Area classes extend the base, so moved bodies keep their `this.helper(...)`
calls verbatim; private helpers become `protected`. The composite keeps its
constructor signature and doc comment, `implements` the same fifteen ports,
builds one reader and one instance of each area class sharing it, and
declares one explicit delegating method per port member typed from the port
(as RF5A's security composites do). `list` stays as a composite method with
its current body on Node; D1 moves it to `collection-list.ts`. Area classes are not exported from the package entry.
Direction inside `repository/`: `repository.ts` → areas → `base.ts` →
`sql.ts` (D1 also `batch.ts`); areas never import each other.

Rejected: a composition "store" object passed to each area (every helper call
would be rewritten, so moves are not verbatim); mixins (lose `implements`
checking); a single read/write split only (the remaining write class would
still exceed 1,000 lines on D1).

### D4. Package layouts

`platform-node` (entry header lists the same directions):

| Directory | Modules | Depends on |
| --- | --- | --- |
| `database/` | `connection.ts` (`NodeDatabase`, `openNodeDatabase`, `AppliedMigration`, `listAppliedMigrations`, `migrateNodeDatabase`), `host-database-safety.ts` | — |
| `security/` | RF5A modules, `service.ts` (former `security.ts`), `oauth.ts` | — |
| `media/` | `image-inspector.ts`, `minio-storage.ts`, `media-deletion-dispatcher.ts` | — |
| `builds/` | `builder-trigger.ts`, `site-build-dispatcher.ts` | — |
| `repository/` | D3 modules | `database` |
| `runtime/` | `runtime.ts`, `client-address.ts`, `smtp-email.ts`, `content-sync.ts`, `release-version.ts` | `builds`, `database`, `media`, `repository`, `security` |

Root: `index.ts` (re-exports only; `checkedInMigrations` stays re-exported
from `@lacecms/db`) and `migrate.ts`, listed in
`scripts/source-root-entries.json` ("Migration executable, run as node
dist/migrate.js by the Compose files, the generated project and release
images."). `minio-init.mjs` stays (not a graph node). Moving `NodeDatabase`
and the migration helpers out of `index.ts` removes the cycle; the migration
folder URL resolves from `@lacecms/db`, so it is location-independent.

`platform-cloudflare`:

| Directory | Modules | Depends on |
| --- | --- | --- |
| `d1/` | `database.ts` (former `d1.ts`) | — |
| `security/` | RF5A modules, `service.ts` (former `d1-security.ts`), `oauth.ts` | `d1` |
| `media/` | `r2-storage.ts`, `image-inspector.ts` | — |
| `deploy/` | `bounded-body.ts`, `deploy-hook.ts`, `pages-deployments.ts` | — |
| `repository/` | D3 modules | `d1` |
| `runtime/` | `worker.ts`, `settings.ts`, `admin-assets.ts`, `cache.ts`, `email.ts`, `release-version.ts` | `d1`, `deploy`, `media`, `repository`, `security` |

Both entries keep their export lists by `export *` from the moved modules.
`scripts/platform-release-version.mjs` writes `src/runtime/release-version.ts`
for both platforms (one shared name is why the Cloudflare composition
directory is `runtime/`, not `worker/`). The OAuth fixture imports
`dist/security/oauth.js` and `dist/security/service.js`.
`image-inspector-pass-through.test.ts` moves to `media/`; every other test
imports the entry and stays at `src/` root, like RF4J's entry-level suites.

Rejected: keeping `security.ts`/`d1-security.ts` or `oauth.ts` at root for
their dist paths (root modules are reserved for entries; the only reader is
an in-repository fixture); moving package-level tests (path churn in
verification scripts and baselines with no new isolation).

## Risks / Trade-offs

- [A moved read changes D1 statement count or kind] → `first` becomes
  `all(...)[0]`: still one prepared statement per call; the D1 budget tests
  and `countingD1` contract evidence run after each read group.
- [Node build export loses its single snapshot] → `readGroups` is one
  better-sqlite3 transaction; a typed reader unit test asserts both groups
  run inside one `readGroups` call, and the build-export contract cases run
  on both SQLite variants.
- [Verbatim moves silently alter a write] → Area moves are whole-method cuts
  checked with `git diff --color-moved`; the full repository contract,
  `index.test.ts`, `worker.test.ts` and `d1-content-repository.test.ts` run
  after each platform split.
- [Residual duplication: Node's synchronous loader] → About 35 lines kept in
  `repository/base.ts`, used only inside write paths; recorded in the
  roadmap for RF5C.
- [Delegation boilerplate] → About 55 one-line methods per composite;
  accepted, as in RF5A, because RF5C's composition can pass ports directly.

## Migration Plan

None: no schema, data, configuration or operator change; `dist/migrate.js`
and the package exports keep their paths. Rollback is a revert.
