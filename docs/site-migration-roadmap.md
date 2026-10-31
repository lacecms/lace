# Lace Site Migration Roadmap

> Selected 2026-10-31 after the alpha.8 release. Motivated by migrating the
> first real portfolio site (tatianae.com, currently on Framer) to Lace and
> Astro. Every step is general product work, not a site-specific feature.

Future work outside this roadmap stays in the root [backlog](../backlog.md).

## 1. Purpose and source of truth

This roadmap records the owner's selection, the delivery order, the session
boundaries and a compact description of what each step implements and how.
Detailed behavior is written later, one just-in-time OpenSpec change per
session.

Authority follows `AGENTS.md`:

1. [`mvp-architecture.md`](mvp-architecture.md) owns product scope and
   invariants.
2. [`openspec/specs/**`](../openspec/specs) owns accepted capability behavior.
3. The selected active OpenSpec change owns the proposed delta.
4. This document owns delivery order, session boundaries and recorded
   decisions for this roadmap.

Steps that change an architecture invariant list the sections to update. The
architecture is updated in the same OpenSpec change, before code, with a short
ADR under [`docs/adr/`](adr).

## 2. How to use this roadmap

The conventions of the archived
[content and editor roadmap](archive/content-editor-roadmap.md) apply:

- A **session unit** is one cohesive change set that can be implemented,
  reviewed and verified independently. It maps to one OpenSpec change.
- Size labels: **S** one session, **M** two sessions, **L** three or more.
- OpenSpec change names use the prefix `sm<step><session>-`, for example
  `sm01-video-embed-playback` or `sm04a-import-credentials`.
- Completion rules are unchanged: runtime validation, types and negative tests
  for new public APIs; Node SQLite and D1 parity with repository contract
  tests for database changes; the narrowest relevant tests, then root
  typecheck, Oxlint, Oxfmt check and strict OpenSpec validation;
  documentation in the same change.
- "Open questions" in a step are settled with the owner while writing that
  step's specification, not before.

Status values: `planned`, `proposed`, `in progress`, `done` (archived).

## 3. Baseline (alpha.8, commit `305191a`)

Gaps found while mapping tatianae.com onto Lace:

- **Video.** Built-in `videoEmbed` v1 is fixed at 16:9
  (`registry/astro/videoEmbed/VideoEmbed.css`) and its accepted design never
  autoplays or loops. The site uses muted looping Vimeo videos, often square.
  The `video-embed-block` change was archived on 2026-10-31.
- **MCP.** Tools are limited to discover/list/get/create/save
  (`packages/mcp/src/index.ts`). OAuth scopes are `content:read` and
  `content:write` (`packages/auth/src/mcp-oauth.ts`). The domain already has
  `content:publish` (admin only) and publish/unpublish operations
  (`packages/application/src/content-authority.ts`), but they are outside the
  delegated surface.
- **Import.** No content import exists. Admin REST writes require a session
  cookie and a trusted Origin. API tokens carry only `content:build:read`
  (`api_tokens.capabilities_json`). Media have no content hash, so re-uploads
  cannot be deduplicated. Media upload is limited to 30 per minute per user.
- **Media library.** A flat list with search and type filter. No tags or
  folders. The media picker selects exactly one item
  (`apps/admin/src/widgets/media-library/MediaPickerDialog`), so a 20-image
  gallery takes 20 picker round trips.
- **Conditional fields.** Not supported. The only rule is the bounded
  block-settings `settingsVisibility`: one unconditional sibling select, no
  chains (`packages/content/src/index.ts`). CE9 explicitly excluded partial
  visibility and asked for a complete system.

## 4. Delivery overview

| Step | Topic | Size | Sessions | Status |
| --- | --- | :---: | --- | --- |
| SM1 | `videoEmbed` aspect ratio and ambient playback | S | SM1 | planned |
| SM2 | MCP publication scope | S | SM2 | planned |
| SM3 | Media tags and multi-select picker | L | SM3A → SM3B → SM3C | planned |
| SM4 | `lace import` | L | SM4A → SM4B → SM4C | planned |
| SM5 | Conditional fields | L | SM5A → SM5B → SM5C | planned |

**Order rationale:** SM1 and SM2 are small and independent; SM1 unblocks the
portfolio site first. SM3 comes before SM4 so the import format can assign
media tags from its first version. SM5 is last because it is the largest and
touches validation everywhere; import validates through the server and needs
no change when SM5 lands.

**Deferred, stays in the backlog:** entry reference fields (`field.reference`)
and rich-text internal links; media folders; bulk list actions; uploaded
video files; `lace export`.

## 5. Owner decisions (2026-10-31)

1. Extend the existing `videoEmbed` block instead of adding a new video block.
2. MCP may publish through a separate, third access level. Unpublication and
   all deletion stay forbidden through MCP.
3. Build `lace import` as a CLI command so people can move existing sites
   quickly.
