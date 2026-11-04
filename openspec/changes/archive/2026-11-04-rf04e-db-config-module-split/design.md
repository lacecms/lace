## Context

See proposal.md for the motivation. Facts at commit `53c97d2a`:

- `packages/db/src` is flat. Production modules: `sql-content.ts` (2,229
  lines, baselined), `schema.ts` (862), `internal-link-reader.ts` (438),
  `oauth.ts` (435), `collection-list.ts` (350), `sql-internal-links.ts`
  (233), `sql-publication.ts` (96), `api-tokens.ts` (76), `literal-like.ts`
  (1, a re-export of `literalLikePattern` from `@lacecms/content`) and
  `index.ts` (39). `index.ts` declares `packageName`, `appliedMigrationQuery`,
  `checkedInMigrations` and `AppliedMigration`, and re-exports every other
  module with `export *`.
- Intra-package imports: `collection-list` imports entry SQL, cursors, the
  base64 helpers and `assertPageSize` from `sql-content`; `internal-link-reader`
  imports the base64 helpers from `sql-content` and `LINK_TARGETS_SQL` from
  `sql-internal-links`; `sql-content` imports `syncInternalLinkStatements` and
  `SNAPSHOT_INTERNAL_LINKS_JSON_SQL` from `sql-internal-links`;
  `sql-publication` imports from `sql-internal-links`. There is no cycle.
- `sql-content.ts` declares, in order: four ambient Web-platform globals
  (`atob`, `btoa`, `TextDecoder`, `TextEncoder`, 93–98), limits (100–107),
  `ContentModelResolver`, site-build status SQL and tracking (110–226), row
  interfaces (228–386), entry SQL (388–401), media SQL and metadata updates
  (402–448), public route, global and media SQL (449–487), build-export SQL
  (488–576), media by ID and usage SQL (577–602), stored model state SQL
  (603–641), synchronization scan, write and block-migration code (643–1113),
  snapshot and block column lists and copy SQL (1114–1171), mappers and
  assertions (1173–1340), base64 and cursors (1342–1474), build-export
  cursors and pages (1476–1601), entry summaries (1603–1666), media metadata
  and usage (1668–1834), `chunks`, SEO and snapshot hydration (1836–1966),
  public projections (1968–2030), `siteBuildPayload`, `sqliteWriteError`, the
  field rewrite (2032–2139) and media tag helpers (2141–2229). Unexported
  helpers that cross the new module boundaries: `ADMIN_MEDIA_COLUMNS_SQL`,
  `PUBLIC_INTERNAL_LINKS_JSON_SQL`, `DELIVERED_REFERENCE_SQL` and
  `parseCursorObject`.
- `schema.ts` defines 36 tables plus `betterAuthSchema`. References run
  `contentEntries ↔ contentSnapshots` (both directions, in one group),
  `siteBuilds → contentSnapshots`, `contentMediaReferences → contentSnapshots, media`,
  `passwordResetTokens → authUsers` and every `oauth*` table to `authUsers`,
  `authSessions` or other `oauth*` tables. `drizzle.config.ts` names
  `./packages/db/src/schema.ts`. On this commit `drizzle-kit check` reports
  no problem. `drizzle-kit generate` into a copy of `packages/db/drizzle`
  reports "No schema changes", and `drizzle-kit export` prints 582 lines of
  DDL. `drizzle-kit generate` accepts only a relative `--out` path.
- `db` tests: `index.test.ts` (1,194 lines, `// @ts-nocheck`, 26 cases plus
  helpers `syncWriteDatabase`, used by two synchronization cases, and
  `migrationDatabase`, `migration` and `runMigration`, used by two block
  migration cases), and `collection-list-sql.test.ts` (1 case,
  `__snapshots__/collection-list-sql.test.ts.snap`). Three migration cases
  already apply checked-in migrations to `node:sqlite` `:memory:` databases.
