# Lace Content and Editor Roadmap

> Active roadmap. Started 2026-10-10 after the MVP roadmap was archived.
> Wave 1 is done. Wave 2 is detailed and ready for just-in-time OpenSpec
> proposals. Later waves are an ordered backlog and are detailed only when
> they are selected.

## 1. Purpose and source of truth

This roadmap covers the content model, the editing backend, the admin editor,
media and public content delivery. It records the owner's decisions, the
delivery order, the session boundaries and the acceptance criteria for each
step.

Authority follows `AGENTS.md`:

1. [`mvp-architecture.md`](mvp-architecture.md) owns product scope and
   invariants.
2. [`openspec/specs/**`](../openspec/specs/) owns accepted capability behavior.
3. The selected active OpenSpec change owns the proposed delta.
4. This document owns delivery order, session boundaries and recorded
   decisions for content and editor work.

Several steps change an architecture invariant or an explicit MVP exclusion.
Each such step lists the architecture sections to update. The architecture
document is updated in the same OpenSpec change, before code, and a short ADR
is recorded under [`docs/adr/`](adr/). A step never silently implements a
different design.

## 2. How to use this roadmap

The conventions of the [archived MVP roadmap](archive/mvp-implementation-roadmap.md)
apply unchanged:

- A **session unit** is one cohesive change set that can be implemented,
  reviewed and verified independently. It maps to one just-in-time OpenSpec
  change.
- Size labels: **S** one session, **M** two sessions, **L** three or more.
- OpenSpec change names use the prefix `ce<step><session>-`, for example
  `ce01a-schema-change-classification`.
- Every session follows the MVP completion rules: no untracked `TODO`
  standing in for required behavior; runtime validation, types and negative
  tests for new public APIs; migration coverage for database changes; the
  narrowest relevant tests, then root typecheck, Oxlint, Oxfmt check and
  `openspec validate <change> --type change --strict`; documentation in the
  same change.
- Every database change ships for both runtimes (Node SQLite and D1) with
  repository contract tests. D1 work uses guarded batches, never interactive
  transactions.

Status values: `planned`, `proposed`, `in progress`, `done` (archived).

## 3. Baseline (2026-10-10)

The findings that motivate this roadmap. File references are to the state of
`main` at commit `74a289a`.

### Content model

- Ten field types (`text`, `textarea`, `richText`, `number`, `boolean`,
  `date`, `datetime`, `select`, `url`, `media`) with `required`,
  `defaultValue`, `label` and `description`. There are no group, repeatable
  list or reference fields and no pattern or unique options
  (`packages/content/src/index.ts`).
- A stored block is exactly `{key, type, schemaVersion, data}`. Blocks have no
  system metadata (anchor, visibility, variant) and `defineBlock` has no data
  migrations. The render core rejects a version mismatch with
  `block_version_mismatch` (`packages/render/src/blocks.ts`).
- Rich text allows paragraphs, headings 1–3, bullet and ordered lists,
  blockquote, hard break, the bold, italic, strike and code marks, and links
  carrying only `href`.
- `content_models` stores only `structure_hash` and `projection_hash`, not
  the last synchronized structure.
- **Schema evolution is blocked.** Configuration sync refuses every structural
  change to a model that has snapshots (`STRUCTURE_CHANGE_HAS_SNAPSHOTS`,
  `packages/application/src/configuration-sync.ts`). Adding an optional field,
  allowing a new block type, or changing a block definition on a live site
  is impossible without a manual migration.

### Entry lifecycle

- The use cases are create, list, load, save, publish and delete. There is no
  unpublish, no revert of the draft to the published version and no
  duplicate. The architecture states that the MVP has no separate unpublish
  command (section 10).
- Delete is a hard cascade. In the admin it is reachable only from a
  label-less trash icon in the collection list row. The editor has no delete
  action, and pages cannot be deleted or reset in the UI, although the API
  permits page deletion.
- Publish is disabled while the draft has unsaved changes, so publishing
  edited content always takes two actions. Creating an entry does not open the
  new entry. The public URL is shown as plain text, not as a link.

### Media and delivery

- Media metadata is technical only: filename, MIME type, size and dimensions.
  There is no alt text, caption or focal point, and no API to edit metadata.
  `metadata_json` is always `'{}'`.
- Alt text exists only as the required `alt` field of the `image` block. The
  hero block has no alt text and the starter site renders it with `alt=""`.
- Public responses have the shape `{entry: {draft, published, …}}`, where
  `draft` is replaced with a copy of the published snapshot. Media appear
  only as bare IDs; consumers build URLs with `mediaUrl(id)` and receive no
  alt text, dimensions or focal point.

### Admin editor

- Strengths to preserve: block add/insert/duplicate/remove/reorder with
  accessible drag and drop, an undo notice for removal, inline and summary
  validation, revision conflict recovery, the unsaved-changes guard and the
  ⌘S shortcut.
- There is no SEO user interface or data anywhere in the product.

## 4. Delivery overview

| Wave | Step | Topic | Backlog ID | Size | Status |
| --- | --- | --- | --- | :---: | --- |
| 1 | CE1 | Schema evolution and block migrations | A1 | L | done |
| 1 | CE2 | Entry lifecycle: unpublish, revert, duplicate, delete | A5 | M | done |
| 1 | CE3 | Media metadata and resolved public delivery | A4 | L | done |
| 2 | CE5 | Global singletons (settings, navigation, footer) | A8 | M | done |
| 2 | CE4 | SEO metadata and site defaults | A3 | L | in progress |
| 2 | CE6 | Block envelope: anchor, visibility, settings | A2 | L | planned |
| 3 | CE7 | Group and repeatable list fields | A6 | — | backlog |
| 3 | CE8 | Rich-text editor expansion | B1 | — | backlog |
| 3 | CE9 | Field layout and form UX | B2 | — | backlog |
| 4 | CE10 | Entry references and internal links | A7 | — | backlog |
| 4 | CE11 | Responsive images | C3 | — | backlog |
| 4 | CE12 | Bounded revision history | C1 | — | backlog |

Dependency order inside wave 1: **CE1 → CE2 → CE3**. CE2 does not depend on
CE1 technically and may run in parallel. CE3 depends on CE1 because making
the `image` block's `alt` optional is a structural block change.

