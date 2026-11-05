# RF3E verification

## Baseline

Measured at commit `24f6ad1b` with Node 24.22.1 and pnpm 12.3.4, after
`turbo run build` of the listed packages. The raw lists were kept in the
session scratchpad for comparison and removed after verification.

- **OpenAPI.** `pnpm openapi:generate` rewrote `apps/api/openapi/api-v1.json`
  without a diff. SHA-256 `2d27764152253af8a9616208077f59a64ddd896bdc114f46885bce155825a8d5`.
- **Exports.** Runtime keys come from importing each package's `dist/index.js`.
  Declaration names were resolved through the `export *` and `export {…} from`
  re-exports of the emitted declaration files.
- **Titles.** Sorted output of `vitest list` in each package directory.

| Package | Runtime keys | Declaration names | Listed titles | Sorted titles SHA-256 |
|---|---:|---:|---:|---|
| content | 93 | 180 | 115 | 20a32ac0ca39ba41066b9213db7ffcdbdf1e79be545b771df589a9d7ddbf6bbd |
| domain | 75 | 120 | 23 | a8332f7c586a56f2c93d7b88b880452d7f9dec9e890981b039ce667e45a696d7 |
| contracts | 259 | 384 | 97 | cd8f8102370fcca698d88040d26a2ceeb9e0be130250c7e7c6676b67be29b704 |
| application | 140 | 393 | 131 | af54a7fc4ed61f63a9a052e9f7e447f4c969fa90db08493d6f1cf345644ca8ba |
| db | 202 | 241 | 28 | ca4d172c06de97fa331766e5ac7ad818c26575a10551398725bc39dbe7389525 |
| config | 10 | 34 | 50 | a8622d5b0947de7a97ddb7bb216d921e8ab8612875435ca419470e161954d1fb |
| admin | — | — | 902 | 6b4cdc42f6968c97373b55119e111f1babb5d08958b80f49a002e98717858cc2 |

- **Copy locations.** `git grep -F` over production sources under
  `packages/*/src` and `apps/admin/src` re-confirmed every location listed in
  design Context. Additional hits, outside this change's scope:
  - `contracts/content/entries.ts:177` is the slug query grammar written with
    `(?![\s\S])`, owned by RF3B;
  - `contracts/delivery/build-export.ts:64` is the build-export page limit,
    which keeps its own declared bound;
  - `contracts/builds/build-site.ts:31` and
    `platform-cloudflare/settings.ts:202` are build-site and Pages project
    identifiers, not content grammars;
  - `content/blocks/built-ins.ts:220` and
    `test-utils/repository-contract/sync/evolution.ts:53` are field options of
    200 characters, not the title limit;
  - `admin/entities/content/EmbedUrlPreview.tsx:5` maps provider names to
    labels and is typed by `EmbedProvider`.

## Implementation checks

- **Owners.** `content` exports `FIELD_KEY_PATTERN`/`FIELD_KEY_SOURCE`,
  `BLOCK_TYPE_PATTERN`/`BLOCK_TYPE_SOURCE`, `MODEL_KEY_PATTERN`,
  `MAX_PAGE_SIZE`, `DEFAULT_PAGE_SIZE`, `MAX_DRAFT_MEDIA_REFERENCES`,
  `MAX_LINK_RESOLVE_IDS` and `VIDEO_EMBED_PROVIDERS`; content's exported
  `BLOCK_KEY_PATTERN` is now composed from `BLOCK_TYPE_SOURCE` with the same
  meaning. `domain` exports the five media-tag constants
  (`MEDIA_TAG_PATTERN` keeps the `(?![\s\S])` spelling, so OpenAPI is
  byte-identical) and `access/display-name.ts` (`MAX_DISPLAY_NAME_LENGTH`,
  `normalizeDisplayName`, moved verbatim). Contracts re-exports the media-tag
  constants, `MAX_DISPLAY_NAME_LENGTH`, `MAX_PAGE_SIZE`, `DEFAULT_PAGE_SIZE`
  and `collectionPathFailure`. Application `DISPLAY_NAME_MAX_LENGTH`,
  `normalizeDisplayName`, `CONFIGURATION_SYNC_MAX_MEDIA_REFERENCES` and db
  `SQL_MAX_PAGE_SIZE`, `SQL_MAX_DRAFT_MEDIA_REFERENCES` are aliases. Contracts
  `MAX_COLLECTION_SELECT_VALUES` and `MAX_COLLECTION_QUERY_TEXT` became
  aliases of the new content filter limits.
