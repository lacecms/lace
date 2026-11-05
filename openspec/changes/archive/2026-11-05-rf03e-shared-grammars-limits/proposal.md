## Why

RF3B gave the slug grammar, route rules and four transport limits one owner.
The RF4X audit (2026-11-04) found that every other shared grammar and limit is
still copied across packages, and the vocabulary guard cannot see the copies
because it matches declaration names only:

- **Field key** `^[A-Za-z][A-Za-z0-9]*$`: 13 copies outside its private
  content owner. Locations:
  - content `schema-path.ts` and `builders.ts`;
  - config `FIELD_KEY_PATTERN`;
  - application sort grammar;
  - contracts entry sort and filter, collection queries, metadata, two
    OpenAPI strings;
  - db list sort and sync writes;
  - admin editor form.
- **Block type** `^[A-Za-z][A-Za-z0-9-]*$`:
  - content holds it privately;
  - config holds a copy named `BLOCK_KEY_PATTERN`, while content's exported
    `BLOCK_KEY_PATTERN` means a type *or* a ULID instance key;
  - contracts metadata repeats the checks.
- **Model key:** the admin router accepts a leading digit that configuration
  refuses.
- **Media tags.** The grammar and the per-item (20) and filter (5) limits are
  repeated in domain, contracts, server and admin. The 200-code-point
  pre-normalization input bound has no name.
- **Title length (200).** Content exports `MAX_TITLE_LENGTH`, but contracts
  repeats it as seven bare `maxLength(200)`.
- **Page size 1–100, default 50.**
  - The server's `pagination()` enforces it.
  - The contracts entry-list and media-list query schemas, and therefore
    OpenAPI, describe 1–999.
  - The bound is also repeated in db, application, MCP arguments and the SDK.
- **Draft media references (200):** db, an application constant and two
  application literals.
- **Link-resolve batch (200):** application, db and contracts.
- **Display name (120, no control characters):** contracts and application.
- **Video embed providers** `youtube`/`vimeo`: content builders, the built-in
  blocks and OpenAPI.

Related duplicates found by the same audit:

- Admin field-type subsets live outside `fieldTypeSupport`.
- Presence filter operators (`isSet`/`isNotSet`) are added by hand in
  application and admin.
- Filter value checks are written twice: application `collection-queries.ts`
  and admin `collection-query.ts`.
- Config strips display-only descriptor keys in three lists.
- `isRecord` is renamed and copied in application, admin and
  platform-cloudflare.
- Contracts `isJsonValue` and content `normalizeJsonValue` validate JSON
  separately.
- The `*Source` mirror checks are a hand-kept list of 11 with one-way,
  top-level key comparison.

This is Session RF3E of `docs/refactoring-roadmap.md`, added by the second
audit follow-up (2026-11-05). It precedes RF3F and RF5. It touches behavior
only where the contract and OpenAPI descriptions disagree with what the server
enforces.

## What Changes

- **New owners in `@lacecms/content`:**
  - `FIELD_KEY_PATTERN` (now exported);
  - `BLOCK_TYPE_PATTERN`;
  - `MODEL_KEY_PATTERN` (moved from config);
  - the string sources of the field-key and block-type grammars, for OpenAPI
    and the `-?field:<key>` sort grammar;
  - `MAX_PAGE_SIZE` (100) and `DEFAULT_PAGE_SIZE` (50);
  - `MAX_DRAFT_MEDIA_REFERENCES` (200);
  - `MAX_LINK_RESOLVE_IDS` (200);
  - `VIDEO_EMBED_PROVIDERS`.
- **New owners in `@lacecms/domain`,** beside the existing tag normalization
  and the `access/` account rules:
  - `MEDIA_TAG_PATTERN`;
  - `MAX_MEDIA_TAG_LENGTH` (40);
  - `MAX_MEDIA_TAG_INPUT_LENGTH` (200, before normalization);
  - `MAX_MEDIA_TAGS_PER_ITEM` (20);
  - `MAX_MEDIA_TAG_FILTERS` (5);
  - `MAX_DISPLAY_NAME_LENGTH` (120) and `normalizeDisplayName`.
