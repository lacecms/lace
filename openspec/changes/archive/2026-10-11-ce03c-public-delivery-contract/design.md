## Context

Public reads go straight from the server to `PublicContentReadPort`
(`packages/application`): `loadPublic(path)`, `listPublic`, `exportBuildContent`
and `publishedContentVersion`. The Node and D1 repositories hydrate full
`ContentEntry` aggregates and pass them through `publicEntry()`
(`packages/db/src/sql-content.ts`), which replaces `draft` with a copy of the
publication; the server maps them with `toContentEntryDto` into
`publicContentEntrySchema`/`publicContentListSchema`/`buildExportSchema`
(`packages/contracts`). The in-memory fake in `packages/test-utils` returns the
real draft. Only the build-export route documents a 200 schema in OpenAPI.

The build-export ETag is `published_state.version`; CE3A already bumps it
atomically when metadata of media referenced by a current publication changes,
so no ETag work is needed beyond proving it end to end.

`content_media_references (snapshot_id, source_key, field_path, media_id)` is
maintained for every snapshot, including published ones, and media referenced
by any snapshot cannot be marked for deletion, so published media are active.

The SDK loader (`packages/sdk/src/published-site.ts`) turns the export into a
frozen `PublishedSite`; `mediaUrl` uses the site's `LACE_PUBLIC_BASE_URL` and
falls back to the API base. The render core (`packages/render`) passes
`{block, context, data, mediaUrl}` to components; `LaceBlocks.astro` takes
`{blocks, entry, mediaUrl}`. Starter pages call
`<LaceBlocks blocks={blocks} entry={entry} mediaUrl={site.mediaUrl} />`.

Package boundaries (`scripts/check-boundaries.mjs`): `render → content`,
`sdk → contracts`, `astro → render, sdk`, `contracts → content, domain`.

## Goals / Non-Goals

**Goals:**
- One public entry DTO and one media dictionary DTO shared by all public
  routes, the SDK client and the loader, identical on Node and Cloudflare.
- Media metadata resolved in the same repository read as the entries, with
  bounded statements.
- Site pages and older user-owned block sources keep compiling and rendering;
  only code that reads REST responses or the raw export breaks.

**Non-Goals:**
- No database migration, no new index (the reference table already has
  `(snapshot_id, …)` as its primary-key prefix).
- No change to the ETag rule, the builder, admin APIs or the media binary
  route.
- No release: package versions and registry `requires` stay at the current
  alpha until the next release change.

## Decisions

### D1. Wire shape: one public entry DTO, response-level media dictionary

`publicEntrySchema = {id, modelKey, path, slug?, title, fields, blocks,
publishedAt}` (strict). Responses: single reads `{entry, media}`, collection
`{items, media, nextCursor?}`, export `{entries, media, version}`. The existing
schema names (`publicContentEntrySchema`, `publicContentListSchema`,
`buildExportSchema`) are kept with the new shapes, and `publicEntrySchema`,
`publicMediaSchema` and `publicMediaDictionarySchema` are added with DTO
types. `toPublicEntryDto(entry, path)` reads only `entry.published` and sorts
blocks by position.

*Alternative rejected:* embedding resolved media inside block data. It would
change stored field values' meaning, duplicate items used twice and break the
"values keep storing IDs" decision.

### D2. Media item values are always present, `null` when unknown

`{id, url, mimeType, width, height, alt, caption, focalPoint}` with
`width/height: int | null`, `alt/caption: string | null`,
`focalPoint: {x, y} | null`. Consumers get a stable key set; the admin DTOs keep
their optional-key style. The dictionary validator checks `item.id === key`.
The server builds the dictionary with keys sorted by code unit so export bytes
are deterministic for equal content (the acceptance compares exports by JSON).

### D3. Repository returns referenced media per public entry

`PublicContentEntry` gains `media: readonly MediaMetadata[]` (active items its
published snapshot references). Node and D1 add one shared statement
(`PUBLIC_SNAPSHOT_MEDIA_SQL` in `sql-content.ts`):
`select r.snapshot_id, m.* from content_media_references r join media m on
m.id = r.media_id where r.snapshot_id in (…) and m.status = 'active'`,
deduplicated per snapshot, chunked by `SQLITE_BIND_CHUNK` /
`D1_MAX_BOUND_PARAMETERS`, executed inside the existing hydration path for
`loadPublic`, `listPublic` and `exportBuildContent`. The server merges and
deduplicates per response. The fake applies `publicEntry()` and computes media
from its stored references so all three implementations satisfy the shared
contract fixture. `publicEntry()` stays as the internal projection, but no DTO
reads `draft` any more.

*Alternative rejected:* a second port call (`loadMediaMany`) from the server
after the entry read. It adds a round trip, needs the server to know which
fields are media, and widens the window between content and media reads.

*Alternative rejected:* replacing `PublicContentEntry.entry` with a new
published-only aggregate. Cleaner, but it touches every public port consumer
for no observable gain; the DTO boundary already enforces published-only
output.

### D4. Media URLs

The server builds `url` with `mediaUrl(publicBaseUrl, id)`. Architecture
section 12 forbids inferring the base from an untrusted `Host`, so a public
content route of an app composed without `publicBaseUrl` fails as an
unavailable capability (like the media routes); both runtimes always configure
it, and OpenAPI generation never executes routes. The loader keeps the site's `LACE_PUBLIC_BASE_URL` precedence: when
configured it rebuilds every item URL with it (unchanged spec scenario);
otherwise it keeps the server URL. `site.mediaUrl(id)` returns the resolved URL
for a known ID and the old public-base/API-base rule for an unknown one.