Dependency order inside wave 2: **CE5 → CE4 → CE6**. CE4 depends on CE5
because site-level SEO defaults are read from a global. CE6 depends on
neither technically; it runs last by owner choice, but it must land before
beta because it changes the stored and public block contract. Database
migration numbers are assigned when each session is proposed.

## 5. Wave 1 — detailed steps

## Step CE1 — Schema evolution and block migrations

**Goal:** a project can evolve its content models and block definitions after
content exists, without manual database work, while destructive or
ambiguous changes still require an explicit, reviewed declaration.

**Size:** L (three sessions).

### Owner decisions (2026-10-10)

1. **Eager migration during sync.** `lace content sync` applies block
   migrations and field backfills to every affected draft **and published**
   snapshot in the same guarded mutation that records the new model state.
   The render core keeps its strict version check and never migrates data.
2. **Explicit hints for destructive changes.** Removing or renaming a field
   that holds data requires a declaration in configuration, in the style of
   the existing model-level `renamedFrom`. Without the hint, sync refuses the
   change exactly as it does today. Sync never guesses.
3. **Adding a required field is allowed.** Existing published snapshots stay
   valid as published. The next publication of each entry enforces the new
   field. When the field has a `defaultValue`, sync backfills it into drafts
   and published snapshots. The sync report counts the affected entries.

### Architecture changes

- Section 4.7 *Published content is immutable*: published snapshots are
  immutable to editorial changes. A schema migration applied by sync may
  rewrite their stored representation; it bumps `published_state.version` and
  requests a build in the same atomic mutation.
- Section 8 *Configuration projection*: replace the rule that sync refuses
  every structural change while entries exist with the compatibility
  classification below. Document field-level hints and block migrations.
- Section 9.1: `content_models` stores the canonical structure of the last
  successful sync as non-authoritative synchronization metadata. The
  configuration file remains the only source of truth.
- Section 11 and section 22: `defineBlock` accepts migrations.

### Change classification

Sync compares the stored structure with the configured structure per model
and per block type. Every difference is classified:

| Change | Class | Behavior with existing snapshots |
| --- | --- | --- |
| Add an optional field | compatible | apply |
| Add a required field without a default | compatible | apply; enforced at the next publication |
| Add a required field with a default | compatible + backfill | apply; backfill drafts and published snapshots |
| Relax a constraint (larger `maxLength`, wider `min`/`max`, `required` → optional, new `select` option) | compatible | apply |
| Allow a new block type in a model | compatible | apply |
| Change label, description, `listFields` | display | apply (projection-only, as today) |
| Tighten a constraint (smaller limits, optional → required on an existing field, removed `select` option) | validated | apply only if every stored value satisfies it; otherwise refuse and name the snapshots |
| Remove a field | destructive | requires a `removedFields` hint; data is pruned |
| Rename a field | destructive | requires a field-level `renamedFrom`; data is moved |
| Change a field type | breaking | refuse (unchanged) |
| Disallow a block type that stored blocks use | destructive | requires a `removedBlocks` hint; those blocks are dropped |
| Change a block definition | migration | requires a block version bump and a migration path |
| Change a page path or collection route | breaking | refuse while published (unchanged; routes are out of scope) |

The model `version` keeps its current meaning: any structural change still
requires a version bump, so diffs remain explicit in review.

### Session CE1A — Structure baseline and compatible changes

- Add a `structure_json` column to `content_models` holding the canonical
  structure that produced `structure_hash`. Migrations for Node SQLite and
  D1.
- **Upgrade path:** an existing installation has hashes but no structure. The
  first sync after the upgrade records the structure when the configured hash
  equals the stored hash. When the hashes differ and no baseline exists, sync
  falls back to today's strict behavior and tells the operator to restore the
  previous definition, sync, and then apply the change.
- Implement the structural diff and the classification for model fields and
  the block allowlist.
- Apply compatible and validated changes. Validated changes scan stored
  snapshot values through the repository port in bounded pages.
- Backfill a `defaultValue` for a new required field into drafts and
  published snapshots.
- Extend the sync report and `--check` output with classes, affected entry
  counts and the planned writes.

**Acceptance:** adding an optional field, a required field with or without a
default, a relaxed constraint and a newly allowed block type to models with
draft and published content succeeds on both runtimes. A failing tightening
names the offending snapshots. `--check` reports the plan without writing.
An upgrade from an installation without a baseline is covered by a test.

### Session CE1B — Field rename and removal hints

- Add a field-level `renamedFrom` option and the model-level `removedFields`
  and `removedBlocks` options. Hints are validated like the model-level
  `renamedFrom`: the old key must exist in the baseline and the new key must
  not. Hints are documented as temporary and are removed after all
  environments sync.
- Sync moves or prunes the data in drafts and published snapshots and
  rebuilds `content_media_references` for every rewritten snapshot, so media
  usage and the deletion guard stay correct.
- A destructive change without a matching hint is refused with a report that
  names the field or block type and the affected entries.

**Acceptance:** renaming a field keeps its values; removing a field prunes
them; removing a media field releases its media usage; removing an allowed
block type drops its stored blocks; each refusal without a hint is covered by
a negative test on both runtimes.

### Session CE1C — Block migrations

- `defineBlock({ version, migrations })`, where `migrations` maps each target
  version to a pure, synchronous function from the previous version's data.
  Sync composes the chain from each stored `schemaVersion` to the current
  version. A missing step is a configuration error.
- Every migrated result is validated against the new block schema in publish
  mode for published snapshots and draft mode for drafts. Any failure aborts
  the whole sync and reports the model, entry, block key and versions.
- Writes are guarded per snapshot on its revision and per block on its stored
  `schema_version`, so an interrupted or repeated sync is safe and resumable.
  D1 writes are chunked within batch limits; each chunk is atomic per
  snapshot.
- Migrating a draft increments its revision with the actor
  `system:content-sync`, so an open editor receives a revision conflict
  instead of overwriting the migrated data. Media references are rebuilt.
- If any published snapshot changed, the final mutation bumps
  `published_state.version` and requests one coalesced build.
- `--check` performs a dry run that executes the migrations in memory and
  reports results without writing.
- The block registry tooling (`lace add block`) and the starter blocks
  document how a versioned block ships its migrations.

**Acceptance:** a block change from version 1 to 3 with two migration steps
upgrades drafts and published snapshots on both runtimes; the site builds
with the new definition; a throwing or invalid migration leaves the database
unchanged; a repeated sync after a simulated interruption completes; an open
editor gets a revision conflict after migration.