- **Every copy imports the owner.**
  - Existing public names stay as aliases: application
    `DISPLAY_NAME_MAX_LENGTH` and `CONFIGURATION_SYNC_MAX_MEDIA_REFERENCES`,
    db `SQL_MAX_PAGE_SIZE` and `SQL_MAX_DRAFT_MEDIA_REFERENCES`.
  - Config's internal `BLOCK_KEY_PATTERN` copy is replaced by
    `BLOCK_TYPE_PATTERN`. Content's exported `BLOCK_KEY_PATTERN` keeps its
    meaning.
  - Contracts re-exports the media-tag limits for the admin, which may not
    import domain.
- **One page-limit schema.**
  - Contracts gains one page-limit schema accepting 1–100, used by the
    admin entry-list and media-list query schemas.
  - The server's `pagination()` uses the same constants.
  - **Generated OpenAPI changes:** the two list `limit` parameters are
    described as 1–100 instead of 1–999. Requests are unaffected, because
    the server already rejects 101–999 with `422 VALIDATION_FAILED` at
    `/limit` (owner decision 2026-11-05: the server's range is canonical).
- **Correction to the roadmap text.** The media-upload OpenAPI tag
  `maxLength: 200` is not drift. The accepted `rest-contracts` requirement
  bounds each raw tag part at 200 code points *before* normalization to at
  most 40. It stays, now named by `MAX_MEDIA_TAG_INPUT_LENGTH`.
- **One filter-value check.**
  - Content gains `FIELD_PRESENCE_OPERATIONS` (`isSet`, `isNotSet`) and one
    portable `fieldFilterValueFailure`.
  - Application and admin delegate to it. A parity table pins identical
    accept and reject results for every filter kind and operation.
  - `FIELD_FILTER_OPERATIONS` and every output derived from it are
    unchanged.
- **Admin support table.** `groupedFieldTypes` and the counted text types
  become `fieldTypeSupport` columns. The admin filter control is derived from
  the content filter kind instead of declared per type.
- **Config display-only keys.** The three key lists become one table keyed by
  descriptor owner. Structure hashes stay byte-identical.
- **Public slug length.** The public collection route checks the full slug
  rule, so an over-long slug returns the existing `422` at `/slug` instead of
  a lookup miss. This conforms to the accepted RF3B "Reject a malformed slug
  everywhere" scenario.
- **Helper copies.**
  - Predicate copies of `isRecord` in application, admin and
    platform-cloudflare import the content helper; non-predicate helpers keep
    their names.
  - Contracts `isJsonValue` delegates to content, but only if a parity test
    shows identical accepted sets.
  - CLI copies wait for RF7C, because the CLI may not import content.
- **Total mirror checks.**
  - Every contracts export whose name ends in `Source` must appear in the
    mirror check list.
  - Properties are compared both ways, including optionality.
  - The nested `seo`, `seoDefaults` and `usage[]` shapes are compared.
- **Vocabulary guard.** `tests/shared-vocabulary.test.mjs` detects these
  grammar literals and the named numeric limits by pattern. Its exemptions
  name a symbol, not an exact source line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-domain-rules`: the "defined once" requirement extends to the new
  grammars and limits, with media-tag and display-name rules owned by the
  domain package.
- `rest-contracts`: one page-limit bound for list queries and their OpenAPI.
  The projection-coverage requirement becomes total (enumerated, two-way,
  nested).
- `collection-query-options`: filter values are checked by one portable
  function in every layer.

## Impact

- **Roadmap.** Implements RF3E. Depends on RF3A–RF3D, RF4G (domain `access/`
  and `media/` directories) and RF4X guards. Precedes RF3F.
- **Code.**
  - `packages/content`, `domain`, `config`, `application`, `contracts`,
    `db`, `server`, `mcp`, `sdk` (limit import), `platform-cloudflare`
    (`isRecord`);
  - `apps/admin` (router, field-types, collection-query, media-tags, editor
    form);
  - `tests/shared-vocabulary.test.mjs`;
  - `packages/test-utils` mirror checks.
- **API.** `apps/api/openapi/api-v1.json` changes only in the two list
  `limit` parameter descriptions. No request or response behavior changes.
- **Dependencies.** None added.