- `packages/platform-cloudflare/src/d1-content-repository.test.ts` reads
  `../../db/src/sql-content.ts` and asserts it imports no Node-only module and
  uses no `Buffer.from`.
- `packages/config/src/index.ts` (1,229 lines, baselined) holds the key
  patterns, `ConfigurationError` (39–51), the public input, definition and
  projection types (53–289), the JSON helper types and assertions (291–321),
  field, key-list, removal and synchronization-hint normalization and blocks
  (323–477), the route normalizers (479–498), `normalizeCommonModel`
  (500–558), SEO normalization (560–692), `definePage`, `defineGlobal`,
  list options and `defineCollection` (694–820), model-set checks (822–919),
  canonical structure and hash projections (921–1125) and `defineConfig`
  (1127–1229). Its tests are black-box: `index.test.ts` (49 cases through the
  public entry), `index.type-test.ts` (run by `type-test` with
  `tsconfig.type-test.json`, which includes `src/index.ts`), and
  `config.fixture.ts` plus `config.projection.fixture.json`, which only
  `index.test.ts` reads. `tsconfig.json` compiles `src/index.ts` and
  `src/config.fixture.ts`.
- Both packages pin runtime export keys in
  `src/packaged-exports.packaged.test.mjs`. Neither `tsconfig.json` cleans
  `dist/`, so moved files leave stale compiled copies until `dist/` is
  removed.

## Goals / Non-Goals

**Goals:**

- In both packages, `index.ts` is the only root production module. Every
  other production module is in a domain directory, has one concern and
  stays well under 1,000 lines.
- Module graphs are acyclic, type-only imports included, and directories
  follow decisions 2 and 6.
- Declarations, bodies, SQL text and JSDoc move verbatim; only imports,
  `export` keywords on cross-module helpers, and the duplicated ambient
  declarations (decision 4) change.
- Drizzle DDL, generated SQL and every configuration hash stay identical.

**Non-Goals:**

- Changing SQL, row mapping or the `ContentRepository` adapters in
  `platform-node` and `platform-cloudflare`.
- Moving `test-utils` code or the security row mappers (RF4F, RF5A).
- Splitting `config`'s black-box `index.test.ts` (1,328 lines; tests are
  exempt from the size limit) or its type test.

## Decisions

