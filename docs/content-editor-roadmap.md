# Lace Content and Editor Roadmap

> Active roadmap. Started 2026-10-10 after the MVP roadmap was archived.
> Wave 1 is detailed and ready for just-in-time OpenSpec proposals. Later
> waves are an ordered backlog and are detailed only when they are selected.

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
| 1 | CE1 | Schema evolution and block migrations | A1 | L | planned |
| 1 | CE2 | Entry lifecycle: unpublish, revert, duplicate, delete | A5 | M | planned |
| 1 | CE3 | Media metadata and resolved public delivery | A4 | L | planned |
| 2 | CE4 | SEO metadata and site defaults | A3 | — | backlog |
| 2 | CE5 | Global singletons (settings, navigation) | A8 | — | backlog |
| 2 | CE6 | Block envelope: anchor, visibility, settings | A2 | — | backlog |
| 3 | CE7 | Group and repeatable list fields | A6 | — | backlog |
| 3 | CE8 | Rich-text editor expansion | B1 | — | backlog |
| 3 | CE9 | Field layout and form UX | B2 | — | backlog |
| 4 | CE10 | Entry references and internal links | A7 | — | backlog |
| 4 | CE11 | Responsive images | C3 | — | backlog |
| 4 | CE12 | Bounded revision history | C1 | — | backlog |

Dependency order inside wave 1: **CE1 → CE2 → CE3**. CE2 does not depend on
CE1 technically and may run in parallel. CE3 depends on CE1 because making
the `image` block's `alt` optional is a structural block change.

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
- The `image` block moves to version 2 with `alt` optional. This is a
  compatible relaxation under CE1 and needs no data migration; the starter
  site and registry block sources are updated together.

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
  upgrade notes explain how to update user-owned block sources.

**Acceptance:** contract tests for the new public shape and the media
dictionary; the starter and reference sites build and render alt text,
dimensions and focal point; the build-export ETag still changes when
metadata of published media changes; the generated-project acceptance
passes.

## 6. Later waves — backlog

These items are ordered but not detailed. Each is expanded in this document,
with owner decisions, when it is selected.

- **CE4 SEO metadata and site defaults (A3):** an optional system SEO group
  for routable models (meta title, description, Open Graph image, canonical
  URL, noindex), fallbacks resolved by the SDK, an Astro `<LaceSeo>`
  component, sitemap and robots output. Site-level defaults come from CE5.
- **CE5 Global singletons (A8):** route-less singleton models for site
  settings, navigation and footer, comparable to Strapi single types and
  Payload globals.
- **CE6 Block envelope (A2):** system `anchor` and `hidden` flags plus
  definition-declared `settings` (variant, theme) in a separate block card
  tab; the render core skips hidden blocks. Changes the stored block
  contract, so it should land before beta.
- **CE7 Group and repeatable list fields (A6):** `field.group` and
  `field.list` for FAQ, pricing, feature and gallery blocks; media reference
  projection for nested paths.
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

## 7. Session log

Record each completed session here: date, OpenSpec change name, outcome and
any decision that changed this document.

| Date | Session | OpenSpec change | Outcome |
| --- | --- | --- | --- |
| 2026-10-10 | — | — | Roadmap created; wave 1 decisions recorded. |