4. Media library: tags only for now, no folders.
5. Gallery: select many media items from the library at once.
6. Conditional fields are selected as a complete system (visibility,
   validation, value retention, delivery), as CE9 required.
7. `field.reference` is deferred and remains in the backlog.

## Step SM1 — `videoEmbed` aspect ratio and ambient playback

**Size:** S. **Prerequisite:** `video-embed-block` archived and synchronized
(done 2026-10-31).

**What:** editors choose the video's aspect ratio and a muted, looping,
autoplaying "ambient" mode for decorative or showcase videos.

**How:**

- `videoEmbed` v2 adds two settings with defaults that keep today's
  behavior: `aspectRatio` (`16:9`, `4:3`, `1:1`, `4:5`, `9:16`; default
  `16:9`) and `playback` (`player`, `ambient`; default `player`). Data is
  unchanged: identity migration, and models that allow the block raise their
  version under the CE1 rule (root config, reference site, starter).
- `parseVideoEmbed` / `describeVideoEmbed` accept the playback mode and emit
  canonical provider parameters: Vimeo `background=1`; YouTube
  `autoplay=1&mute=1&loop=1&playlist=<id>&controls=0&playsinline=1`. Player
  mode URLs stay byte-identical.
- The registry renderer sets the ratio through a CSS custom property. Ambient
  mode has no activation button and loads the iframe lazily. Under
  `prefers-reduced-motion: reduce` it never mounts the iframe and shows the
  poster (or nothing) instead. This stays inside the existing bounded
  activation-script exception.
- Template version bump with upgrade notes for user-owned renderer copies.

**Architecture and specs:** §8 *Initial built-in blocks*; narrow the
`video-embeds` "never autoplay, no looping" requirement to `player` mode.

**Acceptance:** URL parameter unit tests per provider and mode; render-core
tests; browser test for reduced motion; starter and reference builds;
generated-project upgrade phase.

## Step SM2 — MCP publication scope

**Size:** S. **Depends on:** MCP1–MCP3 (done).

**What:** an MCP client can publish entries when the user grants a separate
`content:publish` scope. No unpublish and no delete tools.

**How:**

- Add `content:publish` to `MCP_OAUTH_SCOPES`; normalization adds
  `content:read` and `content:write` when it is requested.
- Consent: offer the scope only when the signing-in user's role has
  `content:publish` (today admin only), mirroring the existing `canWrite`
  check; the screen states that published content goes live on the next
  build.
- `mcp-actor.ts` maps the scope to the `content:publish` permission and the
  `publish` operation; `delegatedContentOperations` gains `publish` only.
- New tool `publish_entry {entryId, expectedRevision}` through the shared
  publish use case. Existing publication guards apply unchanged (unresolved
  internal links, validation); builds coalesce through the outbox.
- Existing grants keep their scopes; a missing scope returns
  `insufficient_scope` with `content:publish`, so clients re-consent.
- Admin MCP settings card, client guides and connection list show the new
  scope; `docs/mcp.md` updated.

**Architecture and specs:** §3 *Included* (MCP bullet) and the MCP section of
§5; `mcp-content-server`, `mcp-oauth-delegation`, admin settings specs; ADR.

**Acceptance:** scope normalization and consent tests (editor cannot grant);
403 `insufficient_scope` without the scope; publish succeeds and requests one
coalesced build on Node and Worker; unpublish/delete remain absent from the
tool list.

**Open questions:** whether editors should ever get `content:publish` (a role
policy change, out of scope by default).

## Step SM3 — Media tags and multi-select picker

**Size:** L (three sessions).

### Session SM3A — Tag storage and API

- Migration: `media_tags (media_id, tag)` with a composite primary key and a
  tag index, on SQLite and D1. Tags are trimmed, NFKC-normalized and
  lowercased, 1–40 characters, at most 20 per item.
- `PATCH /api/v1/admin/media/:mediaId` accepts `tags` (full replacement under
  the existing `If-Match` concurrency); upload accepts optional `tags`.
- `GET /api/v1/admin/media` filters by one or more `tag` values (AND);
  `GET /api/v1/admin/media/tags` returns tags with counts, paginated.
- Tags are admin-only organization: not in public DTOs or the build export,
  and editing them never requests a build. Deleting media cascades its tags.

**Acceptance:** repository contract tests on both runtimes; normalization and
limit validation; D1 query budgets for filtered lists.

### Session SM3B — Admin tagging

- Tag editor (chips with autocomplete from existing tags) in the media details
  panel.
- Tag filter in the media library and the media picker, held in URL state
  like other list filters.
- Uploads made while a tag filter is active receive that tag.

**Acceptance:** browser tests for adding/removing tags, keyboard-only use, and
filtering in library and picker.

### Session SM3C — Multi-select media picker

- `MediaPickerDialog` gains a multiple mode: toggle selection, a counter,
  selection order preserved, and an "Add N" action. Items uploaded in the
  dialog are selected automatically.
- Available for any `field.list` whose item is `media`, or a group with
  exactly one required `media` field (the built-in gallery and custom
  blocks). Each selected item appends one list item with field defaults.