1. **`db` layout.** Each module imports only from lower directories (decision
   2), from earlier rows of its own directory, or from other packages.

   | Module | Contents (`sql-content.ts` lines unless noted) | ≈ lines |
   | --- | --- | ---: |
   | `shared/limits.ts` | `SQL_CURSOR_VERSION` … `PUBLICATION_IDEMPOTENCY_TTL_MS` (100–107) | 15 |
   | `shared/failures.ts` | `failure`, `revisionConflict`, `notPublished` (1125–1135) | 15 |
   | `shared/write-errors.ts` | `sqliteWriteError` (2051–2076) | 30 |
   | `shared/values.ts` | `SortSql`, `assertPageSize`, `assertNonNegativeInteger`, `assertTimestamp`, `parseObject`, `storedRole`, `chunks` (383–386, 1249–1267, 1325–1340, 1836–1845) | 70 |
   | `shared/base64.ts` | ambient `atob`/`btoa`/`TextDecoder`/`TextEncoder`, `encodeBase64Url`, `decodeBase64Url` (93–98, 1342–1355) | 25 |
   | `shared/cursors.ts` | `DecodedCursor`, `DecodedSortCursor`, `parseCursorObject` (now exported), `encodeCursor`, `decodeCursor`, `encodeSortCursor`, `decodeSortCursor` (373–381, 1357–1426) | 85 |
   | `shared/literal-like.ts` | `git mv literal-like.ts` | 1 |
   | `schema/columns.ts` | `timestamp`, `authTimestamp` (`schema.ts` 14–15, now exported) | 10 |
   | `schema/content.ts` | `contentModels`, `contentEntries`, `contentSnapshots`, `contentBlocks`, `publishedRoutes`, `contentEntryLinkReferences`, `contentLinkState`, `publishedState` | 290 |
   | `schema/media.ts` | `media`, `mediaTags`, `contentMediaReferences` | 95 |
   | `schema/operations.ts` | `outboxEvents`, `siteBuilds`, `idempotencyRecords`, `mutationGuards` | 85 |
   | `schema/auth.ts` | `authUsers`, `authSessions`, `authAccounts`, `authVerifications` | 85 |
   | `schema/security.ts` | `installationState`, `setupTokens`, `apiTokens`, `rateLimitBuckets`, `invitations`, `passwordResetTokens` | 110 |
   | `schema/oauth.ts` | the eleven `oauth*` tables | 320 |
   | `schema/better-auth.ts` | `betterAuthSchema` | 20 |
   | `schema/migrations.ts` | `appliedMigrationQuery`, `checkedInMigrations`, `AppliedMigration` (`index.ts` 7–33) | 35 |
   | `security/oauth.ts`, `security/api-tokens.ts` | `git mv oauth.ts`, `git mv api-tokens.ts` | 435, 76 |
   | `links/statements.ts` | `git mv sql-internal-links.ts` | 233 |
   | `links/reader.ts` | `git mv internal-link-reader.ts` | 438 |
   | `publication/projection.ts` | `git mv sql-publication.ts` | 96 |
   | `content/entries.ts` | `ContentModelResolver`, `EntryRow`, `SummaryRow`, `TotalsRow`, `ENTRY_*_SQL`, `entryStatus`, `listValues`, `entrySummary`, `entryTotals`, `entryTotalsSql`, `entryCursorKind`, `decodeEntryCursor` | 150 |
   | `content/blocks.ts` | `BlockRow`, `BLOCK_COLUMNS_SQL`, `BLOCK_COPY_COLUMNS_SQL`, `copySnapshotBlocksSql` | 35 |
   | `content/snapshots.ts` | `SnapshotRow`, `StoredSnapshot`, `SNAPSHOT_COLUMNS_SQL`, `DUPLICATE_SOURCE_REVISION_SQL`, `revertDraftSnapshotSql`, `copySnapshotReferencesSql`, `unpublicationScope`, `assertDraftPersistenceBounds`, `seoJson`, `storedSeo`, `storedSnapshot`, `storedSnapshots`, `snapshotIdsOf`, `snapshotValue`, `hydrateEntries` | 190 |
   | `content/collection-list.ts` | `git mv collection-list.ts` | 350 |
   | `media/tags.ts` | `normalizedMediaFilterTags`, `mediaTagFilters`, `mediaListFilters`, `mediaTagCatalogQuery`, `normalizedMediaWriteTags`, `mediaTagInsert` (2141–2229) | 95 |
   | `media/catalog.ts` | `MEDIA_COLUMNS_SQL`, `MEDIA_TAGS_JSON_SQL`, `ADMIN_MEDIA_COLUMNS_SQL`, `MEDIA_USAGE_COUNT_SQL`, `MEDIA_CATALOG_SQL`, `MEDIA_SORT_SQL`, `MEDIA_BY_ID_SQL`, `MEDIA_METADATA_UPDATE_SQL`, `MEDIA_PUBLISHED_REFERENCE_SQL`, `mediaMetadataUpdateParams`, `mediaMetadata`, `mediaCatalogItem`, `mediaCursorKind`, `decodeMediaCursor` | 160 |
   | `media/usage.ts` | `MediaUsageRow`, `MEDIA_USAGE_SQL`, usage location ordering, `mediaUsageEntries` | 115 |
   | `delivery/public.ts` | `PublicRow`, `PublicGlobalRow`, `PUBLIC_INTERNAL_LINKS_JSON_SQL` and `DELIVERED_REFERENCE_SQL` (now exported), `PUBLIC_ROUTE_SQL`, `PUBLIC_GLOBAL_SQL`, `PUBLIC_MEDIA_SQL`, `publicSnapshotMediaSql`, `publicSnapshotMedia`, `publicContentEntry`, `publicGlobalContent`, `publicEntry` | 115 |
   | `builds/site-builds.ts` | status SQL, refusal, tracking claims and checks, `SiteBuildRow`, `siteBuildRecord`, dispatch error sanitizing and encoding (110–226 without `ContentModelResolver`, 1173–1191, 1284–1323) | 180 |
   | `builds/outbox.ts` | `OutboxRow`, `PENDING_SITE_BUILD_SQL`, `siteBuildPayload` | 35 |
   | `builds/export.ts` | build-export SQL, cursors, page ranges, `assertBuildExportVersion`, `BuildExportPageRows`, `buildExportPage` (488–576, 1476–1601) | 225 |
   | `sync/model-state.ts` | `StoredModelStateRow`, baseline and fingerprint SQL, `STORED_MODEL_*_SQL`, `sameStoredModelStates`, `storedModelStates` | 110 |
   | `sync/scan.ts` | `SyncSnapshotRow`, `SyncBlockRow`, `SYNC_SNAPSHOTS_SQL`, `SYNC_BLOCKS_SQL`, `syncSnapshotPage` | 95 |
   | `sync/writes.ts` | backfill key and SQL, `ConfigurationSyncWriteStatement`, model ID SQL, `configurationSyncWriteStatements` (656–761) | 110 |
   | `sync/block-migration-scan.ts` | `SYNC_MIGRATION_*_SQL`, the four migration row types, page size, `staleBlockMigration`, targets, snapshot IDs, `syncMigrationPage` (810–984) | 180 |
   | `sync/block-migration-writes.ts` | `ConfigurationSyncMigrationStatements`, value-row helpers, `configurationSyncMigrationStatements` (986–1113) | 130 |
   | `sync/field-rewrite.ts` | ambient `TextEncoder`, `configurationSyncSnapshotRewriteStatements`, `SYNC_FIELD_REWRITE_ROWS_SQL`, `SyncFieldRewriteRow` (2078–2139) | 70 |
   | `index.ts` | `packageName`, directory direction, re-exports (decision 3) | 70 |

   File names do not repeat their directory. A helper used by one module
   moves with it. A helper used by several modules becomes a module export
   that the entry does not re-export. Exact imports follow what each moved
   body references; the requirement is the direction and acyclicity rules,
   not a per-module import list. Alternative rejected: the roadmap's flat
   `sql/{entries,snapshots,blocks,media,builds,cursors}.ts` plus
   `write-errors.ts`. Synchronization alone (about 640 lines) and public
   delivery had no owner, so `builds.ts` or `entries.ts` would approach the
   ceiling. A `sql/` directory would also name a technique, not a domain,
   beside the unsplit flat modules.