- **OpenAPI.** After tasks 3.1 and 3.2 the regenerated document was
  byte-identical to the baseline. After 3.3 the JSON diff has exactly two
  changed lines: the `limit` pattern of `GET /api/v1/admin/models/{modelKey}/entries`
  and of `GET /api/v1/admin/media` changed from `^[1-9][0-9]{0,2}$` to
  `^(?:[1-9]|[1-9][0-9]|100)$`, the spelling the tag catalog already used. The
  tag catalog now uses the same `pageLimitQuerySchema`; its output is
  unchanged. Tasks 4.2–5.2 left the document unchanged.
- **Page limits.** `packages/server/src/routes/page-limit.test.ts` pins `422`
  `VALIDATION_FAILED` at `/limit` for `limit=101` and `limit=500` on both
  lists without a store read, `200` for `limit=100` and an omitted limit, and
  50 items for an omitted limit. `packages/contracts/src/shared/page-limit.test.ts`
  pins the grammar to exactly 1–`MAX_PAGE_SIZE`. Both platform repositories
  use `MAX_PAGE_SIZE` for `listSiteBuilds` and `claimSiteBuilds`; the Node and
  D1 repository contracts passed.
- **Public slug.** `public.test.ts` returns `422` at `/slug` for
  `Release_Notes`, `release--notes`, `-release` and a 101-character slug, and
  `404` for an unknown 100-character slug.
- **Filter parity.** `packages/test-utils/src/filters/parity-cases.ts`
  (exported through the new `./filter-parity` subpath, because the admin
  imports it under jsdom) holds 81 cases: every kind and operation, the
  50-value `in` bound, inverted number, date and normalized datetime ranges,
  empty text operands, unknown options, unknown members and presence
  operators on all eight filterable fields. Before any caller changed, the
  application (`ContentUseCases.list`, in test-utils) and the admin
  (`collectionFilterProblem`) produced identical accept and reject results
  for every case, so no owner decision was needed. After both delegated to
  content `fieldFilterValueFailure`, the same table passed against both.
  The portable check takes an optional `fitsTextBudget` callback, because
  `fields/` may not import the list-query policy in `entries/`, and the
  application must keep reporting an over-budget `contains` at `/value`
  before an unknown member. The admin keeps its contracts schema parse first,
  so each admin message is unchanged.
- **Admin support table.** `FieldTypeSupport` gains required
  `groupedControl` and `characterCount` columns; `groupedFieldTypes` and the
  two `FieldRenderer` checks read them. The filter control is derived by
  `fieldFilterControl(type)` from the content filter kind. The two
  `text`/`textarea` checks in `field-types.ts` stay: they are type guards
  that narrow the definition to read `minLength`/`maxLength`.
- **Config.** `structure/canonical.ts` holds one `DISPLAY_ONLY_KEYS` table.
  It has four owners rather than the three named in design decision 5,
  because models strip the shared display keys without the field-only keys.
  The table replaces conditional deletions (`presentation` only on select,
  `itemLabel` only on list, settings `layout` only on group) with
  unconditional ones, which is equivalent for normalized descriptors. All 76
  config cases, including the canonical root-fixture snapshot and every hash
  assertion, passed unchanged.
- **Helpers.** Predicate and value-returning record helpers in application
  (`fields.ts` `object`, `evolution.ts` `record`), admin
  (`composite-values.ts` `record`) and platform-cloudflare
  (`deploy-hook.ts`, `pages-deployments.ts`) call content `isRecord`, which
  additionally requires a plain prototype; their inputs are parsed JSON or
  form values.
- **JSON validators differ.** `tests/json-validator-parity.test.mjs` feeds
  25 edge values to contracts `jsonValueSchema` and content
  `normalizeJsonValue`. They agree on 23. An array with a named property is
  accepted by contracts only; an array with a non-enumerable element is
  accepted by content only. Contracts `isJsonValue` therefore stays, and the
  difference is recorded in the roadmap RF3F section for an owner decision.
  The test is a root test rather than a contracts test because content does
  not export `normalizeJsonValue`.