*Why change the fallback:* without a site public base the old rule used the
build's API base, which is often an internal address on VPS builders. The
server's public base is the origin the media route is actually published on.
Spec text is updated accordingly.

### D5. Effective alt text lives in `@lacecms/content`

`effectiveAltText(usageAlt, mediaAlt)` (non-blank usage alt, then non-blank
media alt, then `""`) is defined in `@lacecms/content` next to the built-in
block definitions and re-exported by `@lacecms/contracts` (as the CE3B media
text limits are), so `render` (→ content) and `sdk` (→ contracts) share one
rule without new package edges.

### D6. SDK view

`PublishedMedia` = the public media DTO (with the loader's URL);
`PublishedImage` = `PublishedMedia` with `alt: string`. `PublishedSite` and
every `PublishedEntry` get `media(id)` and `image(mediaId, usageAlt?)` bound to
the export-wide dictionary (a frozen `Map`), and entries gain `publishedAt`.
Entries stay frozen plain objects; the two lookups are own function
properties. Client operations return the new DTOs; `getAllCollection` returns
`{items, media}` with merged dictionaries. Lookups use `Map`, so an ID such as
`__proto__` never resolves through the prototype.

### D7. Render core image describer without breaking pages

`RenderableEntry` gains an optional `media?(id): RenderableMedia | undefined`
(structural: `url`, `width`, `height`, `alt`, `caption`, `focalPoint`), which
`PublishedEntry` satisfies. `prepareBlocks(map, entry, mediaUrl)` keeps its
signature and adds `image(mediaId, usageAlt?) => ImageDescription` to the
props: `{src, alt, width?, height?, objectPosition?, caption?}`.
`objectPosition` is `${round2(x*100)}% ${round2(y*100)}%`. With `entry.media`
present and the ID unresolved it throws `LaceRenderError("missing_media")`
with the block context; without `entry.media` it falls back to
`mediaUrl(id)` and the usage alt. `LaceBlocks.astro` needs no prop change.

*Alternative rejected:* replacing the `mediaUrl` prop of `LaceBlocks` with a
`site` prop. It would break every user page for no benefit, since the entry can
carry its own resolver.

### D8. Block sources

`ImageBlock.astro` (revision 3):
`const image = props.image(data.media, data.alt)`; renders `alt`, `src`,
`width`, `height` and `style={image.objectPosition && {"object-position": …}}`
(Astro drops `undefined` attributes); caption `data.caption ?? image.caption`.
`HeroBlock.astro` (revision 2) does the same for `data.image` without usage
alt. Copies in `apps/site`, the starter template and the existing-site fixture
and their `lace.site.json` hashes are updated; `tests/block-sources.test.mjs`
enforces parity. Registry `requires` stays at the current alpha (the release
change raises it).

The caption fallback to the media caption is an assumption of this change: the
media caption is new in CE3A, so no published page changes unexpectedly.

### D9. Template, upgrade notes, compatibility

`TEMPLATE_VERSION` and `upgrade-instructions.json` move to `0.23.0`. New
`database[]` entries (first) cover `0005_content_model_structure` and
`0006_media_descriptive_metadata` (additive; Compose and D1 sequence as for
`0004`). A `configuration[]` entry for 0.23.0 covers the public shape break,
block source adoption (`pnpm exec lace add block image hero`), and the
`image` v2 step (raise allowing model versions, `pnpm content:sync` before the
site build). The managed `docs/lace-astro-site.md` documents `image()` and
`media()`. `docs/compatibility.md` gets an "unreleased" note under the alpha
line. Tests asserting `0.22.0` move to `0.23.0`.

### D10. Fixes folded in

`scripts/generated-project-acceptance.mjs` saves blocks with each block
definition's current version (from the model metadata the admin API returns,
or the built-in registry) instead of a hardcoded `1`, sets the uploaded
media's alt text and focal point through `PATCH /api/v1/admin/media/:id`, and
asserts alt, `width`, `height` and `object-position` on the built pages.

## Risks / Trade-offs

- [Breaking public JSON during alpha] → template 0.23.0 notes, compatibility
  note, and pages using the loader keep working; only direct REST/export
  readers must change.
- [One more SQL statement per public read; D1 HTTP budgets] → statements are
  chunked and part of the same hydration; update the D1 budget acceptance
  expectations deliberately and record the new numbers.
- [Export race: content read before the version] → unchanged from today
  (media are read in the same pass as entries, before the version), covered by
  the existing race test; not widened.
- [Function properties on frozen entries surprise `toEqual`/serialization] →
  documented in the guide; `JSON.stringify` simply omits them.
- [Older block sources ignore the new metadata] → they keep rendering; the
  upgrade note explains `lace add block` adoption.

## Migration Plan

No data migration. Deploy API, admin and site packages of the same version
together; existing projects follow the 0.23.0 upgrade instructions (migrate
`0005`/`0006` if not yet applied, bump `image`-allowing model versions, sync,
update site packages and optionally adopt block sources, rebuild). Rollback:
redeploy the previous API and site packages together; the database is
unchanged by this change.