2. **`db` directory direction:** `shared ← {schema, security, links} ;
   links ← publication ; shared ← content ← media ← delivery ← builds ;
   links ← sync`. `sync` imports `shared` and `links` and no `content`
   module. `schema` modules import only `schema/` and `drizzle-orm`.
   `index.ts` states this on its first line. Media depends on content
   because usage needs `ENTRY_STATUS_SQL` and `entryStatus`. Delivery
   depends on both, because public entries carry referenced media. Builds
   depend on delivery because the export page reuses public projections.
   Alternative rejected: putting public projections in `content/`, which
   would make `content ↔ media` a directory cycle.

3. **`db` entry re-exports.** `export *` stays for a module whose exports are
   all public today. A module that gains a cross-module helper is re-exported
   by an explicit name list: `shared/cursors.ts` (without
   `parseCursorObject`), `delivery/public.ts` (without
   `PUBLIC_INTERNAL_LINKS_JSON_SQL` and `DELIVERED_REFERENCE_SQL`) and
   `media/catalog.ts` (without `ADMIN_MEDIA_COLUMNS_SQL`). `schema/columns.ts`
   is not re-exported. The proof is decision 9: the runtime key set and the
   `dist/index.d.ts` declaration name set are identical before and after.

4. **Ambient Web-platform declarations are module-local.** `declare function
   atob` and similar declarations type the globals that exist on Node and
   Workers, because the package compiles against ES2024 only. Exporting a
   `declare const` would emit an import of a binding that no module
   provides. Therefore `shared/base64.ts` keeps all four declarations, and
   `sync/field-rewrite.ts` repeats only `declare const TextEncoder`.
   Alternative rejected: adding `DOM` or `WebWorker` to `lib`. That would
   widen the global surface of every `db` module and hide a Node-only API
   use, which the Worker-safety test exists to catch.

