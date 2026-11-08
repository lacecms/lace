## Context

See proposal.md for motivation. Facts at commit `83c0157d`:

- `packages/contracts/src` is flat: `index.ts` (2,994 lines, baselined),
  `collection-queries.ts` (172), `field-openapi.ts` (226),
  `content-model-projection.ts` (61), and the tests `index.test.ts` (2,808
  lines, 79 listed cases), `tolerant.test.ts` (11), `field-openapi.test.ts`
  (3), `shared-identifiers.test.ts` (3), and
  `packaged-exports.packaged.test.mjs`. `vitest list` lists 96 cases.
- `index.ts` holds 400 top-level declarations, in this order: shared
  primitives and JSON guards (86–173), internal-link queries, statuses and
  impact pages (175–296), field and block metadata guards and schemas
  (298–440), ISO-timestamp and entity-tag helpers (442–475), the model route
  and actor (477–486), the block envelope (496–554), SEO text, value and input
  (564–639), snapshots, entries, publication outcomes, entry lists and queries
  (641–815), draft requests, MCP tool arguments, the JSON-schema override and
  `toContentBlockInput` (817–909), the model schema (911–1008), users,
  sessions, email, settings and invitations (1010–1239), build and import
  tokens and the build request (1240–1348), media queries and tags
  (1350–1475), the internal-link manifest, public reads and the build export
  (1477–1637), media metadata, usage and update (1639–1726), site builds and
  the build-site URL (1728–1835), the error envelope (1837–1875), tolerant
  variants (1877–2006), DTO type aliases of the preceding schemas (2008–2064),
  content, media, build, public and export projectors (2066–2718), issue
  pointers and the revision precondition (2720–2772), error classification
  (2774–2927), collection capability identity (2931–2951), and OAuth and MCP
  consent (2953–2994).
- `content-model-projection.ts` imports `ContentModelSource`,
  `ContentModelDto`, `ModelSeoDto` and `SeoDefaultsDto` from `./index.js`,
  which re-exports it, so there is a runtime-free module cycle.
  `mcpSettingsStatusSchema` (1080) depends on the private `ParsedUrl`
  declared with the build-site URL (1782–1793).
- `hasMatchingBlockDefinitions` (421–432) requires
  `blockDefinitions[i].type === blocks[i]`. The application projection
  (`packages/application/src/content/use-cases.ts`) builds the definitions
  from `model.blocks` in order, and `defineConfig` rejects duplicate allowed
  block keys. Admin, CLI and application consumers look definitions up by
  type.
- Consumers (`server`, `mcp`, `sdk`, `cli`, `astro`, `apps/admin`) import only
  the package entry. `scripts/fixtures/oauth-mcp/compat.test.mjs` imports the
  built package.

## Goals / Non-Goals

**Goals:**

- No production module in `packages/contracts/src` over 1,000 lines. The
  entry is the only root production module.
- An acyclic module graph, type-only imports included, with one-way
  directory dependencies stated in the entry.
- Identical runtime export keys and type export names, identical OpenAPI
  output, and preserved case names.
- Block definitions matched by type.

**Non-Goals:**

- Splitting `collection-queries.ts` or `field-openapi.ts` (both under 250
  lines), or reshaping any schema other than the block-definition check.
- Removing the `*Source` mirror interfaces or the type aliases' `v.InferOutput`
  style.
- A committed cycle checker. The scratch script of decision 7 verifies this
  session.

## Decisions

