## Why

Roadmap Step RF5 (runtime deduplication), Session RF5B of
`docs/refactoring-roadmap.md`. `NodeContentRepository`
(`packages/platform-node/src/content-repository.ts`, 2,291 lines) and
`D1ContentRepository` (`packages/platform-cloudflare/src/d1-content-repository.ts`,
2,696 lines) implement the same fifteen ports, and their read side is a
near-verbatim copy that differs only in the execution call (synchronous
better-sqlite3 versus awaited D1) and the bind chunk (200 versus 100). Every
read fix has to be made twice to keep the parity that architecture §15–§16
requires, and both files are the two largest production modules in the
repository, held only by the oversized-source baseline. The second audit added
the rest of RF5B: both platform packages are still flat, and `platform-node`
carries the last legacy module cycle outside admin and CLI
(`content-repository` → `index` → `runtime`).

## What Changes

- **Shared reader in `db`.** New `packages/db/src/reads/content-reader.ts`
  exports `SqlContentReader`, constructed like `SqlContentLinkReader` from a
  `ContentReadSql` capability (`all`, `bindChunk` and `readGroups`, an
  atomic two-step read used only by the build export) and the
  `ContentModelResolver`. It owns every read that is identical on both
  runtimes: `listMedia`, the snapshot and entry hydration (`loadSnapshots`,
  `hydrate`, `loadEntry`), `publicMedia`, `describeActors`, `listPublic`,
  `loadPublic`, `loadPublicGlobal`, `publishedContentVersion`,
  `loadPublicMedia`, `loadMedia`, `loadMediaMany`, `loadDeletingMedia`,
  `loadMediaCatalogItem`, `loadMediaUsage`, `listMediaTags`,
  `exportBuildContentPage`, `listSiteBuilds`, `getSiteBuild`, `load`,
  `loadDraft`, `loadPublished` and the three link reads (through the existing
  `SqlContentLinkReader`). Reads move one group at a time in the roadmap
  order, each followed by `repository-contract` on SQLite (file and memory)
  and D1.
- **Both repositories delegate.** Each repository constructs one reader
  (Node `bindChunk` 200, D1 `D1_MAX_BOUND_PARAMETERS` = 100) and its public
  read methods become one-line delegations, as `resolveLinkTargets` already
  is. Write paths keep their statements, transactions, batches and order.
  Node keeps a synchronous entry loader for reloads inside better-sqlite3
  transactions (publication and unpublication), which an async reader cannot
  serve.
- **Build export keeps each runtime's atomicity.** The shared export runs the
  D1 protocol (version and candidates, then version again and the ranged
  rows); `readGroups` runs both steps inside one SQLite read transaction on
  Node and as two `batch()` calls on D1, so the Node requirement "one read
  transaction per page" and the D1 requirement "at most two batches" both
  still hold.
- **Repository write side split by port.** Following the RF5A pattern, each
  repository becomes a delegating composite over area objects —
  configuration sync, entry commands, media commands and deletion dispatch,
  dispatcher leases, site builds — plus one write-support module for the
  helpers those areas share (snapshot, block, reference and link writes,
  public-state bumps, build enqueueing, guards and error mapping). Method
  bodies move verbatim. Every resulting module is under 1,000 lines.
- **§6 layout for both platform packages.** `platform-node` gains
  `database/`, `repository/`, `security/`, `media/`, `builds/` and
  `runtime/`; `platform-cloudflare` gains `d1/`, `repository/`, `security/`,
  `media/`, `deploy/` and `worker/`. `NodeDatabase` and the migration
  helpers leave `index.ts`, which breaks the `platform-node` cycle. Both
  packages join `scripts/source-layout.json`; `platform-node/src/migrate.ts`
  stays at the root as a directly started entry
  (`scripts/source-root-entries.json`); `db` declares the `reads` directory.
- **Baselines shrink.** The two repository entries leave
  `scripts/oversized-source-baseline.json`, the `platform-node` component
  leaves `scripts/source-cycle-baseline.json`, and the typecheck baseline does
  not grow.
- Non-goals: no SQL, statement order, transaction, batch, error or result
  change; no shared write path; no alignment of `claimSiteBuilds`, revision
  conflict detection or the publication return path, and no
  `composeLaceServices` (RF5C); `list` (collection list) and the
  configuration-sync reads stay runtime-specific (different list-query limits
  and numbered binding; RF5C's composition owns the limits); no package
  export added or removed; no typing of baselined tests (RF9E); no split of
  test files over 1,000 lines (RF9C).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Behavior-preserving refactor (`skip_specs: true`): every requirement of
`node-content-repositories`, `d1-content-repositories` and
`content-repository-contracts` is unchanged — including "Node build-export
pages read one consistent snapshot" and "D1 build-export pages use bounded
batched reads" — and the shared repository contract is the parity guard.

## Impact

- Code: `packages/db/src/reads/content-reader.ts` (+ typed test), the `db`
  entry and header; all production modules of `packages/platform-node/src`
  and `packages/platform-cloudflare/src` move into domain directories; the two
  repository files are replaced by `repository/` modules.
- Public API: `@lacecms/db` gains `SqlContentReader` and the
  `ContentReadSql`, `SqlReadStatement` and `SqlReadGroupRows` types (additive; packaged export pin
  updated). The `platform-node` and `platform-cloudflare` runtime export keys
  and declaration names are unchanged; `dist/migrate.js` keeps its path.
- Dist paths that move, with their readers updated in the same change:
  `platform-node/dist/{oauth,security}.js` and
  `platform-cloudflare/dist/{oauth,d1-security}.js`
  (`scripts/fixtures/oauth-mcp/compat.test.mjs`, `baseline.mjs`);
  `src/release-version.ts` of both platforms
  (`scripts/platform-release-version.mjs`, `tests/release-artifacts.test.mjs`
  and `tests/platform-release-version.test.mjs`). Package-level test suites
  that import only the entry stay at `src/` root, so the test paths named by
  verification scripts, `docs/verification.md` and the typecheck baseline
  are unchanged.
- Tests: `repository-contract` (SQLite file, SQLite memory, D1),
  `security-contract`, `index.test.ts`, `worker.test.ts`, the D1 statement
  budget tests and the OAuth MCP compatibility fixture run unchanged.
- Architecture: §6 source layout and §15–§16 parity are preserved, not
  changed. The roadmap RF5B section, the §3 duplication and size rows and the
  progress log record the outcome.
- Dependencies: RF4E, RF2C, RF9A–RF9B and RF5A (done). Precedes RF5C.
