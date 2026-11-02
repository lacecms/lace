## Context

See `proposal.md` (Why). Copies observed on commit `68909c66`:

| Symbol or rule | Declarations today |
| --- | --- |
| Slug grammar | `config/src/index.ts:37` and `domain/src/index.ts:10` (`SLUG_PATTERN`); inline in `server/src/app.ts:2740`; strict-end spelling in the contracts entry `slug` query schema (`contracts/src/index.ts:796`, together with `maxLength(100)`) |
| `MAX_SLUG_LENGTH` | `content/src/index.ts:3513` (config and domain already import it) |
| `isContentSlug` | `domain/src/index.ts:508` (used by `application/src/content-use-cases.ts`) |
| `ContentModelKind` | `content/src/index.ts:3520` and `domain/src/index.ts:24`; contracts imports the domain one |
| Canonical route checks | config `assertCanonicalRouteValue` / `normalizePagePath` / `normalizeCollectionRoute` / `resolveCollectionRoute` (lines 488–546); domain `assertCanonicalPath` / `normalizePagePublicPath` / `normalizeCollectionPublicRoute` / `resolveCollectionPublicPath` (lines 466–527) |
| Entry search length (200) | contracts `MAX_ENTRY_SEARCH_LENGTH`; application `MAX_CONTENT_ENTRY_SEARCH_LENGTH` (used by `db/src/sql-content.ts`) |
| Media search length (200), media usage entries (50) | contracts and application, both public |
| Build-export page size (100) | contracts and application, both public |
| `deepFreeze` | content, config, domain (identical bodies) |
| `isPlainObject` | content, config (identical) |
| `isRecord` | content only |
| `fail` | content (`FieldConfigurationError`, plus a closure in `migrateBlockData` throwing `BlockMigrationError`), config (`ConfigurationError`), domain (`DomainError` with a code) |

The route twins differ in two ways. Config first rejects non-strings with
"`<name>` must be a string.", while domain folds them into "must be a canonical
absolute path.". Their slug-segment messages also differ ("no other
parameters." vs "no others."). Domain messages never reach clients:
`classifyError` maps `DomainError` to `domainErrorMessage[code]` for every
class except `BlockOrderError`. No test asserts either differing message.

The eleven application→contracts pairs:

| Application type | Contracts source |
| --- | --- |
| `DiscoveredContentModel` (`application/src/content-use-cases.ts`) | `ContentModelSource` |
| `config` `CollectionListOptions` (via `DiscoveredContentModel.listOptions`) | `CollectionListOptionsSource` (`contracts/src/collection-queries.ts`) |
| `ContentEntrySummary` | `ContentEntrySummarySource` |
| `ImportTokenMetadata` | `ImportTokenDtoSource` |
| `MediaView` (`media-use-cases.ts`) | `MediaMetadataDtoSource` |
| `MediaDetailView` | `MediaDetailDtoSource` |
| `MediaUsageLocation` | `MediaUsageLocationDtoSource` |
| `PublicContentEntry` | `PublicEntrySource` |
| domain `MediaMetadata` (via `PublicContentEntry.media`) | `PublicMediaSource` |
| `PublicGlobalContent` | `PublicGlobalSource` |
| `BuildContentExportPage` | `BuildExportPageSource` (extends `BuildExportSource`) |

`discoverModels` returns `visibility`, and `ContentModelSource` and
`contentModelSchema` declare it, but `DiscoveredContentModel` does not. The
property survives only because the object literal is built inside `.map`,
where excess-property checking does not apply.

Dependency edges are already in place. Config, domain, application and
contracts depend on content; test-utils depends on application, config,
content, contracts and domain. Server may not import content or domain in
production code (architecture §6).

## Goals / Non-Goals

**Goals:**

- One declaration per symbol listed above, in `packages/content`, except
  `fail` (decision 5). Every other site imports it or re-exports it.
- Config and domain keep their exported function names, signatures and error
  classes, so their test suites pass without edits.
- The eleven mirrors and the content-model projection fail typechecking or a
  test when they fall out of step.

**Non-Goals:**

- Changing any accepted or rejected value, status code, pointer, SQL,
  cursor, response shape or `api-v1.json`.
- Moving `STABLE_KEY_PATTERN`, `FIELD_KEY_PATTERN` or `BLOCK_KEY_PATTERN`
  (one definition each, in config).
- Making contracts projections generic or generated; only the content-model
  projection becomes table-driven.

## Decisions

### 1. Two new content modules, re-exported from the index

`packages/content/src/identifiers.ts` holds `SLUG_PATTERN`,
`MAX_SLUG_LENGTH`, `isContentSlug`, `ContentModelKind`, the route checks and
the four transport limits. `packages/content/src/objects.ts` holds
`deepFreeze`, `isPlainObject` and `isRecord`. `index.ts` re-exports both with
`export * from`, as it already does for `internal-links.ts`,
`video-embeds.ts` and `list-query-policy.ts`, and imports the helpers it
uses. RF4A will split `index.ts` along the same lines, so these modules are
its first pieces rather than more lines in a 3,800-line file.

Alternative: declare everything in `index.ts`. Rejected because RF4A would
move it again.