1. **Layout.** Each module is listed with the `index.ts` declaration groups it
   receives (Context line ranges). Sizes are approximate declaration lines.

   | Module | Receives | ≈ lines |
   | --- | --- | --- |
   | `shared/json.ts` | `isJsonValue`, `isJsonObject`, `jsonValueSchema`, `jsonObjectSchema` | 55 |
   | `shared/primitives.ts` | identifier, integer, cursor, timestamp, hash, entity-tag, idempotency and pointer schemas with their patterns and types; `positiveIntegerSchema`; `cursorPageSchema`; `toIsoTimestamp`, `fromIsoTimestamp` | 75 |
   | `shared/preconditions.ts` | `entityTagForVersion`, `versionFromEntityTag`, `RevisionPreconditionInput`, `resolveExpectedRevision` | 45 |
   | `shared/url.ts` | `ParsedUrl` interface and constant | 15 |
   | `errors/envelope.ts` | issue, code and envelope schemas and types (incl. `TolerantErrorEnvelope`), `ClassifiedError`, `ContractValidationError`, `contractIssuePointer`, `toContractValidationIssues`, `toContentValidationIssues`, `validationError` | 100 |
   | `errors/classification.ts` | `TransportErrorCode`, the mapping table and its types, `transportError`, `classifyError` | 130 |
   | `content/metadata.ts` | `FieldMetadataMapDto`, field and block metadata guards and schemas, `fieldVisibilitySchema` | 100 |
   | `content/models.ts` | `contentModelRouteSchema`, model checks (`hasMatchingBlockDefinitions` …), `modelSeoSchema`, `seoDefaultsSchema`, `contentModelSchema`, `contentModelListSchema`, model DTO types | 150 |
   | `content/model-projection.ts` | `git mv content-model-projection.ts`; plus `ContentModelSource`, `toContentModelRouteDto`, `toContentModelDiscoveryDto` | 105 |
   | `content/blocks.ts` | block envelope schemas, `contentBlockSchema`, `publicBlockSchema`, their DTOs, `toContentBlockDto`, `toPublicBlockDto`, `publicBlocks`, `toContentBlockInput` | 100 |
   | `content/seo.ts` | `seoText`, `formatSeoTitle`, SEO value/input schemas and DTOs, `SeoMappingOptions`, `toSeoDto` | 90 |
   | `content/entries.ts` | actor, snapshot, entry, admin entry, publication and build-dispatch outcomes, results, status, sort, list values, summary, totals, list and list-query schemas with their DTOs | 175 |
   | `content/entry-requests.ts` | `editableDraftFields` and the create, save, publish, delete, unpublish, revert and duplicate request schemas | 35 |
   | `content/entry-mappers.ts` | snapshot, entry, admin entry, publication-result and list projectors, `toAdminEntryProjectionDto`, `ContentEntrySummarySource` | 130 |
   | `content/links.ts` | link query, status, usage and impact schemas and DTOs; `internalLinkManifestLocationSchema`, `internalLinkManifestSchema`, `InternalLinkManifestDto` | 145 |
   | `content/collection-queries.ts` | `git mv collection-queries.ts`; plus `collectionCapabilityIdentity` | 195 |
   | `content/mcp-arguments.ts` | `mcpToolArgumentSchemas`, `mcpListEntriesEnvelopeSchema` | 35 |
   | `media/queries.ts` | MIME, sort, tag input and catalog, list and delete query schemas with their DTOs | 95 |
   | `media/metadata.ts` | alt, caption, focal point, metadata, list, usage, detail and update schemas with their DTOs | 125 |
   | `media/mappers.ts` | media `*Source` types, metadata/detail/update projectors, `mediaEntityTag`, `resolveMediaPrecondition`, `mediaUrl` | 140 |
   | `delivery/public.ts` | `optionalInternalLinksSchema`, public entry, media, dictionary, global, content and list schemas with their DTOs | 70 |
   | `delivery/public-mappers.ts` | public `*Source` types, `PublicMediaUrl`, `PublicSeoOptions`, `publicEntryOptions`, public projectors | 140 |
   | `delivery/build-export.ts` | `exportSeoSchema`, `BUILD_EXPORT_FORMAT_VERSION`, format-version, entry and global export schemas, export, query and page schemas with their DTOs | 80 |
   | `delivery/build-export-mappers.ts` | export `*Source` types, `ExportSeoDto`, `exportSeoDto`, `exportPageEntries`, export projectors | 80 |
   | `delivery/tolerant.ts` | `toTolerantSchema`, substitutions, `tolerant`, `tolerantBuild`, `tolerantPublicSchemas` | 120 |
   | `builds/site-builds.ts` | site-build status, record, failure, source path, stage and list schemas with DTOs, `buildRequestSchema`, `buildQueueReceiptSchema`, `toSiteBuildDto`, `toSiteBuildRecordDto` | 110 |
   | `builds/build-site.ts` | `MAX_BUILD_SITE_URL_LENGTH`, `isSiteBaseUrl`, build-site URL, identity and selection schemas with DTOs | 40 |
   | `accounts/users.ts` | role, email, password, setup, user, permission and admin-session schemas with DTOs | 50 |
   | `accounts/email-delivery.ts` | `emailFailureReasonSchema`, `emailDeliveryOutcomeSchema`, their DTOs, `accountLinkSchema`, `linkOnlyWhenUndelivered` | 30 |
   | `accounts/invitations.ts` | account token, display name, invitation, password-reset, profile and password-change schemas with DTOs | 80 |
   | `accounts/sessions.ts` | session browser, OS, record, list, revoke and result schemas with DTOs | 35 |
   | `accounts/oauth.ts` | account capabilities, OAuth connection and MCP consent schemas with DTOs | 45 |
   | `settings/status.ts` | email provider, sender, delivery status and test schemas, MCP and admin settings status with DTOs | 50 |
   | `settings/credentials.ts` | build-token, import-token and import-credential schemas with DTOs, `ImportTokenDtoSource`, `toImportTokenDto` | 105 |
   | `openapi/field-openapi.ts` | `git mv field-openapi.ts` | 226 |
   | `openapi/json-schema.ts` | `contractJsonSchemaOverride` | 15 |

   Each DTO type alias from 2008–2064 goes to the module that declares its
   schema. Each `@lacecms/content` or `@lacecms/domain` import goes to the
   modules that use it.

   *Alternatives considered:* the roadmap's seven flat files. `content.ts`
   would be about 1,000 lines with three responsibilities, and `public`,
   export, tolerant and primitives would have no owner, which goes against §6.
   Grouping projectors with their schemas in one module (e.g. `media.ts`) was
   also considered. Keeping `*-mappers` separate keeps each file to one
   responsibility, so the schema modules carry no `*Source` mirror types.

