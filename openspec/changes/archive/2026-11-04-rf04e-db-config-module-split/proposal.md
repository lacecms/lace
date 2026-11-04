## Why

Two production monoliths remain outside a scheduled split after RF4D:
`packages/db/src/sql-content.ts` (2,229 lines at `53c97d2a`) holds every
shared SQLite-dialect statement, row type and row mapper for entries,
snapshots, blocks, media, site builds, build export, cursors and
configuration synchronization, and `packages/config/src/index.ts` (1,229
lines) holds the configuration types, model normalization, structural hashing
and `defineConfig`. Both are entries in
`scripts/oversized-source-baseline.json`. Separately, nothing checks that the
`*_COLUMNS_SQL` constants name columns that the migrations create, and nothing
fails when `schema.ts` changes without a generated migration. This is Session
RF4E of [`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md)
(Step RF4, module splits). It applies architecture §6 *Source layout* (ADR
0020) and prepares the split `db` package that RF5 builds on (RF5A adds
security rows, RF5B a shared content reader).

## What Changes

- **`@lacecms/db` domain directories.** `src/index.ts` becomes the only root
  production module: `packageName` and explicit re-exports, with the directory
  direction stated at the top. Code moves verbatim, JSDoc included, into
  `shared/` (limits, failures, write errors, value assertions, base64,
  cursors), `schema/` (Drizzle tables by group and the migration inventory),
  `security/` (`oauth.ts`, `api-tokens.ts`), `links/` (internal-link SQL and
  reader), `content/` (entries, snapshots, blocks, collection list),
  `media/` (catalog, tags, usage), `delivery/` (public projections),
  `builds/` (site builds, outbox, build export), `publication/` (publication
  projection) and `sync/` (model state, scan, writes, block migration, field
  rewrite). Existing modules move with `git mv`.
- **`schema.ts` splits by table group** into `schema/{columns,content,media,operations,security,auth,oauth,better-auth}.ts`,
  because the owner chose to split it when the Drizzle output stays identical.
  `drizzle.config.ts` lists the table modules. The split is kept only if
  `drizzle-kit export` prints byte-identical DDL and `drizzle-kit generate`
  reports no schema changes against the committed snapshot. Otherwise
  `schema.ts` moves unchanged to `schema/tables.ts`.
- **Schema drift guards.** (1) A package-level test migrates an in-memory
  `node:sqlite` database through every checked-in migration. It asserts that
  each column named by `ENTRY_COLUMNS_SQL`, `MEDIA_COLUMNS_SQL`,
  `SNAPSHOT_COLUMNS_SQL`, `BLOCK_COLUMNS_SQL` and `BLOCK_COPY_COLUMNS_SQL`
  exists in `pragma table_info` of its table, and that each statement
  prepares. (2) A new `pnpm db:check` (root script
  `scripts/check-drizzle-schema.mjs`) runs `drizzle-kit check` and fails when
  `drizzle-kit generate` would create a migration. `pnpm lint` runs it.
- **`@lacecms/config` domain directories.** `src/index.ts` keeps
  `packageName` and explicit runtime and type re-exports over `shared/` (error, assertions),
  `models/` (types, routes, fields and hints, common model, SEO, list options,
  `define*`), `structure/` (canonical structure and hash projections) and
  `configuration/` (`defineConfig`). Direction: `shared ← models ← structure
  ← configuration`. The black-box `index.test.ts` and `index.type-test.ts`
  stay at the root as package-level tests. `config.fixture.ts` and
  `config.projection.fixture.json` move to `src/test-support/`.
- **Corrections to the roadmap text.** (1) The roadmap's flat
  `sql/{entries,snapshots,blocks,media,builds,cursors}.ts` and `write-errors.ts`
  have no owner for configuration synchronization (about 640 lines), public
  delivery, outbox or build export, and would leave `sql/` beside the other
  flat modules. The session uses §6 domain directories instead, as RF4C and
  RF4D did. (2) `drizzle-kit check` validates only the migration snapshot
  chain; it does not detect a schema edit without a migration. The new
  `db:check` adds the no-pending-migration check. (3) "Remaining monoliths"
  is settled with the owner: RF4E also splits `packages/config/src/index.ts`.
  The seven `test-utils` files still in the baseline move to a new session
  RF4F.
- **Public surface unchanged.** The runtime export keys pinned by both
  `packaged-exports.packaged.test.mjs` files and the type export names of each
  `dist/index.d.ts` stay identical. Helpers that become module exports so
  sibling modules can import them are not added to either package entry.
- **Tests follow their modules.** `db`'s `index.test.ts` splits into module
  companions, and `collection-list-sql.test.ts` moves with its snapshot. Each
  case title stays unchanged. `platform-cloudflare`'s Worker-safety test reads
  every `db` production module instead of the deleted `sql-content.ts`.
- **Guards and documentation.** `packages/db/src/sql-content.ts` and
  `packages/config/src/index.ts` leave the size baseline (13 → 11). The
  roadmap records the RF4E layout and corrections, adds Session RF4F, updates
  the RF5A target path to `security/rows.ts`, and updates the §3 rows and the
  progress log. Architecture §16 names the drift guards.

Non-goals: any change to SQL text, a statement's parameters, row mapping,
error codes or messages, Drizzle table definitions, a migration or the
`configuration hash` of any model; sharing Node and D1 read paths (RF5B);
moving security row mappers (RF5A); splitting `test-utils` (RF4F) or the
platform repositories (RF5); renaming any public declaration; new subpath
exports; splitting config's black-box tests.

Dependencies: RF2B (`db` tests on source), RF3A–RF3D (shared vocabulary and
error model), RF4A–RF4C (`content`, `application`, `contracts` entries that
`db` and `config` import). Independent of RF4D.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sqlite-schema-and-migrations`: adds a requirement that shared SQL column
  lists and the Drizzle schema stay consistent with the checked-in
  migrations, enforced by a migrated-database test and the lint gate.

The capabilities whose code only moves keep their requirements unchanged:
`node-content-repositories`, `d1-content-repositories`,
`content-repository-contracts`, `collection-query-options`,
`configuration-synchronization`, `content-model-configuration`,
`schema-evolution`, `internal-url-links`, `media-use-cases` and
`site-build-dispatch`.

## Impact

- Code: `packages/db/src` reorganized into ten directories and
  `packages/config/src` into four, each with `index.ts` as the only root
  production module. Tests move beside their modules; one drift test is added.
- Tooling: `drizzle.config.ts` lists the split schema modules; new
  `scripts/check-drizzle-schema.mjs`, root `db:check` script, and `pnpm lint`
  runs it; two entries removed from `scripts/oversized-source-baseline.json`;
  the Cloudflare Worker-safety test scans the `db` source tree.
- Documentation: roadmap (RF4E, new RF4F, RF5A path, §3, progress log),
  architecture §16 drift guards, and the `pnpm lint` row of
  `docs/verification.md`.
- Consumers: none at runtime. `platform-node` and `platform-cloudflare` import
  `@lacecms/db`; `application`, `server`, `mcp`, `cli`, `test-utils`, the two
  platforms, `apps/api` and the generated project template import
  `@lacecms/config`. Both entries keep their runtime keys and type names. The published `@lacecms/db` tarball still
  ships `drizzle/`. The `@lacecms/config` tarball no longer ships the unused
  compiled `config.fixture.js`.
- Dependencies: none added or removed (`drizzle-kit` is already a root
  devDependency).