### 2. Route checks return a reason; callers throw their own error

```ts
export type RouteIssue =
  | "type"            // not a string
  | "canonical"       // empty, relative, ?, #, \, whitespace, //, trailing /
  | "dot-segment"
  | "parameter"       // page path with a ':' segment
  | "slug-segment"    // collection route without exactly one :slug, or with another parameter
  | "slug";           // invalid slug during resolution

export interface RouteFailure { readonly issue: RouteIssue; readonly message: string }

export function pagePathFailure(path: unknown, name?: string): RouteFailure | undefined;
export function collectionRouteFailure(route: unknown, name?: string): RouteFailure | undefined;
export function collectionPathFailure(route: unknown, slug: unknown):
  { readonly path: string } | RouteFailure;
```

Each failure carries its message, so there is one wording. The wording is
config's, which is the more precise one: "`<name>` must be a string.",
"`<name>` must be a canonical absolute path.", "`<name>` must not contain dot
segments.", "path must not contain parameter segments.", "route must contain
exactly one :slug segment and no other parameters.", "slug must use lowercase
ASCII letters, digits, and single hyphens.". `name` defaults to `"path"` for
pages and `"route"` for collections, as at every current call site.

Config wrappers: `normalizePagePath(path)` calls `pagePathFailure` and, on a
failure, calls `fail(failure.message)` (`ConfigurationError`). Domain
wrappers do the same with `fail("CONTENT_INVALID_STATE", failure.message)`.
Domain's two message changes (non-string, slug segment) are internal, as
shown in Context. `resolveCollectionRoute` and `resolveCollectionPublicPath`
use `collectionPathFailure`. `isContentSlug` keeps its current semantics:
it does not check `length > 0`, because the pattern already requires at least
one character.

Alternative: content throws a neutral `RouteError` that config and domain
catch and rethrow. Rejected because it adds a fourth error convention just
before RF3D and needs try/catch at every call site. A reason value is
cheaper and RF3D can map it directly.

Alternative: config and domain call one throwing function and accept its
error class. Rejected: config's suite asserts `ConfigurationError`, and
domain callers rely on `DomainError.code`.

### 3. Limits: canonical names in content, public names kept by re-export

Content declares `MAX_ENTRY_SEARCH_LENGTH`, `MAX_MEDIA_SEARCH_LENGTH`,
`MAX_MEDIA_USAGE_ENTRIES` and `MAX_BUILD_EXPORT_PAGE_SIZE`, each with its
current doc comment. Contracts replaces its four declarations with
`export { … } from "@lacecms/content"`. Application does the same and keeps
`MAX_CONTENT_ENTRY_SEARCH_LENGTH` as
`export { MAX_ENTRY_SEARCH_LENGTH as MAX_CONTENT_ENTRY_SEARCH_LENGTH }`, so
`db`, test-utils, platforms and admin need no import changes. Export lists of
application and contracts therefore stay the same.

The contracts entry `slug` query schema replaces `v.maxLength(100)` with
`v.maxLength(MAX_SLUG_LENGTH)` and keeps its strict-end regex
`(?![\s\S])`, which every contracts query pattern uses and which
`api-v1.json` records. A contracts test asserts that this regex and
`SLUG_PATTERN` give the same verdict on a corpus of valid and invalid slugs,
including a trailing newline. The two spellings cannot drift without that
test failing. Generated OpenAPI is byte-identical (`pnpm openapi:check`).

### 4. Re-exports only where a consumer needs them

- Domain: `export type { ContentModelKind } from "@lacecms/content"` and
  `export { isContentSlug } from "@lacecms/content"`. Its private
  `SLUG_PATTERN` and `deepFreeze` are deleted.
- Config: imports `SLUG_PATTERN`, the route checks, `deepFreeze` and
  `isPlainObject`, and adds no exports. Config never exported
  `ContentModelKind`.
- Contracts: `export { SLUG_PATTERN } from "@lacecms/content"`, the one new
  export outside content. Server replaces the inline regex at `app.ts:2740`
  with `SLUG_PATTERN.test(slug)`, with no length check added, so behavior is
  identical. Server may import contracts but not content or domain.
  Contracts switches its `ContentModelKind` import from domain to content.

The roadmap says the four packages "re-export them". We read that as: keep
every existing public name and add a re-export only where a consumer needs
it. Re-exporting everything from every package would grow four public
surfaces for no consumer.

### 5. `fail` is not shared (correction to the roadmap text)

The five `fail` helpers are one-line throws of four different error classes,
one of them with a code argument and one a closure over migration context.
A shared version would be either `failWith(ErrorClass)`, which saves one line
per package and adds an indirection to every stack trace, or a single error
class, which is RF3D's job. They stay local, and RF3D replaces them when
`LaceError` lands. `deepFreeze`, `isPlainObject` and `isRecord` move as
planned.

### 6. Mirror checks: one generic assertion per pair in test-utils

`packages/test-utils/src/contract-sources.test.ts` (typechecked by
`tsconfig.test.json` through the package `typecheck` script):

