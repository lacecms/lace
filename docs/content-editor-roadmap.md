# Lace Content and Editor Roadmap

> Active roadmap. Started 2026-10-10 after the MVP roadmap was archived.
> Waves 1–3 are done. Wave 4 is the final planned wave: CE8 and CE9 are
> detailed for just-in-time OpenSpec proposals in four session units. Further
> capabilities remain a separate backlog.

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

Status values: `backlog`, `draft` (scope not finalized), `planned`,
`proposed`, `in progress`, `done` (archived).

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
| 2 | CE4 | SEO metadata and site defaults | A3 | L | done |
| 2 | CE6 | Block envelope: anchor, visibility, settings | A2 | L | done |
| 3 | CE7 | Group/list fields, Gallery and Navigation blocks | A6 | L | done |
| 4 | CE8 | Rich-text editor expansion | B1 | M | in progress |
| 4 | CE9 | Field layout and form UX | B2 | M | planned |
| Later | CE10 | Entry references and internal links | A7 | — | backlog |
| Later | CE11 | Responsive images | C3 | — | backlog |
| Later | CE12 | Bounded revision history | C1 | — | backlog |

Dependency order inside wave 1: **CE1 → CE2 → CE3**. CE2 does not depend on
CE1 technically and may run in parallel. CE3 depends on CE1 because making
the `image` block's `alt` optional is a structural block change.

Dependency order inside wave 2: **CE5 → CE4 → CE6**. CE4 depends on CE5
because site-level SEO defaults are read from a global. CE6 depends on
neither technically; it runs last by owner choice, but it must land before
beta because it changes the stored and public block contract. Database
migration numbers are assigned when each session is proposed.

Wave 3 completed **CE7A → CE7B → CE7C → CE7D**. Wave 4 follows
**CE8A → CE8B → CE9A → CE9B**. CE8 completes the shared rich-text
format and editing tools before CE9 organizes the forms. Create only the
next selected session's OpenSpec change, never all four in advance. Planning
does not authorize implementation; each apply still requires an explicit
owner request.

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
   `{key, type, schemaVersion, anchor?, className?, hidden, settings, data}`
   (`className` per decision 5).
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
5. **Custom CSS class: an envelope field (decided for CE6A, 2026-10-12).**
   An optional `className` of 1–16 validated class tokens (utility syntax
   such as `md:w-1/2` allowed, at most 256 characters) is stored with the
   envelope, passed as a block prop in CE6B and merged by block sources into
   their root `class`, and edited in the CE6C *Settings* tab. A
   project-declared setting was rejected: every block would need a version
   bump to offer it and the built-ins could not ([ADR 0012](adr/0012-block-envelope.md)).
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
- The validation summary marks problems that only publication reports (a
  required field) in hidden blocks as not blocking publication. Draft problems
  in a hidden block still block saving, because publication validates hidden
  blocks in draft mode (corrected in CE6C).

**Acceptance:** browser tests for editing the anchor, hiding and showing,
editing settings and keyboard access to the tabs; the accessibility
acceptance in architecture section 17 holds.

## 7. Wave 3 — structured fields

CE7A–CE7D are complete and archived. Their generic recursive forms, Gallery
and Navigation establish the baseline for the final editor wave below.

## Step CE7 — Group and repeatable list fields

**Status:** done (CE7A–CE7D archived; CE7D on 2026-10-13).

**Goal:** models and blocks can describe bounded structured objects and
repeatable values, with typed configuration, safe nested media, automatic
admin forms and predictable schema evolution. Ship Gallery and Navigation
as useful first-party examples; use Navigation in a site-wide global.

**Size:** L (four session units).

### Structural model

Pages, collection entries and globals all support model fields and an ordered
list of allowed blocks. Fields are fixed properties defined in configuration;
blocks are sections that editors may add, remove and reorder. Both contain
editable content and follow the draft/publication lifecycle.

`field.group` describes one object with named child fields. `field.list`
describes an ordered array whose elements share one field definition, either
a scalar field or a group. Both builders are available in model fields and
block **data** fields. They do not group or repeat blocks, introduce child
blocks, or expand the CE6 allowlist for presentational block settings.

For example, a Gallery is one block with an `images` list of groups containing
media, alt override and caption fields. Each image item is data belonging to
that block, not an instance of the existing Image block. The site component
receives the complete Gallery data and renders its images together.

A list element has no independent route, publication or entry lifecycle.
Changing a list never creates collection entries. Visual form sections and
configuration-driven tabs remain CE9; a data group is not merely a layout hint.

### Owner decisions (2026-10-12)

1. **Maximum container depth: 6.** Count every `group` and `list` along a
   field-definition branch. The model-fields/block-data root and scalar leaves
   do not count. Rich-text document nodes are outside this counter. A scalar
   may follow the sixth container; a seventh container is refused.
2. **Maximum consecutive groups: 2.** A third directly nested group is
   refused. A list resets the consecutive-group counter, but never the total
   depth counter. This is not a limit of two groups in the entire branch.
3. **No direct list of lists.** A list element may be a supported scalar or
   group, never another list. A nested list must be a named field of a group.
   Schemas are finite; recursive definitions are not supported.
4. **At most 100 elements per list.** A field may declare a lower `maxItems`,
   never a higher limit. Empty lists are representable; publication minimums
   and required-field behavior are made explicit in CE7A.
5. **At most 500 list elements per entry snapshot.** Sum all list lengths in
   model fields and every block's data, including hidden blocks. Nested
   elements count independently: 10 categories with 20 links each consume
   210 elements. Groups do not themselves add to this budget unless they are
   elements of a list. Draft and published snapshots are checked separately,
   not summed together. Count the normalized data after defaults are applied.
6. **Existing payload/media limits remain.** Nested values count toward the
   existing JSON byte limits and the 200-media-reference limit. A shallow
   schema does not bypass these bounds. Enforce all limits on the server;
   admin affordances help editors stay within them.
