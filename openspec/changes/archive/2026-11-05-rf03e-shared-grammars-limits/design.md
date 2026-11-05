## Context

See proposal.md (Why). Re-measured at commit `24f6ad1b` (after RF4G).

- **Package boundaries** (`scripts/check-boundaries.mjs`):
  - `content` is importable by every package except `cli` and `server`.
    `server` reaches it through `contracts` and `application`, and `cli`
    through `contracts`/`config`/`application`.
  - `domain` is importable by `application`, `contracts`, `db`, `mcp`,
    `auth` and the platforms. It is not importable by the admin (allowed:
    `contracts`, `content`) or `sdk` (allowed: `contracts`).
- **Grammar copies** (file:line at the base commit):
  - Field key:
    - content `fields/definitions.ts:368` (owner, unexported),
      `fields/schema-path.ts:3`, `fields/builders.ts:61`;
    - config `shared/assertions.ts:5`;
    - application `content/use-cases.ts:259` (sort);
    - contracts `content/entries.ts:90,96`, `content/collection-queries.ts:43`,
      `content/metadata.ts:39`, `openapi/field-openapi.ts:48,68`;
    - db `content/collection-list.ts:60`, `sync/writes.ts:4`;
    - admin `entities/content/editor-form.ts:435`.
  - Block type: content `blocks/definition.ts:33` (owner, unexported),
    config `shared/assertions.ts:7` (named `BLOCK_KEY_PATTERN`), contracts
    `content/metadata.ts`, CLI `blocks-*.ts` (with a 64-character cap).
  - Model key: config `shared/assertions.ts:3` (`STABLE_KEY_PATTERN`) and
    admin `app/router/router.ts:40`, which allows a leading digit.
- **Limits:**
  - Media tag grammar: domain `media/metadata.ts:36`, contracts
    `media/metadata.ts:48`, `media/queries.ts:80`.
  - 20 tags per item: domain, contracts, server `routes/media.ts:103`,
    admin `media-tags.ts:4`.
  - 5 filter tags: contracts `media/queries.ts:70`, db `media/tags.ts:10`,
    admin `media-tags.ts:6`.
  - Upload tag part 200 before normalization: server `routes/media.ts:107`,
    which the spec requires.
  - Title 200: contracts ×7 (`entries.ts:30,122`, `entry-requests.ts:14`,
    `links.ts:59,96`, `delivery/public.ts:28`, `media/metadata.ts:106`).
  - Page size:
    - server `shared/request.ts:17-20` (1–100, default 50, used by every
      admin and public list route);
    - contracts `content/entries.ts:162` and `media/queries.ts:98`
      (`^[1-9][0-9]{0,2}$`, which is the OpenAPI);
    - `mcp-arguments.ts:18`;
    - db `shared/limits.ts:4`;
    - application `media/use-cases.ts:492` (tag catalog);
    - platform repositories `limit > 100`;
    - sdk `client.ts:215`.
  - Draft media references 200: db `shared/limits.ts:8`, application
    `configuration/limits.ts:9`, `content/use-cases.ts:603`,
    `configuration/evolution.ts:747`.
  - Link-resolve IDs 200: application `content/internal-links.ts:24`, db
    `links/reader.ts:157`, contracts `content/links.ts:29`.
  - Display name 120: contracts `accounts/invitations.ts:13-22`, application
    `accounts/use-cases.ts:23,140-147`.
  - Video providers: content `fields/builders.ts:243-247`,
    `blocks/built-ins.ts:124,305`, contracts `openapi/field-openapi.ts:30`.
- **Filter checks:** application `content/collection-queries.ts:95-170` and
  admin `entities/content/collection-query.ts:40-75`. Both special-case
  `isSet`/`isNotSet`.

## Goals / Non-Goals

**Goals:**

- One declaration per grammar and limit in the lowest package allowed to own
  it. Every listed copy imports it or derives from it.
- The guard fails when a copy reappears.
- Accepted and rejected values stay the same in every layer. The only
  observable differences:
  - the two OpenAPI `limit` descriptions;
  - the admin router no longer matching digit-led model keys;
  - a public collection slug over 100 characters returning `422` (conformance
    with the accepted RF3B scenario, decision 2a).
- Mirror checks become total.

**Non-Goals:**