2. **Directory direction.**
   `shared ← {errors, openapi, accounts, builds, content}`,
   `accounts ← settings`, `content ← media`, and
   `{content, media, errors} ← delivery`. Measured at the declaration level,
   there are no other cross-directory edges. `media/metadata.ts` uses the
   content actor summary, entry status and build-dispatch outcome.
   `settings` uses the account permission and email-failure schemas.
   `delivery/tolerant.ts` uses the error code and envelope. `ParsedUrl` moves
   to `shared/url.ts` because both `settings/status.ts` and
   `builds/build-site.ts` use it. `buildDispatchOutcomeSchema` stays with the
   publication outcomes in `content/entries.ts` so that `content` does not
   depend on `builds`. The entry states this direction in its first comment,
   as RF4A and RF4B do.

3. **Internal helpers are module exports, not package exports.** Seventeen
   private declarations are used by a sibling module and become `export`s of
   their module: `identifierSchema`, `nonNegativeIntegerSchema`,
   `positiveIntegerSchema`, `isJsonObject`, `ParsedUrl`, `emailSchema`,
   `roleSchema`, `passwordSchema`, `accountLinkSchema`,
   `linkOnlyWhenUndelivered`, `modelSeoSchema`, `seoDefaultsSchema`,
   `buildExportFormatVersionSchema`, `exportEntrySchema`,
   `exportGlobalSchema`, `publicBlocks` and `publicEntryOptions`. The entry
   lists the public names of each such module explicitly. It uses `export *`
   only when every export of a module is public (§6). `identifierSchemaPublic`
   keeps its public name.

4. **Entry composition.** `index.ts` keeps `packageName` and the existing
   pass-through re-exports (`LaceError`, `SLUG_PATTERN`,
   `decodeEntryLink`/`encodeEntryLink`/`isSafeUrl`, the block-anchor, SEO,
   media-text and limit constants), grouped by directory with the module that
   uses them. The remaining declarations move out. `content-model-projection`'s
   import from `./index.js` becomes an import from `./models.js` and
   `./model-projection.js`, which removes the existing cycle.

5. **Block definitions match by type.**

   ```ts
   if (value.blockDefinitions === undefined) return true;
   const allowed = new Set(value.blocks);
   const defined = new Set(value.blockDefinitions.map((definition) => definition.type));
   return (
     allowed.size === value.blocks.length &&
     defined.size === value.blockDefinitions.length &&
     defined.size === allowed.size &&
     [...defined].every((type) => allowed.has(type))
   );
   ```

   The check message stays the same, and the schema keeps the received order.
   A new case in `content/models.test.ts`, *block definitions match allowed
   blocks by type in any order*, covers the delta's three new scenarios:
   reversed order accepted; missing, extra and duplicated definitions
   rejected; duplicate allowed types rejected. This is the only behavior
   change. It is a separate task, done after the moves, so the verbatim-move
   checks run against unchanged code.

