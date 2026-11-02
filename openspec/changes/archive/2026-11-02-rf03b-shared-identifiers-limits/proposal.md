## Why

Identifier rules, model kinds, transport limits and small object helpers are
declared several times. Slug and route checking exists twice:
`packages/config/src/index.ts` (`assertCanonicalRouteValue`,
`normalizePagePath`, `normalizeCollectionRoute`, `resolveCollectionRoute`)
and `packages/domain/src/index.ts` (`assertCanonicalPath`,
`normalizePagePublicPath`, `normalizeCollectionPublicRoute`,
`resolveCollectionPublicPath`). The two copies have already drifted in one
message and in how they reject non-strings. `SLUG_PATTERN` is declared in
config and domain, and written inline in server and contracts.
`ContentModelKind` is declared in content and domain. Application and
contracts each declare the entry search, media search, media usage and
build-export page limits, and the entry search limit has a different name in
each. `deepFreeze` and `isPlainObject` are private copies in content, config
and domain. The eleven contracts `*Source` interfaces are hand-copied from
application result types and nothing checks them: application
`discoverModels` already emits `visibility`, which `DiscoveredContentModel`
does not declare, and `toContentModelDto` would silently drop any new
optional model property. This is Session RF3B of
[`docs/refactoring-roadmap.md`](../../../../docs/refactoring-roadmap.md), second
of Step RF3 (shared vocabulary). It precedes the RF4 file splits so that they
move one definition, not two to four.

## What Changes

- **Identifiers in `@lacecms/content`.** A new `identifiers.ts` module,
  re-exported from the package index, owns `SLUG_PATTERN`, `MAX_SLUG_LENGTH`
  (moved from `index.ts`), `isContentSlug` (moved from domain),
  `ContentModelKind`, and one set of canonical route checks: page path,
  collection route with exactly one `:slug`, and collection path resolution.
  The checks report a failure reason with one shared message wording. Config
  and domain keep their exported functions, names and error classes
  (`ConfigurationError`, `DomainError` with `CONTENT_INVALID_STATE`) and
  become thin wrappers.
- **Transport limits in `@lacecms/content`.** `MAX_ENTRY_SEARCH_LENGTH` (200),
  `MAX_MEDIA_SEARCH_LENGTH` (200), `MAX_MEDIA_USAGE_ENTRIES` (50) and
  `MAX_BUILD_EXPORT_PAGE_SIZE` (100) are declared once. Application and
  contracts re-export them under their current public names; application's
  `MAX_CONTENT_ENTRY_SEARCH_LENGTH` becomes an alias of
  `MAX_ENTRY_SEARCH_LENGTH`. The contracts entry `slug` query schema uses
  `MAX_SLUG_LENGTH` instead of the literal `100`.
- **Public export lists outside content stay the same**, except that
  contracts adds a re-export of `SLUG_PATTERN`. Server uses it in place of
  its inline regex, because server may not import content or domain.
  Domain re-exports `ContentModelKind` and `isContentSlug`.
- **Object helpers in `@lacecms/content`.** A new `objects.ts` module exports
  `deepFreeze`, `isPlainObject` and `isRecord`. The private copies in
  content, config and domain are deleted.
- **Correction to the roadmap text: `fail` stays local.** Each package's
  `fail` throws its own error class (`FieldConfigurationError`,
  `ConfigurationError`, `DomainError` with a code, `BlockMigrationError`).
  A shared `fail` would need either one error class, which is RF3D's error
  model, or a factory that saves nothing. The one-line local helpers stay
  until RF3D (`design.md` decision 5).
- **Checked `*Source` mirrors.** A new
  `packages/test-utils/src/contract-sources.test.ts` checks at compile time
  each of the eleven application→contracts pairs. The application type must
  be assignable to its contracts source. Every application key must exist in
  the source or be listed as intentionally omitted. Every source key must
  exist in the application type. `DiscoveredContentModel` gains the
  `visibility` property that `discoverModels` already returns.
- **Total content-model DTO projection.** `toContentModelDto` is built from
  one projection table keyed by every `ContentModelSource` key. A contracts
  test asserts that the table keys equal the `contentModelSchema` keys, so a
  new optional property fails to compile or fails a test instead of dropping
  out of the DTO.
- **Vocabulary guard.** A root test rejects a second declaration of any moved
  symbol and the inline slug regex outside content. Two different identifiers
  that happen to share the slug grammar are allowlisted with reasons.
- **Documentation.** Architecture §6 *Repository structure* gains the rule
  that content owns the shared vocabulary. §8 *MVP content limits* lists the
  transport limits. The roadmap baseline row for slug/route canonicalization
  moves to its new value.

Non-goals: conditional visibility (RF3C); error classes, `fail` and the
error mapper (RF3D); stable-key, field-key and block-key patterns, which
already have one definition in config; build site id and admin model-key
patterns, which share the slug grammar but name different identifiers;
the strict-end (`(?![\s\S])`) spelling of the contracts slug query pattern,
which keeps `apps/api/openapi/api-v1.json` unchanged; splitting
`packages/content/src/index.ts` (RF4A). No accepted value, status code,
response shape, SQL, cursor or OpenAPI document changes. Domain route
failure messages are never sent to clients, because `classifyError` returns
the generic code message. No migration and no template version bump.

Depends on RF2A (source tests in `content`, `config`, `domain`,
`contracts`) and RF3A, both archived.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-domain-rules`: the portable vocabulary requirement names the
  third model kind (`global`), which the accepted text omits. A new
  requirement states that slug grammar, route canonicalization, model kinds
  and transport limits have one portable definition. Configuration
  validation, the domain, application, transports and the admin apply the
  same grammar and bounds through it.
- `rest-contracts`: a new requirement that contract projections of
  application results stay complete. Each projected application property
  reaches its DTO or is declared as intentionally omitted, and this is
  checked when the code is built.

## Impact

- Architecture: §6 *Repository structure* rules (content owns shared
  vocabulary; other packages import or re-export it); §8 *MVP content
  limits* (transport limits). No dependency-direction change: config,
  domain, application and contracts already depend on `@lacecms/content`,
  and test-utils already depends on application and contracts.
- Code: `packages/content/src/{identifiers.ts,objects.ts,index.ts}`;
  `packages/config/src/index.ts`; `packages/domain/src/index.ts`;
  `packages/application/src/{index.ts,content-use-cases.ts}`;
  `packages/contracts/src/index.ts`; `packages/server/src/app.ts` (one
  inline regex); `packages/test-utils/src/contract-sources.test.ts`; a new
  root `tests/shared-vocabulary.test.mjs`; packaged export lists of
  `content` and `contracts`.
- Public exports: `@lacecms/content` adds `SLUG_PATTERN`, `isContentSlug`,
  the route checks, the four transport limits and the three object helpers.
  `@lacecms/contracts` adds `SLUG_PATTERN`. Export lists of `config`,
  `domain` and `application` are unchanged.
- Runtime behavior: none observable. The existing config, domain,
  application and contracts suites pass. One domain-internal message
  changes from "and no others" to "and no other parameters"; no test or
  client depends on it.
- Dependencies: none added.