- The selection is capped by the list's remaining `maxItems` and the snapshot
  list-item limit, with a clear message when reached.

**Acceptance:** browser tests for adding many images to a gallery in one step,
capacity limits, order, and a custom block list.

## Step SM4 — `lace import`

**Size:** L (three sessions). **Depends on:** SM3A (tags in the format), SM2
not required.

**What:** `lace import <dir>` loads a portable import package (JSON plus media
files) into a running installation on either runtime, idempotently and
resumably.

### Session SM4A — Import credential and server lookups

- A write-capable credential. Recommended: a new API-token capability
  `content:import`, created by an admin in Settings with a required expiry
  (at most 7 days), acting as that admin with permissions attenuated to
  content read/write, media write and optionally publish. Accepted as a
  Bearer token on the specific admin REST endpoints import needs; the Origin
  check is skipped only for Bearer requests. Listed and revocable like build
  tokens.
- Media content hash: a `sha256` column computed on upload (migration on both
  runtimes) and `GET /api/v1/admin/media?sha256=` for deduplication.
- Exact lookups for idempotency: collection entries by model and slug;
  pages and globals by model.

**Architecture and specs:** §14 *Authentication and authorization*, §9.7
*Media*, §12 *Admin endpoints*; ADR for a write-capable token.

**Open question:** token capability (recommended) or an OAuth loopback flow
reusing the MCP delegation infrastructure.

### Session SM4B — CLI import

- Package format v1: `lace-import.json` with `media[]`
  (`key, file, alt, caption, focalPoint, tags`) and `entries[]`
  (`key, model, slug?, title, fields, blocks, seo?, publish?`). Values refer to
  media as `{"$media": "<key>"}` and to entries as `{"$entry": "<key>"}`
  (becomes `entry:<id>` in URL fields). A JSON Schema ships with the CLI.
- Pipeline: validate locally against `lace.config.ts` field and block
  descriptors → print a plan (create / update / unchanged) → upload media with
  hash deduplication → create or update drafts without entry links → second
  pass fills entry links → optional `--publish` in dependency order so link
  publication guards pass.
- Idempotent: matched entries are updated with the expected revision;
  unchanged drafts are skipped. A local state file maps keys to IDs for
  resuming. `--dry-run` stops after the plan. 429 responses honor
  `Retry-After`.

**Acceptance:** CLI unit tests for format validation, reference rewriting,
planning and resume; integration test against a Node API.

### Session SM4C — Runtime verification and documentation

- Acceptance journeys against local Node and local Worker installations,
  including a rerun that changes nothing.
- `docs/content-import.md`: format reference, a small sample package and a
  guide for writing a converter from another CMS.
- Generated-project guidance and template notes mention the command.

## Step SM5 — Conditional fields

**Size:** L (three sessions). Lifts the CE9 exclusion of conditional
visibility.

**What:** a field is shown, required and delivered only when a sibling
controller has given values, for example a gallery item `kind` of `image` or
`video` that decides whether `media` or `videoUrl` applies.

### Session SM5A — Definition and validation semantics

- Field option `visibleWhen: {field, equals}` or `{field, in}`. The
  controller is a sibling `select` or `boolean` in the same object scope:
  model fields, group fields, a list item group or block data.
- Config load rejects unknown controllers, non-scalar controllers and cycles.
  Whether chains are allowed is decided in the spec.
- Hidden fields are never required and are not validated beyond type.
- Value policy (proposed): hidden values are kept in the draft so toggling
  back restores them, and omitted from the published snapshot.
- Schema evolution: classify adding, changing and removing rules; changes
  that alter published shape rewrite snapshots and request a build under
  ADR 0007.

### Session SM5B — Server enforcement and delivery

- Save and publish use cases apply the rules on the server; the admin is
  never the only enforcement.
- Published snapshots, the public API and the build export omit hidden
  values; contracts, OpenAPI and MCP model discovery describe the rules so
  agents and import fill data correctly.
- Node and D1 parity tests, including list items and block data.

### Session SM5C — Admin forms and documentation

- Generic forms show and hide fields reactively in models, groups, list items
  and block data, preserving editor state and hidden draft values.
- Validation summaries list only reachable errors and reveal the right
  section, tab or list item.
- Documentation and one shipped example; decide whether block
  `settingsVisibility` stays separate or later converges on the same rule.

**Architecture and specs:** §8 field types and limits, §9.3 snapshots, §10
publication; `field-descriptors`, `content-validation`,
`schema-evolution`, `admin-draft-editor`; ADR.

## 6. Progress log

| Date | Session | Change | Notes |
| --- | --- | --- | --- |
| 2026-10-31 | — | — | Roadmap selected from the tatianae.com gap analysis. No OpenSpec change created. |
| 2026-10-31 | — | `video-embed-block` | SM1 prerequisite: archived and synchronized; `video-embeds` capability created, four specs gained requirements, two MODIFIED requirements were already identical in main specs. |