5. **`schema.ts` split and its gate.** Before moving any table, record
   `drizzle-kit export --config drizzle.config.ts` output at `53c97d2a`. Then
   move table definitions verbatim into the `schema/` rows of decision 1.
   `drizzle.config.ts` names the seven table modules in an explicit
   `schema` array: `columns`, `content`, `media`, `operations`, `auth`,
   `security` and `oauth`. It does not use a glob, because a glob would load
   `schema/*.test.ts` and `migrations.ts`. The split is accepted only when
   (a) the export output is byte-identical to the recorded output, and (b)
   `pnpm db:check` (decision 7) reports no pending migration. If either
   check fails and an ordering or naming fix cannot restore it, `schema.ts`
   moves unchanged to `schema/tables.ts`, the config names that file, and
   the roadmap records the outcome. In both outcomes the published tarball
   keeps `drizzle/`, and `packages/db` `db:generate` keeps using the root
   config. Group direction: `columns ← {content, auth} ; content ← {media,
   operations} ; auth ← {security, oauth} ; {auth, oauth} ← better-auth`.
   The mutual `contentEntries` and `contentSnapshots` references stay in one
   module.

6. **`config` layout and direction:** `shared ← models ← structure ←
   configuration`.

   | Module | Contents (`config/src/index.ts` lines) | ≈ lines |
   | --- | --- | ---: |
   | `shared/errors.ts` | `ConfigurationError`, `fail` (45–51, 294–296) | 20 |
   | `shared/assertions.ts` | the three key patterns, `assertString`, `assertOptionalDisplayValue`, `assertStableKey`, `assertVersion`, `assertOnlyKeys` (41–43, 298–321, 585–589) | 45 |
   | `models/types.ts` | `FieldMap` … `NormalizedConfig` (53–289) | 240 |
   | `models/routes.ts` | `normalizePagePath`, `normalizeCollectionRoute`, `resolveCollectionRoute`, `pageMatchesCollection` (479–498, 822–831) | 35 |
   | `models/fields.ts` | `NormalizedFields`, `normalizeFields`, `normalizeKeyList`, `normalizeRemovedFields`, `assertSynchronizationHints`, `normalizeBlocks` (323–477) | 160 |
   | `models/common.ts` | `normalizeCommonModel` (500–558) | 65 |
   | `models/seo.ts` | `seoFieldReference`, `normalizeRoutableSeo`, `normalizeSeoDefaults` (560–583, 591–692) | 130 |
   | `models/list-options.ts` | `normalizeListFields`, `normalizeListOptions` (739–797) | 65 |
   | `models/define.ts` | `definePage`, `defineGlobal`, `defineCollection` (694–737, 799–820) | 75 |
   | `structure/hash-input.ts` | `MutableJsonObject`, `MutableJsonValue`, `asJsonValue`, `modelForHash`, `normalizedModelForHash` (291–292, 921–923, 1075–1110) | 60 |
   | `structure/canonical.ts` | display-metadata and list-field omission, `legacyStructureForHash`, field, block and placeholder structure, `contentModelStructure` (925–1073) | 160 |
   | `configuration/define-config.ts` | `assertUniqueModels`, `assertRegisteredModelBlocks`, `publicModel`, `defineConfig` (833–919, 1112–1229) | 210 |
   | `index.ts` | `packageName`, direction, explicit re-exports | 45 |

   Modules gain internal helper exports for sibling imports. All public types,
   including `ContentModelStructure`, stay declared in `models/types.ts`.
   `CommonModelInput` is exported from that module for `models/common.ts`
   but is not a public package export. The entry lists runtime and type
   exports explicitly, preserving the previous declaration names. `index.test.ts` and `index.type-test.ts` remain at the
   root as package-level tests. `tsconfig.type-test.json` keeps including
   `src/index.ts`, and the compiler follows its imports. The two fixtures
   move to `src/test-support/`. `tsconfig.json` then includes only
   `src/index.ts`, so `dist/` stops containing the unused compiled fixture.
   Alternative rejected: splitting `index.test.ts` into module companions.
   Its cases assert public `defineConfig` output, and the hash fixtures are
   shared across cases, so a split would scatter fixtures without improving
   isolation.