## Step CE2 — Entry lifecycle

**Goal:** editors can take content offline, abandon unwanted draft changes,
duplicate entries and delete them from where they work, with clear
consequences for the public site.

**Size:** M (two sessions).

### Owner decisions (2026-10-10)

1. **Hard delete stays.** There is no trash. Deletion becomes discoverable in
   the editor and safer to confirm. A trash with restore may be proposed
   later as a separate step.
2. **Pages cannot be deleted.** A page singleton is defined by configuration
   and is removed from `lace.config.ts`, not from the admin. Pages support
   unpublish (with a warning that the fixed path will return 404 after the
   next build) and revert to published. The API refuses page deletion.
3. **Unpublish keeps the draft.** Unpublishing removes only the published
   snapshot and the route. The draft, including any unpublished changes, is
   untouched.

### Architecture changes

- Section 10: add the unpublish, revert-draft and duplicate commands and their
  permissions. Remove the statement that the MVP has no separate unpublish
  command. Replace "deleting a page … a later edit recreates the singleton
  entry" with the rule that page entries cannot be deleted.
- Section 12: add the new admin endpoints.

### Session CE2A — Use cases, repositories and REST

- **Unpublish** (`content:publish`): input is the entry ID, the expected
  published snapshot ID and an optional idempotency key. One guarded atomic
  mutation deletes the published route, clears `published_snapshot_id`,
  deletes the published snapshot (its blocks and media references cascade),
  bumps `published_state.version` and coalesces a build request. Unpublishing
  an entry that is not published is a stable conflict error. Applies to pages
  and collection entries.
- **Revert draft** (`content:write`): input is the entry ID and
  `expectedRevision`. Copies the published snapshot's title, slug, fields,
  blocks and media references into the draft with set-based statements and
  increments the draft revision once. Refused when the entry was never
  published or the revision does not match.
- **Duplicate** (`content:write`, collections only): creates a new entry
  whose draft copies the source draft. The title gets a " (copy)" suffix,
  truncated to the title limit; the slug is cleared because slugs must stay
  unique on publication; blocks receive new keys; media references are
  rebuilt. The copy is never published. A page duplicate is refused.
- **Delete:** unchanged for collection entries; page entries are refused with
  a stable error code.
- REST: `POST /api/v1/admin/entries/:entryId/unpublish`,
  `POST /api/v1/admin/entries/:entryId/revert`,
  `POST /api/v1/admin/entries/:entryId/duplicate`, with Valibot contracts,
  OpenAPI entries, stable error codes and `If-Match` support consistent with
  the existing draft and publish endpoints.

**Acceptance:** repository contract tests for each mutation on both runtimes,
including revision and published-snapshot races; unpublish removes the route
from by-path lookup and build export and triggers a build; authorization
tests for editor and viewer; page delete and page duplicate are refused.

### Session CE2B — Admin editor actions

- An entry actions menu (⋯) in the editor header with Duplicate, Revert to
  published, Unpublish and Delete. Each action is shown only when the actor
  has the permission and the entry state allows it. Viewers see no menu.
- Confirmations in plain language:
  - Unpublish explains that the public path stops working after the next
    build, and for a page that its fixed path will return 404.
  - Revert lists what is lost: the unsaved and saved draft changes since the
    last publication.
  - Deleting a published entry requires typing the entry title and states
    that the page disappears from the site. Deleting a draft-only entry keeps
    the single confirmation.
- **Save and publish:** when the draft has unsaved changes, the publish
  action saves first and then publishes with one idempotency key, stopping
  with the save error if validation fails.
- Creating an entry opens it in the editor. Duplicating opens the copy.
  Deleting returns to the collection list.
- The public path becomes an "Open on site" link when the entry is published.
  The site origin comes from the new optional `LACE_BUILD_SITE_URL` setting,
  exposed by `GET /api/v1/admin/build-site` (owner decision, 2026-10-11).
- The collection row trash icon is replaced by a labeled row actions menu
  (Open, Duplicate, Delete), keyboard reachable as the current spec
  requires.

**Acceptance:** browser tests for each action and permission combination,
including the typed-title confirmation, save-and-publish with a validation
error, and keyboard access; the accessibility acceptance in architecture
section 17 holds.

## Step CE3 — Media metadata and resolved public delivery

**Goal:** media carry reusable descriptive metadata, and public consumers
receive resolved media with URL, alt text, dimensions and focal point instead
of bare IDs.

**Size:** L (three sessions).

**Depends on:** CE1 (the `image` block definition changes).

### Owner decisions (2026-10-10)

1. **Metadata fields:** `alt`, `caption` and `focalPoint` (`{x, y}`, each a
   number from 0 to 1). Title and credit are not added now.
2. **Metadata is global and goes live on the next build.** Editing the
   metadata of a media item used by any current published snapshot bumps
   `published_state.version` and requests a build in the same atomic
   mutation. No republication is needed.