6. **Verbatim moves, bottom-up, one directory per step.** The moves go in
   this order: `shared`, `errors`, `openapi`, `content`, `media`, `delivery`,
   `builds`, `accounts`, `settings`. Each step cuts declaration ranges
   verbatim, with their leading comments, and adds the imports they need. It
   re-exports the moved names from `index.ts` and runs the package suite and
   package typecheck. Existing leaf files move with `git mv` so their history
   is kept. Orphaned comments move with the declaration that follows them, so
   the two JSDoc blocks before `BlockSettingsDto` go together.

7. **Tests move with their modules, path-only edits.** Companions import the
   entry (`../index.js`) or their own module. Bodies, titles and
   `test.each` tables stay the same. A `describe` whose cases go to several
   files is repeated with the same title, so every full name is kept. The
   index fixtures shared by several companions (`timestamp`, `actor`,
   `block`, `draft`, `published`, `entry`, lines 301–336) move to
   `src/test-support/rest-fixtures.ts`. A fixture used by one file moves with
   it. Placement of the 79 `index.test.ts` cases:

   | Companion | Cases |
   | --- | --- |
   | `index.test.ts` (root) | *shared REST contract DTOs* › exports its package identity, round-trips portable entries, exports, media, builds, and timestamps; *admin entry list contracts* › global models, entries, public globals, and exports have explicit contracts |
   | `shared/primitives.test.ts` | *invalid shared REST payloads* › rejects malformed timestamps, cursors, entity tags, idempotency keys, and issue paths |
   | `shared/preconditions.test.ts` | *shared REST transport conventions* › uses canonical ISO timestamps…, normalizes body and If-Match revisions…; accepts a safe version-derived validator %s; rejects unsupported validator %s; rejects unsafe generated versions and weak mutation preconditions |
   | `errors/classification.test.ts` | *account lifecycle contracts* › account error codes map…; *shared REST transport conventions* › maps known errors…, renders stable sanitized HTTP boundary errors; transports only bounded block-order diagnostics…; content and query errors share value-free stable codes… |
   | `content/metadata.test.ts` | *shared REST contract DTOs* › accepts only normalized portable field metadata; composite metadata…; cyclic and accessor-backed…; list label metadata…; CE9A…; CE9B…; recursive select card…; block visibility metadata…; SM5A visibility metadata… |
   | `content/models.test.ts` | *shared REST contract DTOs* › validates portable allowed block metadata against each model; *admin entry list contracts* › content models carry valid collection list fields only; the new decision 5 case |
   | `content/model-projection.test.ts` | from `shared-identifiers.test.ts`: content model projection covers exactly the DTO schema keys; full model serialization preserves the pre-refactoring bytes |
   | `content/blocks.test.ts` | *admin entry list contracts* › block envelopes have explicit admin, request, public and metadata contracts |
   | `content/seo.test.ts` | *shared SEO text rules* (3); *admin entry list contracts* › SEO values have explicit… contracts |
   | `content/entries.test.ts` | *admin entry list contracts* › accepts consistent summaries…, rejects inconsistent status…, validates list query parameters, admin entries name the last editor…; from `shared-identifiers.test.ts`: entry slug query grammar agrees with the portable slug pattern |
   | `content/entry-requests.test.ts` | *shared REST contract DTOs* › accepts complete mutation request contracts; *invalid shared REST payloads* › rejects unknown keys and invalid mutation values |
   | `content/entry-mappers.test.ts` | shared content projectors preserve metadata, admin attribution and list timestamps |
   | `content/links.test.ts` | internal-link queries, statuses and impact pages… |
   | `content/collection-queries.test.ts` | *configured collection query contracts* (6); effective capability identity… |
   | `content/mcp-arguments.test.ts` | MCP envelopes reuse draft validation…; MCP publication requires a revision… |
   | `media/queries.test.ts` | *admin entry list contracts* › validates media list queries…; *media metadata contracts* › clients share the server tag normalization; ASCII media tag contracts… |
   | `media/metadata.test.ts` | *media metadata contracts* › media DTOs carry set descriptive values…, update requests accept partial patches…, invalid update requests fail…, update results reuse the build dispatch outcome |
   | `media/mappers.test.ts` | *media metadata contracts* › the media precondition is exactly one strong updatedAt tag, stale media edits classify as a sanitized conflict |
   | `delivery/public.test.ts` | *public delivery DTOs* (3); published values without hidden required targets… |
   | `delivery/build-export.test.ts` | *paged build export contract* (3) |
   | `delivery/tolerant.test.ts` | `git mv tolerant.test.ts` (11) |
   | `builds/site-builds.test.ts` | admin build diagnostics…; admin build DTOs accept exactly the seven lifecycle statuses; admin build DTOs carry tracking stage… |
   | `builds/build-site.test.ts` | build-site URLs are absolute HTTP(S) base URLs |
   | `accounts/users.test.ts` | session summaries carry a closed, unique permission list; setup state is a strict boolean-only contract |
   | `accounts/invitations.test.ts` | *account lifecycle contracts* › issue results carry a link…, invitation listings never carry tokens…, passwords, tokens and display names are bounded, account requests reject unknown fields |
   | `accounts/sessions.test.ts` | *account lifecycle contracts* › session records reject tokens and IP addresses |
   | `settings/status.test.ts` | operational status requires a bounded engine release; operational status reports email delivery…; email test results use closed outcomes; MCP settings summary is strict… |
   | `settings/credentials.test.ts` | import-token, slug and hash contracts are strict and point at their parameters |
   | `openapi/field-openapi.test.ts` | `git mv field-openapi.test.ts` (3) |

   `shared-identifiers.test.ts` is removed once its three cases have moved.
   `packaged-exports.packaged.test.mjs` stays at the root unchanged.