7. **`db:check`.** `scripts/check-drizzle-schema.mjs` runs from the
   repository root. It (1) runs `drizzle-kit check --config drizzle.config.ts`.
   It then (2) copies `packages/db/drizzle` into a fresh directory under
   `node_modules/.cache/lace-drizzle-check/`. There it runs `drizzle-kit
   generate --dialect sqlite --schema <the config's schema list> --out
   <relative copy path>` with stdin closed and a timeout, and fails when the
   copy gains or changes a file, or when the command exits non-zero. It
   removes the copy in every case. A rename prompt cannot block, because
   closed stdin makes the prompt exit non-zero. The script reads the
   `schema` list from `drizzle.config.ts` instead of repeating it. Root
   `package.json` gains `"db:check"`, and `lint` appends `&& node
   scripts/check-drizzle-schema.mjs`. The root-scripts completeness check
   requires both references. Alternatives rejected: `drizzle-kit check`
   alone, which validates the snapshot chain and not schema-versus-snapshot;
   and generating into the committed `drizzle/`, which could write a
   migration during lint.

8. **Column-list drift test.** `packages/db/src/sql-schema-drift.test.ts` is
   a package-level test at the root because it crosses `content/`, `media/`
   and `schema/`. It creates `new DatabaseSync(":memory:")` and executes every
   `checkedInMigrations` file in order, as the existing migration cases do.
   It then reads a table of the five lists:

   | List | Table(s) by alias | Statement prepared |
   | --- | --- | --- |
   | `ENTRY_COLUMNS_SQL` | `content_entries` | as is |
   | `SNAPSHOT_COLUMNS_SQL` | `s` → `content_snapshots`, `u` → `user` | as is |
   | `BLOCK_COLUMNS_SQL` | `content_blocks` | as is |
   | `BLOCK_COPY_COLUMNS_SQL` | `content_blocks` | `select <list> from content_blocks` |
   | `MEDIA_COLUMNS_SQL` | `m` → `media` | `select <list> from media m` |

   For each list it extracts the selected column identifiers (optionally
   alias-qualified), maps each alias to its table, and asserts membership in
   `pragma table_info(<table>)`. The message names the list, table and
   column. It also asserts that `database.prepare(statement)` succeeds. The
   expected table per alias is test data, so a list that gains an alias
   fails until the table is extended.

9. **Verification of "pure move".** Before any move, record:
   - `vitest list` titles for `db`, `config` and `platform-cloudflare`;
   - the `dist/index.js` runtime keys and the sorted set of declaration names
     reachable from `dist/index.d.ts` for `db` and `config`, after a clean
     build;
   - `drizzle-kit export` output (decision 5);
   - `pnpm openapi:check` state.

   After the move, with `dist/` removed and rebuilt, each set must be
   identical. Test titles are identical as a multiset; the only additions
   are the drift test cases. `config`'s `projection.fixture.json` hashes
   must pass unchanged, which proves identical structure and hashing.