- **Mirror checks.** `contract-sources.test.ts` enumerates every
  `…Source` type declared by contracts modules and re-exported by the
  contracts entry, and requires that set to equal the `checks` keys, now named
  by type. The enumeration found a twelfth, unchecked type,
  `BuildExportSource`, now checked against `BuildContentExportPage` with
  `nextCursor` omitted. `test-support/mirrors.ts` compares keys both ways,
  optionality, and the declared nested keys (`seo`, `seoDefaults`, `usage`).
  The optionality rule found four drifts, fixed by making the contracts
  inputs match the application results: `ContentModelSource.blockDefinitions`,
  `MediaMetadataDtoSource.tags` (and through it `MediaDetailDtoSource`),
  `PublicEntrySource.internalLinks` and `PublicGlobalSource.internalLinks`
  are now required. Root typecheck passed with no caller change. Six
  deliberately broken fixtures fail with `@ts-expect-error`. Adding
  `export interface ProbeSource` to `contracts/src/media/mappers.ts` failed
  the enumeration test naming `ProbeSource`; the probe was removed. The old
  count test ("contract sources mirror eleven application results") was
  removed, because the enumeration replaces it.
- **Vocabulary guard.** Literal detectors cover the field-key, block-type,
  model-key and media-tag grammars, a title `maxLength` of 200, a page limit
  of 100 next to `limit`, and the provider pair. Slug-grammar exemptions now
  name file and declaration; the admin router exemption was removed with its
  copy. No literal exemption is needed today: the CLI holds no block-type
  copy. Eight scratch-copy cases append one offending line to
  `packages/server/src/routes/media.ts` and expect the file and line.

## Exports and titles after implementation

Runtime keys and declaration names only grew; no name was removed.

| Package | Runtime keys | Declaration names | Added names |
|---|---:|---:|---|
| content | 93 → 108 | 180 → 197 | `BLOCK_TYPE_PATTERN`, `BLOCK_TYPE_SOURCE`, `DEFAULT_PAGE_SIZE`, `FIELD_KEY_PATTERN`, `FIELD_KEY_SOURCE`, `FIELD_PRESENCE_OPERATIONS`, `MAX_DRAFT_MEDIA_REFERENCES`, `MAX_FILTER_SELECT_VALUES`, `MAX_FILTER_TEXT_LENGTH`, `MAX_LINK_RESOLVE_IDS`, `MAX_PAGE_SIZE`, `MODEL_KEY_PATTERN`, `VIDEO_EMBED_PROVIDERS`, `fieldFilterValueFailure`, `filterInstant`; types `FieldFilterValueFailure`, `FieldFilterValueOptions` |
| domain | 75 → 82 | 120 → 127 | five media-tag constants, `MAX_DISPLAY_NAME_LENGTH`, `normalizeDisplayName` |
| contracts | 259 → 268 | 384 → 393 | five media-tag constants, `MAX_DISPLAY_NAME_LENGTH`, `MAX_PAGE_SIZE`, `DEFAULT_PAGE_SIZE`, `collectionPathFailure` |
| application | 140 | 393 | none (aliases keep their names) |
| db | 202 | 241 | none |
| config | 10 | 34 | none (`DISPLAY_ONLY_KEYS` is internal) |

Sorted listed titles of content, domain, application, db and config equal the
baseline. contracts adds the page-limit grammar case and admin adds the
filter parity case. Outside the baselined packages, the session added the
server page-limit and public-slug cases, the test-utils parity, enumeration
and broken-fixture cases, the root JSON-validator parity case and the
vocabulary guard's scratch-copy and owner cases; it removed only the
test-utils count case replaced by the enumeration.

## Root gates

Node 24.22.1, pnpm 12.3.4: `pnpm typecheck` (38 Turbo tasks plus the
project config), `pnpm lint` (including the boundary, admin color and Drizzle
checks), `pnpm format:check`, `pnpm test` (64 Turbo tasks, admin 1008 unit
cases; 36 root files with 326 cases), `pnpm openapi:check` and
`pnpm exec openspec validate rf03e-shared-grammars-limits --type change --strict`
passed. The raw lists and run output were deleted after comparison.