- Error-code changes (RF3F).
- CLI copies (RF7C).
- Making the CLI's 64-character block-name cap a content rule. It remains a
  registry naming rule.

## Decisions

### 1. Owners and exported names

- **`content/src/shared/identifiers.ts`** gains:
  - `MODEL_KEY_PATTERN`;
  - `MAX_PAGE_SIZE = 100` and `DEFAULT_PAGE_SIZE = 50`;
  - `MAX_LINK_RESOLVE_IDS = 200`.
- **`fields/definitions.ts`** exports `FIELD_KEY_PATTERN` and
  `FIELD_KEY_SOURCE` (the regex source, without anchors, for OpenAPI strings
  and the `^-?field:` sort grammar).
- **`blocks/definition.ts`** exports `BLOCK_TYPE_PATTERN` and
  `BLOCK_TYPE_SOURCE`.
- **`fields/video-embeds.ts`** exports
  `VIDEO_EMBED_PROVIDERS: readonly EmbedProvider[]`.
- **`entries/aggregate.ts`** exports `MAX_DRAFT_MEDIA_REFERENCES = 200`
  beside `MAX_TOP_LEVEL_BLOCKS`.
- **`domain/src/media/metadata.ts`** exports `MEDIA_TAG_PATTERN`,
  `MAX_MEDIA_TAG_LENGTH`, `MAX_MEDIA_TAG_INPUT_LENGTH`,
  `MAX_MEDIA_TAGS_PER_ITEM` and `MAX_MEDIA_TAG_FILTERS`. `normalizeMediaTag`
  and `normalizeMediaTags` use them.
- **`domain/src/access/display-name.ts`** (new) exports
  `MAX_DISPLAY_NAME_LENGTH` and `normalizeDisplayName`, moved verbatim from
  application.
- **Contracts** re-exports the five media-tag constants and
  `MAX_DISPLAY_NAME_LENGTH` for the admin, as it already re-exports
  `SLUG_PATTERN`.
- **Existing public names** stay as aliases of the new owners, so package
  export lists only grow:
  - application `DISPLAY_NAME_MAX_LENGTH`, `normalizeDisplayName` and
    `CONFIGURATION_SYNC_MAX_MEDIA_REFERENCES`;
  - db `SQL_MAX_PAGE_SIZE` and `SQL_MAX_DRAFT_MEDIA_REFERENCES`.
  - Packaged export tests are updated for the added names only.
- **Config** imports the patterns and deletes `FIELD_KEY_PATTERN`,
  `BLOCK_KEY_PATTERN` and `STABLE_KEY_PATTERN` from `shared/assertions.ts`.
  They are internal and not exported by the package entry.

*Alternative:* put media tags and display names in content. Rejected:
`normalizeMediaTag` and the account rules already live in domain (RF4G
`media/`, `access/`). Moving them down would move behavior across packages for
no consumer that needs it, and the admin receives them through contracts.

### 2. Page limit

- **Contracts.** `shared/` gains `pageLimitQuerySchema`, a string grammar for
  1–`MAX_PAGE_SIZE` written as `^(?:[1-9]|[1-9][0-9]|100)$`, the same form
  as the existing tag-catalog limit. The entry-list and media-list query
  schemas use it.
- **Server.** `pagination()` uses `DEFAULT_PAGE_SIZE` and `MAX_PAGE_SIZE`
  through a contracts re-export, with its message unchanged.
- **Other copies:**
  - MCP arguments, db and both platform repositories import the constant;
  - the sdk imports it from contracts;
  - the application tag catalog uses its own limit, which equals the shared
    one in value, through the constant.
- **Unchanged:** the build export (`MAX_BUILD_EXPORT_PAGE_SIZE`, its own
  default 100) and internal-link pages (1–50) keep their declared limits.
- **Verification.** `pnpm openapi:generate` changes exactly the two `limit`
  patterns, which the verification note checks with a JSON diff.

### 2a. Public collection slug

`server/src/routes/public.ts:130-134` tests `SLUG_PATTERN` and substitutes
`:slug` itself, so a 101-character slug passes the grammar and becomes a
lookup miss. The route uses content `collectionPathFailure` instead. Every
malformed slug, including an over-long one, returns the existing
`422`/`/slug` envelope, as the accepted "Reject a malformed slug everywhere"
scenario already requires. This conformance fix is the only response change
in this session, and a server test pins it.