7. **Ship Gallery and Navigation blocks.** Use the same public builders and
   generic form controls as project-defined blocks. Gallery renders an
   adaptive image grid; Navigation supports links and one level of child
   links. These example schemas need not consume the full permitted depth.
8. **Use Navigation in a global.** The starter and reference site declare a
   route-less `navigation` global that allows the Navigation block, and the
   shared site layout renders its published blocks as site-wide navigation.
   The same block can also render local navigation in page content when that
   model allows it. It reads its own data, not the global implicitly.

### Depth examples and intended coverage

| Structure | Container depth | Outcome |
| --- | :---: | --- |
| Gallery: list → group → media/caption | 2 | allowed |
| Card: group → group → URL/text | 2 | allowed |
| Card: group → group → group | 3 | refused: three consecutive groups |
| Navigation: list → group → list → group → URL/text | 4 | allowed |
| Mega menu: list → group → list → group → list → group → URL/text | 6 | allowed |
| Any branch with a seventh container | 7 | refused |
| Matrix: list → list | 2 | refused: direct list of lists |

This covers galleries, FAQ, testimonials and team cards; pricing plans with
feature lists; footer columns with links; categorized FAQ; and menus with
columns of links. It permits three nested list levels when group elements
separate them. Supporting a schema does not imply shipping a block for every
example: only Gallery and Navigation are selected for CE7.

### Architecture and capability changes

Update the architecture in the relevant session before production code, and
record a short ADR for bounded composite fields:

- Section 8: the field DSL, recursive serializable descriptors and value
  inference, draft/publish semantics, limits and nested sync classification.
- Sections 9.3, 9.4 and 9.7: nested values stay in the existing fields/block
  JSON payloads; nested media enter the reference projection and deletion
  guard. Section 9.5 retains the flat top-level block invariant.
- Sections 10–12: nested validation, entry-wide budgets, copy/lifecycle
  behavior, block definitions and admin/public contracts.
- Sections 13 and 17: render validation, registry/starter delivery and nested
  admin controls with accessible error navigation.
- Sections 20 and 22: cross-runtime verification and upgrade compatibility.

Affected accepted capabilities include `content-validation`,
`content-model-configuration`, `block-registry`, `schema-evolution`,
`configuration-synchronization`, `content-repository-contracts`, the Node and
D1 repositories, `rest-contracts`, `admin-draft-editor`, media usage/delivery,
`render-core`, the block source registry and generated-project acceptance.
Each proposal resolves the exact affected spec paths for that session.

No new composite-value tables are planned. If a change to media-reference
storage needs a database migration, propose it explicitly for both runtimes;
do not assign a migration number in advance.

### Session CE7A — Composite field definitions and end-to-end data contract

**Status:** done (archived 2026-10-12) in
[`ce07a-composite-field-data-contract`](../openspec/changes/archive/2026-10-12-ce07a-composite-field-data-contract/proposal.md)
on the shared Wave 3 branch `codex/content-editor-wave-3`. Implementation was explicitly authorized on 2026-10-12. The proposal includes safe read-only admin inspection
until CE7C and explicit sync refusals for unsupported composite evolution until
CE7B; those sessions retain their own scope.

- Add typed `field.group` and `field.list` builders, recursive portable
  descriptors and exhaustive consumers. Preserve field inference through
  nested objects and arrays; reject cyclic definitions, malformed children
  and invalid defaults before startup.
- Define absence, empty object/list, `required`, defaults and `minItems` /
  `maxItems` precisely. Preserve the existing principle: incomplete required
  content can be saved as a draft; wrong present types, unknown keys and
  safety/maximum limits cannot. Publication enforces required descendants of
  present groups/list items and declared minimums. An absent optional group
  does not manufacture missing-child errors.
- Apply the agreed depth, consecutive-group and list rules to every schema
  and the per-list/entry-wide element limits to normalized content. Hidden
  blocks still consume the entry budget and retain draft-mode publication
  validation. Use shared rules for API and render validation.
- Extend configuration metadata, runtime validators, REST/OpenAPI schemas,
  SDK/public data parsing and render-core handling to carry composites.
  Keep the CE6 settings field allowlist unchanged and collection `listFields`
  restricted to its currently supported scalar fields.
- Recursively collect nested media references using unambiguous field paths
  that distinguish group keys and list indices while preserving existing
  scalar paths. Maintain usage labels, deletion protection, metadata-triggered
  builds, public media resolution and hidden-block delivery filtering.
- Verify save, load, publish, revert, duplicate and block migration results on
  Node SQLite and D1. Reorder/removal rewrites the media projection from the
  resulting snapshot; stale indices must not protect removed media or release
  remaining media. Keep existing scalar-only encodings/hashes compatible.

**Acceptance:** typed fixtures and runtime negative tests for all schema
boundaries (6/7 depth, 2/3 consecutive groups, direct list-of-list), list lengths
100/101 and entry totals 500/501, including defaults and hidden blocks; nested
validation errors have precise JSON Pointer paths; nested media survive all
lifecycle operations and disappear from usage only when no stored reference
remains. Public output resolves nested media consistently on both runtimes.
Scalar-only configuration and content retain their existing behavior.

**Implementation evidence (2026-10-12):** CE7A is implemented on
`codex/content-editor-wave-3`; all 23 OpenSpec tasks are complete. Its 14 delta
requirements were synchronized into 11 main capabilities, and the change was
archived on 2026-10-12. Definitions,
normalization, budgets, metadata/OpenAPI, recursive media traversal, guarded
migration scans, SDK/render compatibility and read-only admin inspection are
covered. Storage remains in the existing JSON columns; no DB migration was added.
At CE7A completion, CE7B/CE7C/CE7D had not been started or pre-created.

Passing verification:

- `pnpm --filter @lacecms/{content,config,contracts,application,server,sdk,render,test-utils} test`
  (each package run separately): 63 / 46 / 70 / 71 / 79 / 85 / 79 / 44 tests.
- `pnpm --filter @lacecms/content type-test`,
  `pnpm --filter @lacecms/config type-test`, and
  `pnpm --filter @lacecms/render typecheck` preserve nested inference and rejected values.
- Node shared repository suite: 134 tests across file and in-memory SQLite.
  D1 shared repository + budget suites: 74 tests under local Miniflare/workerd.
  These cover nested references, route/global/export filtering, metadata builds,
  lifecycle copies, guarded rollback, 500/501 migration totals, unchanged/hidden
  data, sync refusal without writes and resumable scalar regressions.
- Focused admin field controls, draft preservation, editor validation/summary and
  usage labels: 44 tests. Maximal D1 create/save/publish uses one batch per mutation,
  with 200 blocks, 200 nested media locations and 500 elements, within 50 queries
  and 100 binds per statement.
- `pnpm openapi:generate` and `pnpm openapi:check`: generated artifact is deterministic.
  The check used a temporary Git index containing the planned artifact because
  the script also requires no artifact diff against the index; the user's index
  was untouched.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and
  `pnpm exec openspec validate ce07a-composite-field-data-contract --type change --strict`.
  Existing lint warnings outside this change remain non-failing.

### Session CE7B — Nested schema evolution and synchronization

**Status:** implemented on 2026-10-12 in
[`ce07b-nested-schema-evolution`](../openspec/changes/archive/2026-10-12-ce07b-nested-schema-evolution/proposal.md),
with apply explicitly authorized. Accepted specs were synchronized and the change
was archived on 2026-10-12. CE7C/CE7D remain separate delivery units; CE7C implementation is recorded below.

- Extend CE1's canonical structure comparison recursively. Child display
  metadata is projection-only; nested structural changes are explicit and
  retain model/block version requirements. Preserve keys in stored defaults
  even when named `label` or `description`.
- Support compatible child additions, defaults and validated constraint
  changes within groups and across list elements. Tightening list bounds
  scans existing snapshots and refuses offending data without pruning it.
- Extend explicit model-field rename/removal hints to unambiguous nested
  schema paths, including a defined way to address fields of every list item.
  Define their syntax in the proposal; never infer renames, remove list items
  to satisfy a maximum, or convert a scalar into a composite silently.
- Existing block-data changes continue through versioned block migrations.
  Validate complete resulting snapshots, including the aggregate list budget
  and media constraints, not only each migrated block in isolation.
- Preserve guarded writes, concurrency conflicts, media-reference rebuilding,
  published-version/build behavior and resumable block migration semantics.
  `--check` reports nested paths and affected snapshots without writing.

**Acceptance:** adding a child to existing group/list values, nested default
application, hinted nested rename/removal and rejected tightening are covered
on both runtimes; nested media rename/removal updates usage correctly;
invalid/over-budget migrations and unhinted destructive changes are refused;
repeated sync and interrupted block migration remain safe. Reports identify
model, snapshot and nested schema path.

**Implementation evidence (2026-10-12):**

- Recursive configuration hints, ancestor pairing, defaults, tightening and
  concrete diagnostics are shared by preparation and final persistence.
- Composite JSON and complete `$fields` references use exact parameterized
  payloads in the existing guarded final transaction/batch. Scalar SQL fast
  paths remain. No staging tables or SQL migration were added.
- Shared contracts run on file-backed/in-memory SQLite and local D1: nested
  parent/child moves, media removal/usage, missing-parent defaults, tightening,
  multi-page scans, stale saves, injected rollback, combined model/block
  budgets, interrupted migration with pending nested backfills and no-op reruns.
- A permanent local D1 batch fixture rewrites 251 snapshots with 198 field media
  locations each (49,698 references), preserving two other reference sources per
  snapshot. It checks JSON types, audits, guards, rollback and replay; chunks
  require at most 15 statements in one batch. A separate D1 test changes media
  references between the final reread and execution and confirms no final writes.
- Application reports retain the 20-snapshot cap and full counts. The CLI nested
  fixture proves both valid and invalid `--check` runs write nothing and preserves
  existing pending/blocked/current exit behavior.