```ts
type Mirrors<App, Source, Omitted extends keyof App = never> =
  [App] extends [Source]
    ? [Exclude<keyof App, keyof Source | Omitted>] extends [never]
      ? [Exclude<keyof Source, keyof App>] extends [never]
        ? true
        : { sourceOnly: Exclude<keyof Source, keyof App> }
      : { unprojected: Exclude<keyof App, keyof Source | Omitted> }
    : { notAssignable: [App, Source] };

const checks = {
  contentModel: true satisfies Mirrors<DiscoveredContentModel, ContentModelSource>,
  publicMedia: true satisfies Mirrors<MediaMetadata, PublicMediaSource,
    "createdAt" | "createdBy" | "filename" | "sha256" | "size" | "status" | "storageKey" | "tags" | "updatedAt">,
  // … eleven entries
} as const;
test("contract sources mirror application results", () => {
  expect(Object.keys(checks)).toHaveLength(11);
});
```

A failure names the offending keys in the type error. For union types
(`MediaUsageLocation`), the check applies per discriminant member through a
distributive helper. The omitted lists are written down during
implementation, one per pair. Each entry needs a reason comment. Expected
non-empty lists: public media (above), and possibly public entry or global
if their `internalLinks` optionality differs. If a source key is missing in
the application type, the application type is fixed, never the check. This
is how `visibility?: FieldVisibility` is added to `DiscoveredContentModel`.

Alternative: put the checks in contracts or application. Rejected: the
boundary forbids each from importing the other, and test-utils is the one
package allowed to see both (roadmap RF3B).

### 7. Content-model projection table

```ts
const contentModelProjection = {
  blockDefinitions: (m) => m.blockDefinitions && [...m.blockDefinitions],
  blocks: (m) => [...m.blocks],
  // … one entry per key, returning undefined to omit
  visibility: (m) => m.visibility && normalizeFieldVisibility(m.visibility, m.fields)!,
} satisfies { readonly [K in keyof ContentModelSource]-?: (m: ContentModelSource) => unknown };

export function toContentModelDto(model: ContentModelSource): ContentModelDto {
  const dto: Record<string, unknown> = {};
  for (const key of CONTENT_MODEL_DTO_KEYS) { const value = contentModelProjection[key](model); if (value !== undefined) dto[key] = value; }
  return dto as ContentModelDto;
}
```

`CONTENT_MODEL_DTO_KEYS` is `Object.keys(contentModelProjection)`, in
the existing explicit output order (including `listOptions` before `layout`).
The table preserves that insertion order; only the key lists compared by the
schema-completeness test are sorted. The mapped type with `-?` makes a
missing key a compile error, and decision 6 ties the source to the
application type. A contracts test asserts that `CONTENT_MODEL_DTO_KEYS`
when sorted equals the sorted keys of the `contentModelSchema` strict object entries.
The existing `toContentModelDto` tests pin output, including omission of
absent optionals (`not.toHaveProperty("listFields")`), and pass unchanged.
Key order does not affect JSON validation, but it is visible in serialized
bodies and in anything hashed from them. The loop therefore keeps the current
key order, and a test compares `JSON.stringify` output for a full model
before and after.

### 8. Guard

`tests/shared-vocabulary.test.mjs` scans `packages/*/src` and `apps/*/src`,
skipping `dist` and tests, for declarations
(`const|let|type|interface|function|class` followed by the name) of
`SLUG_PATTERN`, `MAX_SLUG_LENGTH`, `ContentModelKind`, `isContentSlug`,
`MAX_ENTRY_SEARCH_LENGTH`, `MAX_CONTENT_ENTRY_SEARCH_LENGTH`,
`MAX_MEDIA_SEARCH_LENGTH`, `MAX_MEDIA_USAGE_ENTRIES`,
`MAX_BUILD_EXPORT_PAGE_SIZE`, `deepFreeze`, `isPlainObject` and `isRecord`.
It allows them only under `packages/content/src`. It also rejects the
literal slug grammar `[a-z0-9]+(?:-[a-z0-9]+)*` outside content, with a
named allowlist: the contracts strict-end slug query pattern (decision 3),
`buildSiteIdentitySchema.id` (a site id) and the admin router's
`modelKeyPattern` (a model key). Each entry carries its reason. Fixtures
under `tests/fixtures/shared-vocabulary/` prove that a flagged declaration
and a flagged regex fail with file and line.

## Risks / Trade-offs

- [The content public surface grows by about 15 names] → They are portable,
  documented and consumed by at least two packages each. The packaged export
  test lists them. RF4A splits the index without changing exports.
- [Mirror check gives an unreadable type error] → The result object names
  the failing keys (`unprojected`, `sourceOnly`, `notAssignable`). The test
  file states how to fix each.
- [Table-driven `toContentModelDto` changes key order or ETags] → The loop
  keeps the existing insertion order, and decision 7's byte comparison test plus the
  unchanged contracts and server suites cover it.
- [`isRecord` / `isPlainObject` behavior differs subtly between copies] →
  The bodies are identical today (Context). Moving them is a cut-and-paste
  that the existing content and config suites cover.

## Migration Plan

None. No storage, configuration or template change. Rollback is a revert
of the change commit.