### 3. Filter value check

Content `fields/filter-values.ts` (new) exports:

- `FIELD_PRESENCE_OPERATIONS`;
- `fieldFilterValueFailure(kind, filter, options)`, which returns `undefined`
  or a failure tag `{ path: "op" | "value" | …; reason }`.

The application maps the tag to its existing pointer and failure, and the
admin maps it to its existing message. The rules come from the application
implementation, the server authority.

Before switching either caller, a parity table
`test-utils/src/filters/parity-cases.ts` is run against both current
implementations. It is exported through a new `./filter-parity` subpath only
if admin tests need it under jsdom, as `./visibility-parity` is. If they differ, the session stops for an owner decision on
which result is correct.

### 4. Admin support table

- `FieldTypeSupport` gains `groupedControl: boolean` (media, richText) and
  `characterCount: boolean` (text, textarea).
- `groupedFieldTypes` and the three `type === "text" || "textarea"` checks
  read the table.
- `filter.control` becomes a `Record<FieldFilterKind, FilterControl>`
  indexed by `fieldTypeCapabilities[type].filterKind`, so a filter kind
  cannot drift from its control.

### 5. Config display-only keys

`structure/canonical.ts` replaces its three strip lists with one
`DISPLAY_ONLY_KEYS: Record<"field" | "block" | "setting", readonly string[]>`.
The canonical root-fixture snapshot and structure hashes must stay
byte-identical; config tests prove it.

### 6. Helper copies and JSON validation

- **`isRecord`.** Predicate copies (`application/configuration/fields.ts`
  `object`, `apps/admin/.../composite-values.ts`, platform-cloudflare
  predicates) import content `isRecord`. Helpers that return a value instead
  of narrowing (`evolution.ts` `record`, `pages-deployments.ts` `record`)
  keep their names but call `isRecord`.
- **JSON validation.** A contracts test feeds both validators a fixed edge
  table: sparse arrays, accessors, prototypes, non-finite numbers, cycles,
  `-0`, `__proto__` keys. If the accepted sets are equal, contracts
  `isJsonValue` delegates to content. If not, it stays, and the difference is
  recorded in the verification note and the roadmap for RF3F.

### 7. Total mirror checks

- **Enumeration.** `packages/test-utils/src/contract-sources.test.ts` scans
  the contracts source modules for exported interfaces and type aliases whose
  names end in `Source`, keeping those re-exported by the contracts entry. It
  asserts that this set equals the keys of its `checks` record, and runs as an
  ordinary source test with no build.
- **Recursive `Mirrors`.** A recursive `Mirrors<Application, Source, Omitted>`
  type compares keys both ways, and optionality via `{} extends Pick<…>`. It
  recurses into the declared nested paths (`seo`, `seoDefaults`,
  `usage[number]`).
- **Self-test.** A type test with deliberately broken fixtures asserts the
  failures with `@ts-expect-error`.

### 8. Vocabulary guard

`tests/shared-vocabulary.test.mjs` gains literal detectors. Each production
file under `packages/*/src` and `apps/admin/src` outside the declared owner
must not contain:

- the field-key, block-type, model-key or media-tag regex sources;
- `maxLength(200)`/`maxLength: 200` next to a `title` key;
- `> 100` or `maxValue(100)` next to a `limit` identifier;
- the provider pair literal.

Exemptions are keyed by `file + symbol` (for example the upload tag input
bound, now a named constant), not by exact line text. Negative cases run the
guard against scratch copies.

## Risks / Trade-offs

- **[Regex `source` reuse changes escaping in OpenAPI strings.]** → The
  OpenAPI JSON diff must show no change except the two `limit` patterns.
- **[Application and admin filter checks disagree today.]** → Decision 3
  stops before switching, so behavior never changes silently.
- **[Type-only exports are invisible at runtime.]** → Decision 7 reads the
  contracts source declarations instead of a runtime namespace. The test fails
  if the list and the checks diverge.
- **[Guard false positives]**, for example `maxLength(200)` on a link-resolve
  array. → Detectors are keyed to a nearby property name, and remaining hits
  are named constants.

## Migration Plan

Repository and OpenAPI description only. No stored data, migration or
request behavior changes. Rollback is a revert.