3. **Alt text is optional.** The effective alt text is resolved as: the
   usage-level alt (for example the `image` block's `alt`), then the media
   item's `alt`, then an empty string. Publication is never blocked by
   missing alt text; the admin shows a warning instead.

### Architecture changes

- Section 9.7: add the metadata columns, the update use case and the
  publication-version rule for metadata edits.
- Section 8 *Initial built-in blocks*: `image` has optional alt text that
  overrides the media alt text.
- Sections 12 and 13: the public entry shape and the resolved media
  dictionary below.

### Session CE3A — Metadata storage and API

- Add `alt` (at most 1,000 characters), `caption` (at most 2,000 characters),
  `focal_x` and `focal_y` (nullable reals constrained to 0–1, both set or
  both null) to `media` on both runtimes. `metadata_json` stays reserved.
- `PATCH /api/v1/admin/media/:mediaId` (`media:write`) with optimistic
  concurrency on `updatedAt` through `If-Match`. Only `active` media can be
  edited. Plain text only; values are trimmed and validated.
- When the item is referenced by a current published snapshot, the same
  atomic mutation bumps `published_state.version` and coalesces a build.
- Admin media DTOs include the new metadata.

**Acceptance:** contract tests on both runtimes for the update, the
concurrency conflict and the build request only when published content uses
the item; validation rejects out-of-range focal points and over-long text.

### Session CE3B — Admin metadata editing

- The media details panel edits alt text and caption, and sets the focal
  point by clicking or dragging on the preview, with arrow-key adjustment and
  a reset action.
- The media picker shows the item's alt text. The `image` block's alt field
  shows the inherited media alt as its placeholder ("Uses media alt: …") and
  warns when both are empty.
- The `image` block moves to version 2 with `alt` optional. The stored data
  does not change, but CE1 still requires the block version increase to
  declare a migration: version 2 declares an identity migration, every model
  that allows `image` raises its version, and configuration sync rewrites the
  stored schema version of existing `image` blocks before the next site
  build. The starter site and registry block sources are updated together.

**Acceptance:** browser tests for editing metadata, the focal-point control
with keyboard only, the inherited alt placeholder and the missing-alt
warning.

### Session CE3C — Public delivery contract

- **Public entry shape:** public endpoints and the build export return the
  published snapshot directly, without the misleading `draft` key:
  `{id, modelKey, path, slug?, title, fields, blocks, publishedAt}`.
- **Resolved media:** responses include a normalized `media` dictionary keyed
  by ID for every media item the returned entries reference:
  `{id, url, mimeType, width, height, alt, caption, focalPoint}`. Field and
  block values keep storing media IDs.
- **SDK:** `PublishedEntry` and the published-site loader expose
  `media(id)` and an `image(mediaId, usageAlt?)` helper that returns the
  resolved item with the effective alt text.
- **Render core and Astro adapter:** image descriptions carry `width` and
  `height` to prevent layout shift and an `object-position` derived from the
  focal point. The starter `ImageBlock` and `HeroBlock` sources use the
  effective alt text, removing the hardcoded `alt=""`.
- This is a breaking public contract change made during alpha. The SDK, the
  generated project template version and
  [`compatibility.md`](compatibility.md) are updated together, and the
  upgrade notes explain how to update user-owned block sources. They also
  carry the CE3B step: raise the version of every model that allows `image`
  in `lace.config.ts` and run configuration sync before building the site,
  because the render core refuses `image` blocks still stored at version 1.

**Acceptance:** contract tests for the new public shape and the media
dictionary; the starter and reference sites build and render alt text,
dimensions and focal point; the build-export ETag still changes when
metadata of published media changes; the generated-project acceptance
passes.

## 6. Wave 2 — detailed steps

## Step CE5 — Global singletons

**Goal:** site-wide content that belongs to no URL, such as site settings,
navigation and the footer, is edited in the admin with the same draft and
publish flow as pages and is delivered to the site build.

**Size:** M (two sessions).

### Owner decisions (2026-10-11)

1. **A third model kind, `global`.** Globals are declared with
   `defineGlobal({ key, version, label?, description?, fields?, blocks? })`.
   A global has no path, route or slug and is never served by path. Exactly
   one entry exists per global; configuration sync creates it the same way
   it creates a page entry. The entry title is set from the model label and
   is not editable.
2. **Page lifecycle.** A global supports save, publish, revert to published
   and unpublish. Delete and duplicate are refused with a stable singleton
   error, as for pages. Like every publication, publishing a global bumps
   `published_state.version` and requests a build, because any page may
   render it.
3. **No navigation global before CE7.** Repeatable link lists need
   `field.list`, so the starter and reference site ship navigation as a
   global only after CE7. A project may still model lists as blocks in a
   global, but Lace does not document that as the recommended shape. Links
   are plain URLs until CE10.
4. **Separate public shape.** A published global is
   `{id, modelKey, fields, blocks, publishedAt}`: no `path`, no `slug`.
   `PublishedEntry.path` stays required. A site must tolerate a global that
   has never been published (the SDK returns `undefined`).

### Architecture changes

- Section 8 *Content-model kinds* and *Configuration projection*: add
  `global`, `defineGlobal` and its sync behavior. A kind change between
  `page`, `collection` and `global` is breaking and refused.
- Sections 9.1 and 9.2: widen the `content_models.kind` check; a global uses
  `singleton_key = 1` like a page.
- Section 9.6: globals never have a published route.
- Section 10: the global lifecycle and its refusals.
- Sections 12, 13.1 and 13.2: the global endpoint, the `globals` part of the
  build export and the SDK accessors.
- Section 17: the admin navigation group for globals.
- A short ADR records the kind and the route-less read path.

### Session CE5A — Global kind, storage and delivery

- `defineGlobal` in `@lacecms/config`; keys stay unique across all kinds; the
  structure hash covers the new kind. Every place that hard-codes
  `"page" | "collection"` (content, domain, contracts, the database check,
  the stored model states and the runtime mappers) accepts `global`.
- A migration widens the `content_models.kind` check on Node SQLite and D1.
  It is a table rebuild in SQLite, so it is verified with foreign keys and
  existing data on both runtimes.
- Configuration sync creates the singleton entry for a new global. Publish
  skips the `published_routes` write; unpublish removes only the snapshot.
- Public read by model key that does not join `published_routes`:
  `GET /api/v1/public/globals/:modelKey` returns `{global, media}` with the
  CE3C media dictionary; `404` when the global is unpublished.
- The build export gains `globals` (additive; `entries` stays route-only).
  The export ETag changes when a global is published or unpublished.
- SDK: `client.getGlobal(modelKey)` and `site.global(modelKey)` with the
  `media` and `image` helpers.
- Admin REST: model DTOs carry `kind: "global"` without `path` or `route`;
  delete and duplicate are refused.

**Acceptance:** repository contract tests for create-on-sync, publish without
a route, unpublish, revert and the delete/duplicate refusals on both
runtimes; the public endpoint, the export and the SDK return the published
global and its media; a global never appears in by-path lookup, collection
lists or `entries`; a kind change is refused by sync; the migration test
upgrades a database with existing pages and collections.

### Session CE5B — Admin and starter

- A *Site* sidebar group lists globals and opens their editor directly. The
  editor shows no path, slug or "Open on site" link. The publish
  confirmation states that the change affects every page after the next
  build.
- The content overview and model pages handle the new kind.
- The starter and reference site ship a `settings` global (`siteName`,
  `tagline`). The base layout reads it through `site.global(...)` and falls
  back to static values when it is unpublished. Navigation stays static
  until CE7.
- Template version bump with upgrade notes (the migration, the new kind and
  the optional starter globals); `compatibility.md` records the additive
  contract change.

**Acceptance:** browser tests for opening, editing, publishing and reverting a
global with keyboard access; the starter and reference sites build with and
without published globals; the generated-project acceptance passes.

## Step CE4 — SEO metadata and site defaults

**Goal:** every routable entry can carry search and social metadata with
sensible fallbacks, and the site emits complete `<head>` metadata, a
sitemap and `robots.txt` without hand-written code.

**Size:** L (three sessions).

**Depends on:** CE5 (site defaults live in a global).

### Owner decisions (2026-10-11)

1. **Per-entry SEO is a system group, opt-in per routable model.** A page or
   collection declares `seo: true`, or `seo: { description, image }` to name
   fallback fields (for example a post's `excerpt` and `cover`). The group
   holds `title`, `description`, `image` (media), `canonical` (absolute
   URL) and `noindex`. It is stored with the snapshot outside `fields`, so
   project field keys never collide with it, and it follows the draft and
   publish flow. Globals cannot declare `seo`.
2. **Site defaults come from one global by field mapping.**
   `defineGlobal({ seoDefaults: { siteName, titleTemplate?, description?,
   image? } })` names fields of that global. At most one global declares
   `seoDefaults`. No separate storage is added for defaults.
3. **Fallbacks are resolved by the SDK, not stored.**
   - Title: the SEO title verbatim, otherwise the entry title formatted by
     the title template (`%s` placeholder; default `%s | {siteName}`).
   - Description: SEO description, then the model's mapped field, then the
     site default, otherwise omitted.
   - Image: SEO image, then the model's mapped media field, then the site
     default, otherwise omitted.
   - Canonical: SEO canonical, otherwise site URL + path.
   - `noindex` emits `noindex, follow` and excludes the entry from the
     sitemap.
4. **The site URL is operator configuration, not content.** It comes from
   `LACE_BUILD_SITE_URL` (introduced in CE2B). The builder passes it to the
   site build, which sets Astro `site`. Without it, canonical and `og:url`
   are omitted and no sitemap is generated, with a build warning.
5. **Delivery through user-owned files.** `@lacecms/astro` provides a
   `<LaceSeo>` head component and helpers for `sitemap.xml` and `robots.txt`
   endpoints. The starter installs them as user-owned pages; no Astro
   integration is added. `robots.txt` allows everything and names the
   sitemap.
6. **Deployment-level indexing switch.** A new optional build setting,
   `LACE_SITE_INDEXING` (`on` by default, `off` for staging and previews),
   is operator configuration next to `LACE_BUILD_SITE_URL`, never part of
   `lace.config.ts`. With `off`, `robots.txt` disallows everything and
   `<LaceSeo>` emits `noindex` on every page.
7. **Length limits are soft in the admin, hard in the API.** The admin warns
   above 60 characters for the title and 160 for the description; the API
   rejects values above fixed hard limits chosen in the CE4A proposal.

### Architecture changes

- Section 8: the `seo` model option, `seoDefaults` on globals and their sync
  classification. Enabling `seo` is compatible; disabling it on a model with
  stored SEO values is destructive and needs an explicit hint.
- Sections 9.3 and 9.7: SEO storage on snapshots and the SEO image in the
  media reference projection (deletion guard and media dictionary).
- Sections 12, 13.2 and 13.4: the public `seo` shape, the SDK resolution and
  the Astro head, sitemap and robots helpers.
- Section 9.8 or the builder section: the site URL passed to the build.
- A short ADR records the system group and the fallback chain.

### Session CE4A — SEO data and contract

- The `seo` model option and `seoDefaults` validated by `@lacecms/config`:
  mapped fields must exist and have a compatible type (text-like for names,
  templates and descriptions; `media` for images).
- A migration adds nullable SEO storage to `content_snapshots` on both
  runtimes. SEO text and URL rules live in `@lacecms/domain` and are shared
  with the contracts.
- Save, publish, revert and duplicate copy the SEO group; the SEO image is
  part of `content_media_references`.
- Configuration sync classifies enabling and disabling `seo` as above.
- Admin draft DTOs and save requests carry `seo`; public entries, the build
  export and the media dictionary include it for models with SEO enabled.
  OpenAPI is updated.

**Acceptance:** repository contract tests on both runtimes for save, publish,
revert and duplicate with SEO values; the SEO image blocks media deletion
and appears in the public media dictionary; validation rejects relative
canonical URLs and over-long values; disabling `seo` with stored data
without a hint is refused.

### Session CE4B — Site output

- SDK: `site.seo(entry)` resolves the fallback chain using the `seoDefaults`
  global, and `site.url` exposes the site URL. The resolver is a pure,
  unit-tested function.
- Builder: passes the site URL and `LACE_SITE_INDEXING` to the site build;
  both are documented in the starter `.env.example` and the deployment
  guides.
- `@lacecms/astro`: `<LaceSeo>` renders `<title>`, the description,
  canonical, robots, Open Graph (`og:title`, `og:description`, `og:image`
  with dimensions and alt, `og:url`, `og:site_name`, `og:type`) and
  `twitter:card`. Sitemap and robots helpers build from the published site
  (`lastmod` from `publishedAt`, `noindex` entries excluded).
- Starter and reference site: the base layout uses `<LaceSeo>`, the
  `settings` global gains the mapped fields, `sitemap.xml` and `robots.txt`
  pages are added. Template version bump, upgrade notes and
  `compatibility.md`.

**Acceptance:** resolver unit tests for every fallback step; the starter and
reference sites build with and without a site URL and produce the expected
head tags, sitemap and robots output; the generated-project acceptance
passes.

### Session CE4C — Admin SEO editing

- An *SEO* section in the entry editor for models with SEO enabled: inputs
  with character counters and soft warnings, the media picker for the
  image, inherited values shown as placeholders ("Uses entry title", "Uses
  site description"), and a search-result preview.
- The global that declares `seoDefaults` shows which fields act as site
  defaults.

**Acceptance:** browser tests for editing, the inherited placeholders, the
counters and warnings, and keyboard access; the accessibility acceptance in
architecture section 17 holds.

## Step CE6 — Block envelope

**Goal:** editors can give a block a stable in-page anchor, hide it without
deleting it and choose presentational settings that the block definition
declares, separately from the block content.

**Size:** L (three sessions).

### Owner decisions (2026-10-11)

1. **Envelope fields.** A stored block becomes
   `{key, type, schemaVersion, anchor?, hidden, settings, data}`.
   - `anchor`: optional; lowercase letters, digits and hyphens, starting with
     a letter, at most 64 characters, unique within the entry.
   - `hidden`: boolean, default `false`.
   - `settings`: an object declared by the block definition; `{}` when the
     block declares none.
2. **Hidden blocks stay stored but are never delivered.** They remain in the
   draft and the published snapshot, so hiding and revert lose nothing. They
   are omitted from public responses and the build export, and media used
   only by hidden blocks are left out of the media dictionary while still
   protected by the deletion guard. The render core also skips hidden blocks
   defensively. At publication and during sync migrations a hidden block is
   validated in draft mode, so an unfinished block can be published hidden.
3. **Settings are declared, presentational and typed.**
   `defineBlock({ settings })` uses the field builders limited to `select`,
   `boolean`, `number` and `text`; every setting has a default. Settings are
   part of the block definition, so changing them requires a block version
   increase and a migration; migrations receive and return the envelope's
   `data` and `settings`.
4. **No wrapper element.** `LaceBlocks` does not wrap blocks. Block props
   gain `anchor` and typed `settings`, and each block source places
   `id={anchor}` on its root element when an anchor is set; without one the
   markup is unchanged. Built-in blocks gain anchor support but no settings
   in this step.
5. **Open for the CE6A proposal: a custom CSS class.** The owner considers
   an optional per-block CSS class useful as an escape hatch for site
   styling. The proposal decides whether it becomes an envelope field
   (validated class tokens, passed as a block prop and merged by block
   sources into their root `class`) or stays a project-declared setting.
6. **Breaking public block contract during alpha.** The SDK, the template
   version and `compatibility.md` change together, with upgrade notes for
   user-owned block sources.

### Architecture changes

- Sections 9.4 and 9.5: the envelope columns and the per-entry anchor
  uniqueness.
- Section 10: hidden blocks at publication and in public delivery.
- Sections 11 and 13.3–13.5: `defineBlock` settings, block props, the render
  core skip and the registry convention for anchors.
- Section 12: the block shape in admin and public contracts.
- A short ADR records the envelope and the hidden-block delivery rule.

### Session CE6A — Envelope data contract

- `defineBlock({ settings })` with defaults and validation; settings enter
  the block metadata and the structure hash; CE1C migrations carry settings.
- A migration adds `anchor`, `hidden` and `settings_json` to
  `content_blocks` with additive statements and a partial unique index on
  `(snapshot_id, anchor)`. Every block column list (save, publish copy,
  revert, duplicate, sync migration, reads) is updated on both runtimes.
- Entry validation accepts the envelope, checks anchor format and
  uniqueness, validates settings and applies draft-mode validation to
  hidden blocks at publication.
- Admin contracts accept and return the envelope; omitted envelope fields
  default for existing clients. Public responses and the build export drop
  hidden blocks and their exclusive media.

**Acceptance:** repository contract tests on both runtimes for envelope
round-trips through save, publish, revert, duplicate and sync migration;
duplicate anchors are rejected; a hidden invalid block publishes and is
absent from public output; settings validation and a settings migration
are covered.

### Session CE6B — Rendering and site delivery

- Render core: `RenderableBlock` and `BlockProps` gain `anchor` and typed
  `settings`; `prepareBlocks` skips hidden blocks.
- SDK `PublishedBlock` and the Astro adapter pass the envelope through.
- Registry blocks get a new revision that renders `id={anchor}`; the
  starter, reference site and guide fixtures are updated. Template version
  bump, upgrade notes and `compatibility.md`.

**Acceptance:** render-core unit tests for skipping and props; the starter and
reference sites build and render anchors; an in-page `#anchor` link works;
the generated-project acceptance passes.

### Session CE6C — Admin block envelope

- The block card gets *Content* and *Settings* tabs. *Settings* edits the
  anchor (with live format and uniqueness validation and a copy-link
  action), the hidden switch and the declared settings through the existing
  field controls.
- A hidden block is visibly muted with a *Hidden* badge and can be shown or
  hidden from the card menu; the collapsed card shows its `#anchor`.
- The validation summary marks errors in hidden blocks as not blocking
  publication.

**Acceptance:** browser tests for editing the anchor, hiding and showing,
editing settings and keyboard access to the tabs; the accessibility
acceptance in architecture section 17 holds.

## 7. Later waves — backlog

These items are ordered but not detailed. Each is expanded in this document,
with owner decisions, when it is selected.

- **CE7 Group and repeatable list fields (A6):** `field.group` and
  `field.list` for FAQ, pricing, feature and gallery blocks; media reference
  projection for nested paths. The starter and reference site gain a
  `navigation` global built on `field.list` (deferred from CE5).
- **CE8 Rich-text expansion (B1):** heading levels 2–4 with configurable sets
  (an H1 in the body duplicates the page title), horizontal rule, code block,
  link `target` and `rel`, bubble menu, paste cleanup from Google Docs and
  Word, per-field node and mark allowlists. Tables later.
- **CE9 Field layout and form UX (B2):** required markers, placeholders,
  tabs and groups (Content / SEO / Settings), conditional visibility,
  character counters, automatic slug for new entries.
- **CE10 Entry references and internal links (A7):** reference fields and
  `entry:<id>` links in URL fields and rich text, resolved to paths at build
  time so slug changes do not break links.
- **CE11 Responsive images (C3):** width variants and `srcset` through
  Astro image optimization or Cloudflare Images, using CE3 dimensions and
  focal point.
- **CE12 Bounded revision history (C1):** a small number of retained
  published versions with restore. Requires changing the MVP exclusion of
  revision history.

Further candidates, not yet ordered: scheduled publication (C2, an MVP
exclusion), bulk list actions and field-value filters, media folders and tags,
token-protected draft preview, trash for deleted entries, and an early
decision on whether localized content will ever be supported, because locales
would affect snapshot and route keys.

## 8. Session log

Record each completed session here: date, OpenSpec change name, outcome and
any decision that changed this document.

| Date | Session | OpenSpec change | Outcome |
| --- | --- | --- | --- |
| 2026-10-10 | — | — | Roadmap created; wave 1 decisions recorded. |
| 2026-10-10 | CE1A | `ce01a-structure-baseline-compatible-changes` | Structure baseline (migration `0005`), definition-scoped structural hash with one-time legacy-hash acceptance, change classification, bounded snapshot scans guarded by a per-model snapshot fingerprint, revision-neutral default backfill, baseline-only applies without a build ([ADR 0007](adr/0007-schema-evolution-during-sync.md)). Decisions added: media-field defaults are not backfilled; a path/route change is refused only while entries are published. |
| 2026-10-10 | CE1B | `ce01b-field-rename-removal-hints` | Field-level `renamedFrom` and model-level `removedFields`/`removedBlocks` hints, excluded from structure, hashes and the public projection and validated against the baseline (already-applied hints are inert). Sync moves, prunes and drops hinted data with set-based, revision-neutral statements that maintain `content_media_references`; unhinted refusals name snapshots and the hint to declare. Decisions added: renames run before backfills; a rename onto stored data is refused; `defineBlock` rejects `renamedFrom`. |
| 2026-10-11 | CE1C | `ce01c-block-migrations` | `defineBlock({ version, migrations })` with contiguous, runtime-only migrations; planning runs them in memory over bounded entry pages and validates results (publish mode for published snapshots, draft mode for drafts, size, media-reference and no-new-media limits), so `--check` is a full dry run. Apply rewrites stale blocks in guarded, resumable per-entry units (draft revision + 1 by `system:content-sync`; an in-sync published snapshot follows the draft revision), then re-prepares and runs the guarded final mutation. Decisions added: block migrations precede the final mutation (public window documented in architecture 4.7 and ADR 0007); migrations may only use media the snapshot already references; allowing models still bump their version. CE1 complete. |
| 2026-10-11 | CE2A | `ce02a-entry-lifecycle-commands` | Guarded unpublish (`content:publish`, expected published snapshot ID, optional idempotency key; route, pointer and snapshot removed, version bump and coalesced build, draft untouched), revert draft (`content:write`, set-based copy of the publication; the published revision is aligned with the new draft revision so the entry reads as published, without a version bump or build), duplicate (collections only, ` (copy)` title, no slug, new block keys, guarded on the source draft revision), page delete/duplicate refused with `CONTENT_PAGE_SINGLETON`, new `CONTENT_NOT_PUBLISHED`; REST `unpublish`/`revert`/`duplicate` endpoints ([ADR 0008](adr/0008-entry-lifecycle-commands.md)). Decisions added: an unpublished snapshot is not restorable (republishing publishes the current draft); revert aligns the published revision instead of bumping the public version. |
| 2026-10-11 | CE2B | `ce02b-admin-entry-actions` | Editor "Entry actions" menu (Duplicate, Revert to published, Unpublish, Delete) gated by permissions and entry state, with plain-language confirmations (page 404 warning, loss list, typed title for published deletion); "Save and publish" saves then publishes the saved revision with one idempotency key; create and duplicate open the entry, delete returns to the list without the discard prompt; labeled row actions menu (Open, Duplicate, Delete) replaces the trash icon; "Open on site" link from the new optional `LACE_BUILD_SITE_URL` build-site setting. Decisions added: the site URL is explicit operator configuration on the build-site identity (not `LACE_PUBLIC_BASE_URL` or the admin origin); both menus are non-modal and keep their button while the user may act, showing "No actions available" when none apply; an empty collection slug input means no slug (fixes a 422 on the first save of slugless entries). CE2 complete. |
| 2026-10-11 | CE3A | `ce03a-media-metadata-storage-api` | Migration `0006` adds nullable `alt`, `caption`, `focal_x`, `focal_y` to `media` with additive `ALTER … ADD … CHECK` statements (no table rebuild; `metadata_json` stays reserved). `MediaUseCases.updateMetadata` (`media:write`, active items only) validates plain text with shared domain rules, merges a partial patch, writes nothing for an unchanged submission, and guards on `updatedAt` (strong `If-Match` of its Unix milliseconds; each write sets `max(now, previous + 1)`; stale → `MEDIA_UPDATE_CONFLICT` 409). Editing media used by a current publication bumps the published version and coalesces a `media_metadata` build atomically on Node and D1. `PATCH /api/v1/admin/media/:mediaId` returns `{media, build}` and an `ETag`; the detail GET returns the `ETag`; admin media DTOs carry the optional values ([ADR 0009](adr/0009-media-metadata.md)). Decisions added: text and focal rules live in `@lacecms/domain` for contracts and the use case; the Worker post-commit pass also runs after media metadata updates and unpublication (closing a CE2A gap). |
| 2026-10-11 | CE3B | `ce03b-admin-media-metadata-editing` | The media details panel edits alt text, caption and focal point with explicit Save/Discard through the CE3A `PATCH` (strong `If-Match` from `updatedAt`, only changed values sent), announces whether a site build was requested, recovers from `MEDIA_UPDATE_CONFLICT` by showing the newer values with *Discard my changes* or *Save mine anyway* (sends only the writer's own changes with the newer tag), and confirms closing with unsaved values; viewers and items pending deletion see it read-only, and missing alt text is warned about. The focal-point control is a `role="slider"` marker over the preview (click, drag, arrows ±1 %, Shift ±10 %, reset). Picker tiles and the selected media card show alt text. Blocks with one media field and a text field `alt` show "Uses media alt: …" as the alt placeholder and a non-blocking missing-alt warning. Built-in `image` is version 2 with optional `alt` and an identity migration; the repository models allowing it were bumped; registry `image` revision 2 renders `alt=""` when absent, copied to the starter, reference site and guide fixture ([ADR 0009](adr/0009-media-metadata.md)). Decisions added: the roadmap's "no data migration" was corrected (identity migration, model version bumps, sync before the site build; CE3C carries the upgrade note); contracts re-export the media text limits for the admin inputs. |
| 2026-10-11 | CE3C | `ce03c-public-delivery-contract` | Public page, collection, slug, path and build-export responses return the published entry directly (`{id, modelKey, path, slug?, title, fields, blocks, publishedAt}`, no mirrored `draft`; single reads `{entry, media}`, lists `{items, media, nextCursor?}`, export `{entries, media, version}`) with a `media` dictionary resolving exactly the media referenced by the returned published snapshots (`{id, url, mimeType, width, height, alt, caption, focalPoint}`, `null` when unknown, keys sorted), read with one chunked reference-projection statement on Node, D1 and the fake; the public entry routes document 200 schemas in OpenAPI. The SDK client returns the new DTOs (`getAllCollection` merges media); `PublishedEntry` gains `publishedAt`, and entries and the site gain `media(id)` and `image(id, usageAlt?)` (effective alt: usage, media, `""`, via `effectiveAltText` in `@lacecms/content`). Block props gain `image()` (`src`, alt, `width`, `height`, `caption`, focal `objectPosition`; `missing_media` for an unresolved ID) while `mediaUrl` and `LaceBlocks` props stay. Registry `image` revision 3 and `hero` revision 2 render effective alt, dimensions and focal point (image caption falls back to the media caption). Template `0.23.0` upgrade notes cover migrations `0005`/`0006`, the contract break, `lace add block image hero` and the CE3B model-version + sync step; `compatibility.md` records the break ([ADR 0009](adr/0009-media-metadata.md)). Decisions added: media URLs come only from the configured API public base (no `Host` inference; an app without it serves no public content routes), and a site without `LACE_PUBLIC_BASE_URL` keeps the export URLs instead of the build's API base; the D1 export budget is now `8 + 5 × ⌈entries/100⌉` queries. Fixed CE3B leftovers: acceptance, cross-runtime and D1 budget scripts saved `image` blocks at version 1. CE3 complete. |
| 2026-10-11 | — | — | Wave 2 detailed in the order CE5 → CE4 → CE6 with owner decisions: `global` model kind with page lifecycle (no delete or duplicate); no navigation global before CE7; SEO system group with SDK-resolved fallbacks and site defaults mapped from one global; site URL and `LACE_SITE_INDEXING` are deployment settings; block envelope with optional `anchor`, `hidden` and declared `settings` (none on built-in blocks); custom CSS class left open for CE6A. |
| 2026-10-11 | CE5A | `ce05a-global-kind-storage-delivery` | Route-less `global` model kind: `defineGlobal` in `@lacecms/config` (keys unique across kinds; kind in both hashes), `"global"` in every kind union with exhaustive handling and the shared `contentModelRoute` mapper. Sync creates the singleton draft (`singleton_key = 1`, model-label title); kind changes stay refused. Publish writes no route but bumps the published version and requests a build; unpublish/revert as for pages; delete/duplicate refused with `CONTENT_PAGE_SINGLETON` (message generalized), a second entry with `CONTENT_MODEL_CARDINALITY_CONFLICT`; a global's title is always its label and a slug is rejected. `GET /api/v1/public/globals/:modelKey` returns `{global, media}` (`404` when unpublished, unknown or not a global) through `PUBLIC_GLOBAL_SQL` without `published_routes`; the build export gains `globals` (optional on input, always sent; one media dictionary); SDK `getGlobal()` and `site.global()` with `invalid_export` on duplicate or entry-shared global keys. Migration `0007` rebuilds `content_models` with `PRAGMA defer_foreign_keys` (one D1 batch, also proven through `wrangler d1 migrations apply --local`); the Node migrator suspends foreign keys on its own connection and fails on `foreign_key_check` violations ([ADR 0010](adr/0010-global-models.md)). Admin types widened only. Decisions added: Node SQLite cannot commit a deferred drop-and-rename of a referenced table, so Node and D1 apply the same SQL with different FK handling; the D1 export budget is now `9 + 5 × ⌈(entries + globals)/100⌉` queries; the in-memory fake serves public media of any published snapshot, like SQL. |
| 2026-10-11 | CE5B | `ce05b-admin-globals-starter` | Admin *Site* sidebar group (between Collections and Library, omitted without globals) with singleton links that fall back to `/content#site` before sync; `isSingletonModel` shared by breadcrumbs (*Content › label*), the model route placeholder and the sidebar; a *Site* tour step; a *Site* overview section of global cards (label, description, status, last edit; no path). The global editor shows the label and description instead of a title input (the save sends the stored title unchanged), omits the public URL fact and "Open on site", and its publish and unpublish dialogs name "this site content" and say the change affects every page after the next site build. Root configuration, the reference site and the starter declare a `settings` global (`siteName`, `tagline`); `BaseLayout` takes the page's `site` prop (no second `getSite()` call) and renders a header with static fallbacks. Template `0.24.0` with migration `0007` upgrade steps and manual adoption of the starter global; the managed Astro guide documents `site.global()`. Mocked keyboard e2e for the global flow; the reference fixture and `acceptance:starter` build with and without a published global. Decisions added: `<head>` metadata from settings is left to CE4; the e2e keyboard helpers moved to `e2e/support/keyboard.ts`. |
| 2026-10-12 | CE4A | `ce04a-seo-data-contract` | Routable models opt into SEO with `seo: true` or `seo: { description?, image? }` (fallback fields of the same model; structural flag, projection-only mapping); one global may declare `seoDefaults: { siteName, titleTemplate?, description?, image? }` (projection-only). The SEO group `{title?, description?, image?, canonical?, noindex?}` is a sparse JSON object in `content_snapshots.seo_json` (migration `0008`, additive `ALTER … ADD`), outside `fields`; domain rules: single-line text (title ≤ 200, description ≤ 500 code points), absolute `http`/`https` canonical without credentials or fragment (≤ 2,048), active media image, `noindex` stored only when `true`; `422` issues under `/seo`, `seo_not_allowed` for models without SEO. Save, publish (re-validated), revert and duplicate copy the group; the image is a `$seo`/`image` media reference (200-reference limit, deletion guard, usage *SEO image*, metadata builds, public media and dictionary). Sync: enabling is compatible, disabling is refused with `SEO_REMOVAL_HAS_DATA` unless the temporary `removedSeo: true` hint prunes groups and `$seo` references in the guarded mutation. Admin/public entry DTOs carry `seo` (nulls for unset values) for SEO models; model DTOs carry `seo`/`seoDefaults`; the build export gains a `seo` section with the mappings; SDK `PublishedEntry.seo` passes values through; the admin save round-trips stored SEO unchanged ([ADR 0011](adr/0011-seo-system-group.md)). Decisions added: SEO rules live in `@lacecms/domain`, not beside `isSafeUrl`; models without SEO keep their pinned hashes; the export (not each entry) carries the fallback mappings for the CE4B resolver. |