10. **Tests follow their modules.** `db` companions keep `// @ts-nocheck` and
    its TODO line when they come from `index.test.ts`, and import from the
    module under test. They change only import paths and fixture URLs, for
    example `../../drizzle/` from `schema/`. Mapping:
    `index.test.ts` keeps the package identity case. `schema/migrations.test.ts`
    holds the migration inventory, internal-link migration and public
    identity migration cases. `security/api-tokens.test.ts` holds import-token
    invalidation. `shared/cursors.test.ts` holds base64 cursor encoding.
    `shared/write-errors.test.ts` holds draft bounds and constraint mapping.
    `shared/literal-like.test.ts` holds literal LIKE.
    `builds/site-builds.test.ts` holds status SQL. `builds/export.test.ts`
    holds both build-export cases. `content/snapshots.test.ts` holds SEO
    round-trip. `content/entries.test.ts` holds entry cursor identity and
    cursor fingerprints. `content/collection-list-sql.test.ts` moves with
    `__snapshots__/`. `media/catalog.test.ts`, `media/usage.test.ts` and
    `media/tags.test.ts` hold their media cases. `delivery/public.test.ts`
    holds stored block envelopes. `publication/projection.test.ts` holds the
    conditional publication projection. `sync/writes.test.ts` holds the
    three synchronization write cases with `syncWriteDatabase`.
    `sync/block-migration-writes.test.ts` holds the two block-migration
    statement cases with the migration helpers.
    `sync/block-migration-scan.test.ts` holds migration scan rows, and
    `sync/field-rewrite.test.ts` holds exact snapshot rewrite. Each helper
    is used by one companion, so `src/test-support/` is not needed in `db`.
    The Worker-safety case in `platform-cloudflare` recursively reads every
    `.ts` file under `../../db/src` except `*.test.ts`, `*.packaged.test.mjs`
    and `test-support/`. It keeps the same forbidden pattern and
    `Buffer.from` assertion, and asserts that it read at least the moved
    modules.

## Risks / Trade-offs

- [Drizzle orders exported DDL or snapshot JSON by module load order] →
  Decision 5 compares byte-identical export output and runs a no-pending
  generation check. On failure, it falls back to an unchanged
  `schema/tables.ts`. No migration or snapshot file is regenerated in this
  change.
- [`drizzle-kit generate` behaves differently in CI (TTY, cache path)] →
  The script never needs a TTY, writes only under `node_modules/.cache`,
  which CI already creates on install, and fails closed on timeout or
  non-zero exit.
- [Lint time grows by two `drizzle-kit` runs, a few seconds each] →
  Accepted; this is the only guard against an unmigrated schema edit.
- [A moved helper becomes accidentally public through `export *`] →
  Decision 3 uses explicit lists for the three affected modules, and
  decision 9 compares key and declaration-name sets.
- [Stale `dist/` copies hide a missing re-export] → Verification removes
  `dist/` before building both packages.
- [Column-identifier extraction in the drift test is a small parser] → The
  lists are plain comma-separated identifiers with optional aliases. The
  test also prepares each statement, so a parser miss is still caught by
  SQLite.
- [Config directory names collide with the package name (`configuration/`)]
  → Accepted; `configuration/` owns whole-configuration normalization, and
  `models/` owns single models.

## Migration Plan

No deployment or data migration. The change is one commit. It can be rolled
back with `git revert`. No checked-in migration, snapshot or published API
changes.

## Open Questions

None. The owner settled scope (RF4E covers `db` and `config`; RF4F covers
`test-utils`) and chose the conditional `schema.ts` split.