8. **Compatibility and acyclicity checks.** Before the first move, record
   three things in `verification.md`: the sorted `vitest list` names (96),
   the export surface (runtime `Object.keys` of `dist/index.js` and the
   value/type export names of `dist/index.d.ts`), and the SHA-256 of
   `apps/api/openapi/api-v1.json`. After the last move, repeat all three. The
   export surface and the OpenAPI hash must be identical. The case list must
   be the baseline plus exactly the decision 5 case. A scratch script over
   `src/**/*.ts` imports (type-only included) confirms there is no module
   cycle and no edge outside decision 2. A second script confirms that none of
   the decision 3 helpers appears in the entry's exports.

9. **Size baseline and documentation.** The existing `tests/shared-vocabulary.test.mjs` guard records exact owner paths for two slug grammar exceptions and the contracts error classifier and validation error. Update those four paths to their new modules, retaining the existing exact-line and uniqueness checks. Remove the
   `packages/contracts/src/index.ts` entry from
   `scripts/oversized-source-baseline.json`. `check-boundaries` then enforces
   the ceiling for every contracts module. Update the roadmap's RF4C text with
   the decision 1 correction, the §3 rows for the contracts size and the
   oversized-file count (15 → 14), and the progress log. The architecture
   does not change: §6 already covers the layout, and the §6 package graph
   keeps `contracts -> domain, content`.

## Risks / Trade-offs

- [A moved declaration loses its leading comment, or a later edit changes a
  body] → decision 6 cuts whole statement ranges with their comments, and
  reviewing `git diff --stat -M` together with the unchanged-surface check
  catches edits. The OpenAPI hash catches any change to a schema's
  JSON-schema shape.
- [Exporting internal helpers from modules widens what sibling modules can
  reach] → only the entry defines the package surface, and decision 8
  verifies it. The helpers stay internal to the package.
- [Repeated `describe` titles drift between files] → the case-name list
  comparison in decision 8 fails on any rename.
- [Type-matched block definitions accept a payload that was rejected before]
  → only the order relaxes. Coverage and uniqueness are still enforced, so no
  invalid metadata gets in. All consumers already look definitions up by
  type.
- [Package typecheck races the build on a cold cache, as recorded in earlier
  sessions] → run `pnpm typecheck --concurrency=1` if the race appears.

## Migration Plan

This is a workspace-internal refactor with no data or runtime migration.
Steps run in task order. Rollback is a revert of the change's commit.