- Operator examples, recovery, media-default rules and matching backup/rollback
  guidance are documented in [configuration synchronization](configuration-synchronization.md#ce7b-nested-schema-evolution).

Passing verification:

- Content/config/application/db/memory-double tests: 64 / 54 / 83 / 16 / 45.
- Shared repository contracts: 142 SQLite tests (two runtimes), 71 local D1
  tests. D1 adapter/bulk tests add 9 cases (80 D1 tests total); CLI commands add
  6 tests, including Node/D1 operation and the nested no-write check.
- Content/config type tests and root `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check` passed. Existing builder/DB lint warnings remain non-failing;
  the changed production code introduces none.
- `pnpm exec openspec validate ce07b-nested-schema-evolution --type change --strict`
  passed. SQL migration inventory remains unchanged. All four updated accepted
  capabilities passed strict validation before archive.

### Session CE7C — Generic group and list editing

**Status:** implemented, synchronized into the three accepted capabilities and
archived on 2026-10-12 as
[`ce07c-generic-group-list-editing`](../openspec/changes/archive/2026-10-12-ce07c-generic-group-list-editing/). Configuration/editor behavior and rollback guidance are
in [Composite fields](composite-fields.md). CE7D remains separate and unimplemented.

- Render groups as labelled fieldsets with descriptions and nested controls.
  Render lists as labelled repeatable items, supporting Add, Remove,
  Duplicate, Move up/down and accessible drag-and-drop ordering. Reuse media,
  rich-text and scalar controls within composites.
- Keep complex items collapsible, with a useful summary and error/count
  indicators. Define optional presentation metadata for item labels in this
  proposal; it must not alter stored content or structural hashes.
- Preserve editing state during moves/collapse: values, rich-text selection
  where applicable, media selection and field errors must follow the correct
  item. UI identity must not introduce an undocumented public data envelope.
- Show per-list counts and entry-budget feedback. Prevent Add/Duplicate when
  they would exceed a maximum, including the nested elements copied by a
  duplicate; show publication-only minimum/required issues distinctly from
  errors that block draft saving.
- Map local/server nested errors to exact controls. Summary activation opens
  the relevant block tab and all containing collapsed groups/items, then
  focuses the field. Read-only viewers can inspect every value without
  mutation actions.
- Preserve save/discard, unsaved-navigation protection, revision-conflict
  recovery, Copy my JSON, revert, duplication and the existing save shortcut.

**Acceptance:** browser tests cover model and block composites, nested lists,
media selection, item duplication/removal/reordering, collapsed error focus,
limits and conflict recovery without lost values. Keyboard-only operation and
accessibility audits meet architecture section 17; viewers cannot mutate data.

**Verification evidence (2026-10-12):**

- Content descriptor tests: 65 passed plus content type tests; contracts: 71
  passed; config: 55 passed; focused application configuration evolution: 28
  passed. Existing descriptor/hash fixtures remain pinned. `pnpm openapi:check`
  reproduced the checked-in generation using a temporary Git index/object store
  for the intentional uncommitted OpenAPI delta; the real index was untouched.
- Admin suite: 166 files / 705 tests passed. Following final focus and pending
  control fixes, the affected editor/block components passed a further 83 tests;
  another 22 SEO/block-card tests passed after final permission/pending-request
  guards.
  Composite-focused coverage includes absence/empty containers, defaults,
  detached copies, identical item identity, transient scalar clears, recursive
  errors, explicit 100/101 and 499/500/501 boundaries, hidden blocks and rich-text
  exclusion. Descriptor-aware serialization also covers a group whose `type`
  child contains `doc` without confusing it with a rich-text document.
- Playwright: 37 scenarios passed across `composites.e2e.ts`, `editor.e2e.ts`,
  `block-envelope.e2e.ts`, `seo.e2e.ts` and `entry-actions.e2e.ts`. CE7C fixtures
  cover page/collection/global fields, block data, pointer and nested keyboard
  sorting/cancellation, scalar insertion, media selection/upload, rich text,
  limits, delayed saves, conflict JSON/reload and exact nested focus through
  block tabs/disclosures. Axe passed for editor and viewer forms in light/dark
  themes at 375px without globally disabled rules; no horizontal overflow.
  The final pending-control changes passed the 20-scenario composites/envelope/SEO
  subset again. The envelope keyboard harness waits for menu closure/focus return
  before starting the next action.
- Root typecheck, Oxlint/boundary/color checks, Oxfmt and strict validation of
  `ce07c-generic-group-list-editing` all passed. No SQL
  migration or persisted list-item envelope was added. The documented descriptor
  example passed shared metadata normalization and nested publication validation.
- Browser fixtures mock the API; this is editor acceptance and shared-contract
  verification, not a new deployed Node/Cloudflare or owner-site acceptance run.
  Gallery/Navigation definitions, shipped layouts and starter adoption remain CE7D.

### Session CE7D — Gallery, Navigation and shipped site examples

**Status:** done (archived 2026-10-13) in
[`ce07d-gallery-navigation-site-examples`](../openspec/changes/archive/2026-10-13-ce07d-gallery-navigation-site-examples/proposal.md)
on `codex/content-editor-wave-3`, with apply explicitly authorized. Decisions: both blocks are built-ins in
`builtInBlocks`; a navigation parent with children is a native
`<details>`/`<summary>` disclosure whose submenu starts with the parent's own
URL (no JavaScript; no Escape/outside-click closing); root-relative links to the
current page get `aria-current="page"`; components ship no styles (the grid and
narrow-screen navigation CSS live in the site stylesheets and the managed
guide); the layout falls back to static links only while the `navigation`
global is unpublished; the reference fixture's local navigation sits on the home
page (the about page keeps envelope-free blocks for CE6B); the CE3B
inherited-alt hint is not extended to list items. Starter template `0.27.0`.

- Add Gallery and Navigation definitions and Astro source components to the
  registry, reference site and starter, with matching schemas and components.
  Both honor the CE6 envelope (anchor, CSS classes, hidden behavior) and use
  generic admin editing without block-specific React forms.
- Gallery: optional section title and a list of image groups with media,
  optional alt override and caption. Follow CE3 media metadata/fallback rules,
  render dimensions and focal point, and ship a responsive grid. Responsive
  image variants/srcset remain CE11; lightbox and carousel are not required.
- Navigation: a list of labelled URL items with an optional list of labelled
  child links (one submenu level). Define parent-link/disclosure behavior in
  the proposal; ship keyboard-accessible disclosure and narrow-screen behavior.
  Links use existing safe URL forms, not CE10 entry references. Supporting
  deeper user-defined schemas does not require a built-in mega-menu renderer.
- Add a `navigation` global allowing this block and render it through the
  normal block map from the shared layout. Reuse the already-loaded site
  view, supply a useful fallback before publication, and preserve existing
  site-name and SEO behavior. Normal global save/publish/unpublish semantics
  control when site-wide navigation changes become visible.
- Document configuration examples for model-level groups/lists as well as
  the two blocks, the limit counters, nested evolution and media behavior.
  Update registry metadata, starter ownership template, compatibility and
  manual adoption instructions for user-owned layouts/configuration.

**Acceptance:** reference and packed generated sites build with both blocks;
Gallery media, captions and alt fallbacks render correctly; Navigation works
with keyboard and narrow viewports, globally and in page content. Published
navigation drives the layout while later draft edits remain isolated;
unpublished/missing navigation uses the fallback. Starter/registry parity and
cross-runtime editor-to-public-delivery checks pass.

### Completion and boundaries

CE7 is complete only when all four sessions are implemented and verified,
including root typecheck, Oxlint, Oxfmt and each change's strict OpenSpec
validation. Architecture/spec updates and upgrade guidance accompany their
changes; archiving remains an explicit owner action.

CE7 does not add nested blocks, heterogeneous list item types, references,
custom React block editors, conditional visibility, configurable form tabs,
new rich-text features or responsive image generation. CE7 is complete;
CE8 and CE9 are planned in wave 4 against its recursive editor baseline.

## 8. Wave 4 — rich text and form UX

The final planned wave contains CE8 and CE9, each split into two session
units. The owner approved this scope on 2026-10-13 after CE7 completion.
Word/Google Docs paste cleanup and conditional forms are deferred to the
later backlog; neither is a wave-completion requirement.

## Step CE8 — Rich-text expansion

**Status:** CE8A and CE8B implemented, verified and synchronized; changes archived as `2026-10-13-ce08a-shared-document-format-rendering` and `2026-10-13-ce08b-rich-text-authoring`.

**Goal:** every rich-text field supports one shared set of useful authoring
features, safely from the admin through publication to Astro rendering.

**Size:** M (two session units).

### Owner decisions (2026-10-13)

1. All rich-text fields use the same supported feature set, including leaves
   inside CE7 groups/lists and block data. Do not add per-field node/mark
   allowlists or configurable heading sets.
2. Preserve H1–H3 and add H4. Existing documents remain valid without heading
   rewrites, destructive normalization or a new default that excludes H1.
3. Add horizontal rules and plain code blocks. Code preserves whitespace and
   line breaks; syntax highlighting and language selection are out of scope.
4. Each rich-text link offers its URL, an **Open in a new tab** switch and a
   **nofollow** switch. These are per-link document attributes, not settings
   of the field or Astro layout. Ordinary URL fields remain strings.
5. An unchecked new-tab switch uses the current browsing context; a checked
   switch stores `target: "_blank"`. The renderer automatically adds
   `noopener noreferrer` for a new tab and merges `nofollow` when requested.
   Accept only the supported target/rel forms, not arbitrary attributes or
   arbitrary rel tokens. Existing href-only links retain their behavior.
6. Add a small selection bubble menu for common formatting and link actions.
   Keep the fixed toolbar, keyboard shortcuts and an accessible route to every
   action; the bubble menu is an additional entry point.
7. Keep ordinary Tiptap paste behavior. Dedicated Word/Google Docs cleanup,
   source-specific normalization and compatibility testing move to backlog.
   This deferral does not weaken the shared document/URL safety rules.

### Architecture and capability changes

Update architecture sections 11 and 17 before implementation: the explicit
shared rich-text contract gains H4, horizontal rules, code blocks and the
limited link attributes; the toolbar gains the corresponding actions.

`@lacecms/content` remains the source of document validation and URL safety.
`@lacecms/render` reuses it and describes safe elements; `@lacecms/astro`
renders the description. The admin produces that same format. No site-local
allowlist copies, raw HTML support or arbitrary styles are introduced.

Affected capabilities include content validation, field-descriptor defaults,
render core, Astro adapter and admin draft editing. Carry upgrade guidance
for the expanded format: once new nodes/attributes are stored, an older
engine/site renderer may reject them. No database migration or automatic
rewrite of existing documents is planned; CE8A confirms the exact contract
and release/adoption requirements.

### Session CE8A — Shared document format and rendering

- Extend shared types and validation for H4, horizontal rules, plain code
  blocks and the limited link target/rel attributes. Validate rich-text
  defaults through the same rules; preserve existing valid documents.
- Extend the render core and Astro rich-text output together. Escape text,
  preserve code whitespace and generate safe link attributes with independent
  new-tab and nofollow behavior.
- Verify validation/rendering agreement, rejection of unsupported attributes
  and unsafe URLs, and nested rich-text use without changing CE7 budgets or
  draft/publication semantics.
- Update architecture/specs, public-format compatibility guidance and
  reference rendering fixtures. Keep this independently verifiable before
  the admin starts producing the expanded format.

**Acceptance:** existing H1–H3 and href-only documents still validate and
render; H4, rules, code and all four new-tab/nofollow combinations render
correctly through Astro. Unsafe URLs/attributes fail through the shared
validator, and code is emitted as escaped text with preserved whitespace.

CE8A verification (2026-10-13): shared content types/validator and defaults,
render descriptions and actual Astro output cover H4, void rules, plain code
with escaped text and exact whitespace, independent new-tab/nofollow choices,
negative attribute/URL cases and nested field/block use. The reference fixture
covers the expanded output in static and live-export builds. Content (92),
render (101), Astro (37) and reference builds (3) pass, along with content public
type tests, root typecheck, Oxlint, Oxfmt and strict change validation. No database
migration, document rewrite or block-version bump. ADR 0014 and compatibility
guidance record coordinated upgrades and the interim admin limitation until
CE8B; this session does not enable expanded authoring in the current editor.

### Session CE8B — Authoring tools and product verification

- Add H4, horizontal-rule and code-block actions to the fixed toolbar and
  corresponding editor extensions. Available buttons, shortcuts and editor
  output follow the single CE8A format in every rich-text field.
- Extend the link popover with new-tab and nofollow switches, including
  editing/removing existing links and retaining selection while controls
  have focus. Add the selection bubble menu without losing the fixed
  toolbar's keyboard navigation or read-only behavior.
- Verify undo/redo, save/reload, publish and Astro delivery for new features,
  including fields inside groups/lists and state retention across list
  moves, disclosures and block tabs. Ordinary paste still produces safe
  documents, without a dedicated Word/Google Docs cleanup commitment.
- Update authoring documentation, reference/starter examples and upgrade
  instructions for consumers of the common renderer. Run focused browser
  and accessibility checks plus the standard completion checks.

**Acceptance:** authors can create, change and remove every new feature;
links retain both switches after save/reload, and published output matches
those choices. Keyboard users can reach all actions, viewers cannot edit,
and existing content is not silently dropped when opened in Tiptap.

## Step CE9 — Field layout and form UX

**Status:** planned; follows CE8.

**Goal:** make long and nested forms easier to understand and navigate without
changing their stored data shape or content lifecycle.

**Size:** M (two session units).

### Owner decisions (2026-10-13)

1. Add configurable placeholders, consistent required markers and clear
   constraint guidance. These apply to supported controls at every CE7 depth.
   Required/minimum constraints retain their existing publication-only
   semantics; a required marker does not make an incomplete draft unsavable.
2. Text/textarea counters show current character usage and declared limits.
   Distinguish enforced limits from advisory SEO recommendations; reuse the
   shared validation's character-counting semantics.
3. Code-first form metadata may organize fields into visual sections/tabs
   and specify their order. A visual section is not a `field.group`: it does
   not create a JSON object, move values or alter their paths.
4. Preserve the special behavior of existing SEO and block Content/Settings
   controls. Switching tabs must preserve values and local editor state;
   validation summaries reveal the correct tab and nested control.
5. Suggest a slug from the title for new collection entries until the author
   first edits the slug manually. Later title changes do not overwrite a
   manually chosen slug or change an existing entry's slug. Server route
   validation remains authoritative; suggestions do not guarantee uniqueness.
6. Conditional visibility is excluded. Plan it later as a complete system
   together with conditional validation, dependency rules, value retention
   and publication behavior, including nested groups and list items.

### Architecture and capability changes

Update architecture sections 8 and 17 for serializable presentation metadata,
form navigation and slug suggestions. Field/config definitions project the
metadata to the admin through normal contracts; no executable callbacks or
custom React forms are required.

Presentation-only changes affect the projection hash, not the structural
hash, and require no content migration or structural model-version bump.
Keep public content values and CE7 paths unchanged. Define the exact metadata
syntax, supported nesting and invalid-reference checks in the corresponding
just-in-time proposals; this roadmap does not prescribe an unverified DSL.

Affected capabilities include field descriptors, content-model configuration,
configuration synchronization, REST metadata and admin draft editing.

### Session CE9A — Field metadata and guidance

- Define and project configurable placeholders as portable display metadata,
  retaining current behavior where omitted. Preserve inherited SEO/media
  explanations rather than obscuring them with generic placeholders.
- Standardize required markers, accessible descriptions and constraint hints
  across applicable controls, including nested groups/lists and read-only
  inspection. Do not change default application or draft validation rules.
- Add text/textarea character counters using shared count semantics and
  declared bounds; keep advisory SEO counters distinguishable from hard
  limits and avoid noisy announcements on every keystroke.
- Verify metadata normalization/projection, unchanged structural hashes and
  content values, nested control behavior and accessibility. Document the
  configuration options and author-facing guidance.

**Acceptance:** applicable nested controls show their configured placeholders,
required state and accurate counters; guidance agrees with validation, and
incomplete drafts remain savable. Metadata-only edits neither rewrite content
nor require a structural model-version bump.

### Session CE9B — Form organization and slug suggestions

- Define serializable layout metadata for visual sections, tabs and field
  order in model/block forms, including supported CE7 nesting. Reject invalid
  field references and ambiguous placement; fields without layout metadata
  retain a predictable default layout.
- Render the layout without changing stored data, materializing absent
  containers or losing rich-text/media/list state. Reuse existing SEO and
  block settings behavior. Validation indicators and summary links select
  the appropriate tab, open ancestor disclosures and focus the exact control.
- Suggest slugs for new collection entries while the slug remains automatic;
  stop on manual editing and preserve existing slugs. Define normalization,
  non-Latin/empty-title behavior and conflict feedback in the proposal rather
  than silently inventing route or transliteration rules during apply.
- Verify keyboard navigation, nested error recovery, narrow screens,
  read-only behavior and save/discard/conflict flows. Update configuration
  examples, reference/starter guidance and compatibility documentation as
  applicable; complete the standard quality checks.

**Acceptance:** forms can be organized without changing saved/public JSON;
tabs retain editing state and errors remain reachable. New-entry suggestions
follow the title until manual override, existing slugs remain stable, and
route conflicts receive the normal server feedback.

### Completion and boundaries

Wave 4 completes after CE8A, CE8B, CE9A and CE9B are implemented and verified,
with architecture/spec updates, documentation and the standard root checks
and strict OpenSpec validation for each change. Archive remains an explicit
owner action. Create only the next session's proposal when selected.

The wave does not add per-field rich-text restrictions, tables, rich-text
images, code syntax highlighting, Word/Google Docs cleanup, conditional forms,
entry references, responsive image generation or revision history.

## 9. Later capabilities — backlog

These items are outside the final planned wave. CE10–CE12 retain their relative
order; the two deferred editor topics require separate scope/session planning
when selected and do not yet have an implementation order or new CE numbers.

- **CE10 Entry references and internal links (A7):** reference fields and
  `entry:<id>` links in URL fields and rich text, resolved to paths at build
  time so slug changes do not break links.
- **CE11 Responsive images (C3):** width variants and `srcset` through
  Astro image optimization or Cloudflare Images, using CE3 dimensions and
  focal point.
- **CE12 Bounded revision history (C1):** a small number of retained
  published versions with restore. Requires changing the MVP exclusion of
  revision history.

- **Word/Google Docs paste cleanup (deferred from CE8/B1):** normalize source
  markup into supported rich text, preserve meaningful text/lists/links and
  remove unsupported styling and unsafe attributes. Define loss handling and
  test representative clipboard samples. Document-file import, tables and
  image import are separate scope decisions, not implied by this item.
- **Conditional forms (deferred from CE9/B2):** design declarative visibility
  together with conditional validation, dependencies/cycles, hidden-value
  retention and public delivery. Cover groups, per-item list scope, defaults,
  server enforcement and reachable validation errors; do not ship a partial
  visibility-only mechanism as CE9.

Further candidates, not yet ordered: scheduled publication (C2, an MVP
exclusion), bulk list actions and field-value filters, media folders and tags,
token-protected draft preview, trash for deleted entries, and an early
decision on whether localized content will ever be supported, because locales
would affect snapshot and route keys.

## 10. Session log

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
| 2026-10-12 | CE4B | `ce04b-site-seo-output` | The published-site loader reads optional `LACE_BUILD_SITE_URL` (the same operator setting as "Open on site"; normalized to a trailing slash, no credentials, query or fragment) and `LACE_SITE_INDEXING` (`on` by default, `off`), failing with `missing_configuration` without echoing the value; the site view gains `url`, `indexing`, `urlFor(path)`, `allEntries()` and `seo(entry)`. The pure `resolveSeo` applies the ADR 0011 chain: stored title, otherwise the entry title through a title template containing `%s` (inserted literally) or the default `%s \| {siteName}`; description and image from the stored value, the mapped field and the site default (whitespace collapsed; only resolved `image/*` media); canonical from the stored value or site URL plus path; `noindex, follow` for stored `noindex`, `noindex, nofollow` everywhere when indexing is off. `renderSitemapXml` lists indexable entries whose stored canonical, if any, is their own URL (`lastmod` from `publishedAt`, optional `include` filter, `undefined` without a site URL) and `renderRobotsTxt` allows all with a `Sitemap:` line or disallows all when indexing is off. `@lacecms/astro` adds `LaceSeo.astro` (title, description, canonical, robots, Open Graph with image dimensions and alt, `twitter:card`; `og:type` prop) and `sitemapResponse`/`robotsResponse` (bodiless `404` and one build warning without a site URL, so static builds write no sitemap). The VPS builder validates both settings at startup and forwards them; Compose and the Pages workflow pass them. Reference site and starter template `0.25.0` enable SEO, map `seoDefaults` on `settings`, render `<LaceSeo>` and add `sitemap.xml` and `robots.txt` endpoints; upgrade instructions carry migration `0008` and manual adoption ([ADR 0011](adr/0011-seo-system-group.md)). Decisions added: Lace does not set Astro's `site`; the sitemap also leaves out entries canonical elsewhere; staging indexing off means `noindex, nofollow`; the starter omits a title template field. |
| 2026-10-12 | CE4C | `ce04c-admin-seo-editing` | Entries of SEO-enabled models get an *SEO* card after *Fields*: SEO title and description with `n / 60` and `n / 160` character counts and a non-blocking warning above them, the SEO image through the media picker, canonical URL and "Hide from search engines"; the group lives in the draft form (`seo`), so discard, revert, conflict reload and "Copy my JSON" follow it, and every save sends the complete group with `null` for blank values (no `seo` key without SEO). The domain limits are checked locally through `isCanonicalUrl`/`normalizeSeoText`, now re-exported by `@lacecms/contracts`; `/seo/<key>` server issues map to the controls and the summary, `/seo` stays text. Empty values show the inherited value ("Uses entry title: …", "Uses {field}: …", "Uses site description: …", "Uses this page's URL: …", inherited image) and a search-result preview resolves title, URL and description from unsaved values and the published defaults global. The defaults global annotates its mapped fields for writers and viewers. Mocked keyboard e2e and axe audits in both themes. Decisions added: `seoText` and `formatSeoTitle` moved from the SDK to `@lacecms/contracts` (SDK exports unchanged); placeholders read published, not draft, defaults; line breaks in the description are reported, not replaced; the validation summary now takes focus on the first render that shows it (local errors could arrive a render late in real browsers). |
| 2026-10-12 | CE6A | `ce06a-block-envelope-contract` | Stored blocks gain an envelope `{anchor?, className?, hidden, settings}` beside their data in `content_blocks` (migration `0009`, additive `ALTER … ADD` with constant defaults and a partial unique index on `(snapshot_id, anchor)`); every block copy and write lists the columns on Node and D1 (D1 binds the envelope as one JSON value per row, so a 200-block save stays at 32 queries). Rules live in `@lacecms/content`: anchor `^[a-z][a-z0-9-]{0,63}$` unique within the entry (hidden blocks included, `duplicate_block_anchor`), class name of 1–16 tokens normalized to single spaces (≤ 256 characters, utility syntax allowed), boolean `hidden`, settings validated with defaults (`unknown_field` under `/blocks/<i>/settings`). `defineBlock({ settings })` accepts `select`/`boolean`/`number`/`text` settings with required defaults; they enter block metadata only when declared, so existing hashes are unchanged. Block migrations take and return `{data, settings?}`; sync validates migrated settings and keeps anchor, class and hidden flag. Publication and sync migrations validate hidden blocks in draft mode; public responses, globals and the build export leave hidden blocks out (repository projection and contracts), and media used only by hidden blocks leave the public dictionary and media route while keeping usage and the deletion guard. Admin block DTOs always carry `hidden` and `settings`, requests default omitted envelope values, public blocks carry no `hidden` and parse a missing `settings` as `{}`; SDK `PublishedBlock` is the public block DTO. The admin keeps loaded envelopes, starts new blocks with setting defaults and drops the anchor from duplicated blocks ([ADR 0012](adr/0012-block-envelope.md)). Decisions added: the custom CSS class is an envelope field (decision 5); contracts type settings as a plain record (a Valibot default over the recursive JSON type exceeds TypeScript's depth); the CE1C migration signature change is recorded as breaking in `compatibility.md`. |
| 2026-10-12 | CE6B | `ce06b-block-rendering-delivery` | The render core skips hidden blocks before resolving them (so a hidden block of an unknown type, an old version or with invalid data never fails a build), and block props gain `anchor`, the normalized `className` and `settings` typed from the definition (`BlockSettingsOf`, defaults applied); `parseBlockEnvelope` re-checks envelopes that bypass the SDK and fails with `invalid_block_envelope` and the field path. `RenderableBlock` members admit `undefined` because Valibot types optional DTO keys that way. `LaceBlocks` passes the envelope without a wrapper and is now rendered in tests through Astro's container API. Registry revisions `cta` 2, `hero` 3, `image` 4, `quote` 2 and `richText` 2 put the anchor on the root `id` and the class name after the component's own classes (`class:list`), with unchanged markup without an envelope; custom scaffolds follow the same convention. The reference fixture links `#get-started` to the anchored, classed home call to action, and the packed starter acceptance asserts it; the Node journey adds an anchored hero and a hidden quote. Template `0.26.0` ships the components, the `0009` upgrade steps (rollback restores the backup once envelopes exist, because an older engine would deliver hidden blocks), the migration signature break and `lace add block --all` adoption; the managed guides document the props, declared settings, per-entry anchor uniqueness and the hidden-block rule. |
| 2026-10-12 | CE6C | `ce06c-admin-block-envelope` | Expanded block cards get *Content* and *Settings* tabs (both panels force-mounted, arrow/Home/End selection, problem markers in tab names, selection kept per block key). *Settings* edits the anchor with live format and per-entry uniqueness checks (hidden blocks included) and *Copy link* (the entry's site URL plus `#anchor` when the build site URL and path are known, otherwise `#anchor`), the *Hide on site* switch, declared settings through the field controls and *CSS classes* with the shared class-name rule. Hidden cards are muted (muted background, dashed border) with a *Hidden* badge in the accessible name; the card menu offers Hide block / Show block with a status announcement, and the header shows `#anchor`. Anchor and class name are strings in form state and blank values are not sent; cleared settings fall back to their defaults. Envelope issue paths map to the Settings controls, and the summary opens the Settings tab before focusing one. Viewers get a read-only *Settings* section without tabs. Decisions added: only publication-only problems (a required field) in hidden blocks are non-blocking and uncounted in the summary; draft problems in hidden blocks still block saving (roadmap wording corrected). CE6 and wave 2 complete. |
| 2026-10-13 | CE7D | `ce07d-gallery-navigation-site-examples` | Built-in `gallery` (optional title; `images` list, default `[]`, 1–50 items of media with optional alt/caption overrides, item label `caption`) and `navigation` (optional accessible `name`; `links` list, default `[]`, 1–20 items of label, optional URL and up to 20 `children` with label and URL) join `builtInBlocks` at version 1 without settings; configurations that do not register them keep their hashes. Registry items `gallery` and `navigation` (revision 1) render a `section.gallery` of figures through the image describer (item alt, media alt, `""`; caption fallback; dimensions, focal point, `loading="lazy"`) and a `nav.navigation` whose parents with children are native `<details>`/`<summary>` disclosures starting with the parent URL, with `aria-current="page"` on root-relative links to the current page; components ship no styles or scripts. `LaceBlocks` renders a published global (tested). The reference configuration allows all seven built-ins (`home` 5, `about` 4, `posts` 5, `notes` 4) and adds a `navigation` global rendered by `BaseLayout` in the header with static fallback links while unpublished; the fixture adds a submenu navigation global, a post gallery and home-page local navigation. Template `0.27.0`: starter `home`/`posts` version 2 with seven blocks, the `navigation` global, layout fallback, grid and narrow-screen CSS in `global.css`, managed-guide sections (blocks, global-in-layout, model-level groups/lists, limits, evolution) and manual adoption instructions (no migration). The packed starter and cross-runtime Node/Worker journeys verify gallery alt fallbacks, header navigation and draft isolation. Decisions added: both blocks are built-ins; the inherited-alt admin hint stays top-level; the cross-runtime model-list expectation now includes globals (stale since CE5B); `check-boundaries` cannot scan a `#` inside a regular-expression literal in `.astro` frontmatter. CE7 complete. |
| 2026-10-13 | — | — | Wave 4 planned after CE7 completion: CE8A → CE8B → CE9A → CE9B. One shared rich-text feature set (H1–H4, horizontal rules, plain code blocks, per-link new-tab/nofollow, bubble menu); no per-field restrictions. CE9 covers placeholders, required guidance, counters, visual layout and new-entry slug suggestions. Word/Google Docs cleanup and complete conditional forms move to later backlog alongside CE10–CE12. No OpenSpec change created or implementation authorized by this planning update. |
| 2026-10-13 | CE8A | `ce08a-shared-document-format-rendering` | Implemented shared H4/rules/plain-code types, validation/defaults and framework-neutral/Astro rendering. Stored links accept only href plus optional target `_blank` and rel `nofollow`; rendering derives `noopener noreferrer` and independently merges nofollow. Existing documents retain their format; nested budgets and draft/publication rules stay unchanged. 233 focused tests, content type tests and all required root checks pass. ADR 0014 and compatibility guidance cover coordinated adoption and rollback; admin extensions and preservation of expanded documents remain CE8B. Change remains active pending explicit synchronization/archive. |

| 2026-10-13 | CE8B | `ce08b-rich-text-authoring` | Implemented H1–H4, horizontal rules, plain code blocks, independent new-tab/nofollow switches and a selection bubble menu in every rich-text leaf. Omission-only serialization preserves the strict shared format and stable editor/history state. 33 focused editor/component tests, 30 browser scenarios (including focused WCAG checks), real SQLite-backed Node save/read/publish/export → Astro integration, 3 reference build tests and 48 block-source parity tests pass. Required root checks and strict OpenSpec validation pass. CE8A and CE8B deltas synchronized and both changes archived at the owner’s request; no migration, document rewrite or release publication. |
