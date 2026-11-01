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
| SM1 | `videoEmbed` aspect ratio and ambient playback | S | SM1 | done |
| SM2 | MCP publication scope | S | SM2 | done |
| SM3 | Media tags and multi-select picker | L | SM3A → SM3B → SM3C | done |
| SM4 | `lace import` | L | SM4A → SM4B → SM4C | done |
| SM5 | Conditional fields | L | SM5A → SM5B → SM5C | in progress |

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

**Status:** done (archived). Implementation verified, 17/17 tasks; delta specs synchronized.

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
- `parseVideoEmbed` / `describeVideoEmbed` expose both player and ambient URLs with
  canonical provider parameters: Vimeo `background=1`; YouTube
  `autoplay=1&mute=1&loop=1&playlist=<id>&controls=0&playsinline=1`. Player
  mode URLs stay byte-identical.
- The registry renderer exposes the ratio through data attributes and CSS. Ambient
  mode mounts a lazy iframe after the motion-preference check, retaining an inert
  poster underneath. Reduced motion and no JavaScript fall back to exact player
  behavior. Source links are hidden only while ambient is mounted, until focused.
  No pause control ships; the WCAG 2.2.2 gap is documented. This stays inside the
  bounded activation and ambient mounting script exception.
- Template version bump with upgrade notes for user-owned renderer copies.

**Architecture and specs:** §8 *Initial built-in blocks*; narrow the
`video-embeds` "never autoplay, no looping" requirement to `player` mode.

**Acceptance:** URL parameter unit tests per provider and mode; render-core
tests; browser test for reduced motion; starter and reference builds;
generated-project upgrade phase.

## Step SM2 — MCP publication scope

**Status:** done (archived). Implementation verified, 18/18 tasks; all five capability deltas synchronized.

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
  tag index, on SQLite and D1. Tags use only ASCII letters, digits and the
  ordinary hyphen: trim surrounding spaces and lowercase ASCII letters, then
  require `[a-z0-9-]{1,40}`. Reject controls before trimming and internal spaces
  or non-ASCII characters; no NFKC, transliteration or space replacement. At most
  20 distinct tags per item and five input tags per filter.
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
- Tag filter in the media library and the media picker. The library holds it
  in URL state like its other filters; the picker keeps it local to the dialog
  and resets it on every opening, like the picker's other filters.
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

**Settled (2026-10-31):** token capability `content:import`, not an OAuth
loopback flow ([ADR 0016](adr/0016-import-credentials.md)).

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
  including a rerun that changes nothing: a full matrix in the workspace
  cross-runtime suite through the CLI process, and a packed-CLI smoke in the
  generated Node and Cloudflare consumer journeys.
- A public *Import content* page: format reference, a downloadable sample
  package for the starter models and a guide for writing a converter from
  another CMS. `docs/content-import.md` is the internal maintainer note
  (owner decision 2026-11-01).
- Generated-project guidance and template notes mention the command.

## Step SM5 — Conditional fields

**Status:** in progress (SM5A and SM5B done; SM5C planned).

**Size:** L (three sessions). Lifts the CE9 exclusion of conditional
visibility.

**What:** a field is shown, required and delivered only when a sibling
controller has given values, for example a gallery item `kind` of `image` or
`video` that decides whether `media` or `videoUrl` applies.

### Session SM5A — Definition and validation semantics

**Status:** done (archived). Implementation verified, 23/23 tasks; six capability deltas synchronized.

Owner decisions (2026-11-01): an owner-level `visibility` map
`{ target: { field, values } }` replaces the per-field `visibleWhen` draft;
`values` replaces `equals`/`in`; chains are not allowed; optional controllers
are allowed and an absent one without a default hides its targets; hidden
fields are validated with draft semantics (refining "type only": lengths,
ranges and `maxItems` still apply); `seoDefaults` may not name a conditional
field; block `settingsVisibility` is unchanged. See
[ADR 0018](adr/0018-conditional-fields.md).

- Owner option `visibility` on models, group fields (including list item
  groups) and block data. The controller is a sibling `select` or `boolean`
  in the same object scope.
- Config load rejects unknown controllers, non-select/boolean controllers,
  self references and chains.
- Hidden fields are never required and use draft validation semantics.
- Value policy: hidden values are kept in the draft so toggling back restores
  them, and omitted from the published projection.
- Schema evolution: classify adding, changing and removing rules; changes
  that alter published shape rewrite snapshots and request a build under
  ADR 0007.

### Session SM5B — Server enforcement and delivery

**Status:** done (archived). Implementation verified, 21/21 tasks; five capability deltas synchronized.

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
| 2026-10-31 | SM1 | `sm01-video-embed-playback` | Proposed. Owner decisions: ambient mode has no pause control (WCAG 2.2.2 gap documented); reduced motion and no-JS fall back to player; source link visually hidden only while an ambient player is mounted. 17 tasks, not applied. |
| 2026-10-31 | SM1 | `sm01-video-embed-playback` | Implemented and verified, 17/17 tasks. videoEmbed v2, ambient URLs/playback, aspect ratios, SQLite/D1 migration, registry revision 2 and template 0.40.0. Root tests, typecheck, lint, formatting, OpenAPI, docs, packed starter/existing-site acceptance and strict OpenSpec checks pass. Awaiting explicit sync/archive. |
| 2026-10-31 | SM1 | `sm01-video-embed-playback` | Archived at `openspec/changes/archive/2026-10-31-sm01-video-embed-playback`; all five capability deltas synchronized into main specs and strict validation passed. |
| 2026-10-31 | SM2 | `sm02-mcp-publication-scope` | Proposed. `content:publish` scope (implies write and read), third consent choice available only to roles with `content:publish`, `publish_entry` tool reusing the REST publication operation and result with optional idempotency key, template 0.41.0. Unpublish/delete stay banned. 18 tasks, not applied. |
| 2026-10-31 | SM2 | `sm02-mcp-publication-scope` | In progress. Applying the approved scope, consent, tool and setup changes. |
| 2026-10-31 | SM2 | `sm02-mcp-publication-scope` | Implemented and verified, 18/18 tasks. Separate publish scope and consent, shared publication tool/results, role attenuation, template 0.41.0. Root tests (3000), typecheck, lint, formatting, build, OpenAPI, OAuth/MCP compatibility (114), Chromium at 320px (3), docs, packed starter/existing-site acceptance and strict OpenSpec validation passed. Awaiting explicit sync/archive; status remains in progress until archived. |
| 2026-10-31 | SM2 | `sm02-mcp-publication-scope` | Archived at `openspec/changes/archive/2026-10-31-sm02-mcp-publication-scope`; all five capability deltas synchronized into main specs, preserving existing scenarios. Strict spec/change validation passed. |
| 2026-10-31 | SM3A | `sm03a-media-tag-storage-api` | In progress. `media_tags` join table (migration `0014`), shared ASCII normalization (`a-z`, digits, hyphen; trim surrounding spaces and lowercase; 1–40 characters; ≤ 20 per item), tags in update/upload/DTOs without build effects, AND filter (≤ 5 tags) bound to cursors, catalog endpoint with counts and prefix, D1 guarded batches and budgets, template 0.42.0. 16 tasks; implementation started. |
| 2026-10-31 | SM3A | `sm03a-media-tag-storage-api` | Implemented and verified, 16/16 tasks. ASCII tags, migration 0014, atomic Node/D1 writes, tag-only edits without build effects, upload/PATCH/filter/catalog API, template 0.42.0. Root tests (3015) pass with pinned Node 24.12.0/pnpm 12.3.4; typecheck, lint, formatting, build, OpenAPI generation/temporary-index check, docs, packed starter/existing-site acceptance, D1 budgets and full cross-runtime suites pass. See the change verification record. Awaiting explicit spec sync/archive; SM3B and SM3C remain planned. |
| 2026-10-31 | SM3A | `sm03a-media-tag-storage-api` | Archived at `openspec/changes/archive/2026-10-31-sm03a-media-tag-storage-api`; all five capability deltas synchronized into main specs. |
| 2026-10-31 | SM3B | `sm03b-admin-media-tagging` | Proposed. Admin-only: shared ARIA tag combobox (catalog prefix suggestions with counts, Enter/comma, client normalization via re-exported `normalizeMediaTag`, Escape closes only suggestions), tag editor in the metadata form under the existing Save/version/conflict flow, library tag filter (≤ 5, AND) in URL state, picker tag filter local per accepted spec (roadmap wording corrected), uploads inherit active filter tags captured per queue entry. No API/schema/template change. 17 tasks, not applied. |
| 2026-10-31 | SM3B | `sm03b-admin-media-tagging` | In progress. Applying the approved tag input, editor, filters and tagged uploads. |
| 2026-10-31 | SM3B | `sm03b-admin-media-tagging` | Implemented and verified, 17/17 tasks. Shared tag combobox, metadata-form tag editor, library URL tag filter with canonical rewrite, local picker filter, tagged uploads, docs. Admin unit (902), tag/metadata/accessibility e2e, root tests (release test on pinned Node 24.12.0), typecheck, lint, formatting, build, OpenAPI and packed starter/existing-site acceptance pass. Fixed SM3A-stale e2e media fixtures. Pre-existing: composites pointer-drag e2e fails on HEAD; stale draft `video-a-media-upload-delivery` fails `spec:validate`. Awaiting explicit sync/archive. |
| 2026-10-31 | SM3B | `sm03b-admin-media-tagging` | Archived at `openspec/changes/archive/2026-10-31-sm03b-admin-media-tagging`; `admin-media-library` delta synchronized (2 added, 3 modified requirements). |
| 2026-10-31 | SM3C | `sm03c-multi-select-media-picker` | Proposed and in progress. Owner decisions: Add of an eligible list opens the picker directly (no empty item); eligible groups have exactly one direct required media field; media already in the list is marked "Already in <list>" and stays selectable. Picker multiple mode with ordered toggle selection, capacity from `maxItems` and the 500-element budget, auto-selected uploads; admin only, no API or template change. 14 tasks. |
| 2026-10-31 | SM3C | `sm03c-multi-select-media-picker` | Implemented and verified, 14/14 tasks. Picker multiple mode (ordered toggle selection, capacity and limit message, auto-selected uploads, already-used marking), media-list eligibility and capacity helpers, `mediaListPicker` provider slot, bulk append in `ListNode`. Admin unit (942), new e2e (5, axe at 320 px), root format/lint/typecheck/test (release test on pinned Node 24.12.0), build, packed starter/existing-site acceptance, OpenAPI, docs and strict OpenSpec validation pass. Pre-existing: composites pointer-drag e2e fails on HEAD. Awaiting explicit sync/archive. |
| 2026-10-31 | SM3C | `sm03c-multi-select-media-picker` | Archived at `openspec/changes/archive/2026-10-31-sm03c-multi-select-media-picker`; `admin-media-library` and `admin-draft-editor` deltas synchronized (1 added, 1 modified requirement each). Step SM3 complete. |
| 2026-10-31 | SM4A | `sm04a-import-credentials` | Proposed. Owner decisions: API-token capability `content:import` (not OAuth loopback), required expiry 1–7 days, optional publish only for creators with `content:publish`; Bearer accepted on a fixed admin-route allowlist without cookie fallback; creator's account-security events revoke tokens; `sha256` recorded for new uploads only (legacy `NULL`, no backfill); lookups as `slug` / `sha256` list parameters; migration 0015, template 0.43.0, ADR 0016. 23 tasks, not applied. |
| 2026-10-31 | SM4A | `sm04a-import-credentials` | In progress. Applying import tokens, Bearer allowlist, media hash, slug lookup and migration 0015. |
| 2026-11-01 | SM4A | `sm04a-import-credentials` | Implemented and verified, 23/23 tasks. Import tokens (1–7 days, optional publish, Settings card, Bearer allowlist without cookie fallback, account-event revocation), capability-filtered build-token verification, media `sha256` and `?sha256=`, exact draft `?slug=`, migration 0015, template 0.43.0, ADR 0016. Root format/lint/typecheck/test (release test on pinned Node 24.12.0), build, packed starter/existing-site acceptance, cross-runtime, D1 budget, admin e2e, docs, OpenAPI and strict OpenSpec checks pass. Awaiting explicit sync/archive. |
| 2026-11-01 | SM4A | `sm04a-import-credentials` | Archived at `openspec/changes/archive/2026-11-01-sm04a-import-credentials`; nine capability deltas synchronized into main specs (16 added requirements). SM4B and SM4C remain planned. |
| 2026-11-01 | SM4B | `sm04b-cli-import` | Proposed. Owner decisions: drafts edited after the last import are a plan `conflict` (state file records the written revision) and nothing is written without `--overwrite`; `--validate-only` checks a package offline against `lace.config.ts`. Format v1 with `$media`/`$entry` references and a shipped JSON Schema; HTTP client of admin REST (ADR 0017, `cli -> contracts`); shared `normalizeDraftCandidate` for exact "unchanged"; ordered publication with cycle detection; bounded `Retry-After`. No REST, schema or template change. 21 tasks, not applied. |
| 2026-11-01 | SM4B | `sm04b-cli-import` | Implemented and verified, 21/21 tasks. `lace import` (format v1 + JSON Schema, offline `--validate-only`, server config check, hash/slug lookups, plan with edit-protection conflicts and `--overwrite`, ordered writes with state file, link-ordered publication with idempotency keys, bounded `Retry-After`), shared `normalizeDraftCandidate`, ADR 0017, `cli -> contracts`. CLI/application tests, root format/lint/typecheck/test, build, packed starter/existing-site acceptance, OpenAPI, docs and strict OpenSpec checks pass. Awaiting explicit sync/archive. |
| 2026-11-01 | SM4B | `sm04b-cli-import` | Archived at `openspec/changes/archive/2026-11-01-sm04b-cli-import`; new `content-import-cli` capability (11 requirements) and one added `content-use-cases` requirement synchronized into main specs. SM4C remains planned. |
| 2026-11-01 | SM4C | `sm04c-import-runtime-verification-docs` | Proposed. Owner decisions: two verification tiers (full matrix through the CLI process in the workspace cross-runtime suite on Node and the local Worker; packed-CLI smoke in the Node Compose and Cloudflare consumer journeys, offline validation in the CI starter phase); the user guide is a public page with a downloadable starter sample and `docs/content-import.md` is the internal note (refines the roadmap wording); generated projects get guidance and a Template 0.44.0 note, no import script. 18 tasks, not applied. |
| 2026-11-01 | SM4C | `sm04c-import-runtime-verification-docs` | Implemented and verified, 18/18 tasks. Shared starter sample in `apps/docs/public/examples/content-import` with a root validity/guide-equality test; cross-runtime import journey through the CLI process on Node and Worker (validate, dry run, publish, unchanged reruns with and without state, conflict and `--overwrite`, refused and revoked tokens, equal canonical results); packed smoke in the starter, Node Compose and Cloudflare consumer journeys; public *Import content* page, CLI reference rows, internal `docs/content-import.md`; generated operations guide section and Template 0.44.0. No CLI or server defect found; fixed the stale alpha.8 `videoEmbed` v1 fixture that blocked `acceptance:cloudflare`. Full `acceptance:generated` not run (phase `node` only). Awaiting explicit sync/archive. |
| 2026-11-01 | SM4C | `sm04c-import-runtime-verification-docs` | Archived at `openspec/changes/archive/2026-11-01-sm04c-import-runtime-verification-docs`; four capability deltas synchronized into main specs (4 added requirements). Step SM4 complete. |
| 2026-11-01 | SM5A | `sm05a-conditional-field-semantics` | Proposed. Owner decisions: owner-level `visibility` map `{ target: { field, values } }` on models, groups (incl. list items) and block data instead of per-field `visibleWhen`; sibling `select`/`boolean` controllers, optional allowed (absent without default hides); no chains; hidden fields validated with draft semantics (refines "type only"); hidden values kept in drafts, omitted by the published projection; `seoDefaults` may not name a conditional field; `settingsVisibility` unchanged. Structural identity; new `field-visibility-*` sync kinds prune newly hidden published values. Publication omission stays in SM5B. 23 tasks, not applied. |
| 2026-11-01 | SM5A | `sm05a-conditional-field-semantics` | Implemented and verified, 23/23 tasks. Owner-level `visibility` on models, groups and block data with shared normalizer, evaluator and published projection; hidden fields validated in draft mode and retained in drafts; structural identity, `seoDefaults` restriction, REST/OpenAPI metadata; `field-visibility-*` sync kinds that prune hidden published values and refuse revealed gaps (refined: all hidden published values are pruned). Content/config/contracts/application tests, repository contract on SQLite and D1, cross-runtime suite, root format/lint/typecheck/test (pinned Node 24.12.0), build, starter and existing-site acceptance, docs, OpenAPI and OpenSpec checks pass. Publication omission remains SM5B. Awaiting explicit sync/archive. |
| 2026-11-01 | SM5A | `sm05a-conditional-field-semantics` | Archived at `openspec/changes/archive/2026-11-01-sm05a-conditional-field-semantics`; new `conditional-fields` capability (4 requirements) and deltas for `block-settings-visibility` (1 modified), `content-model-configuration`, `content-validation`, `rest-contracts` (1 added each) and `schema-evolution` (3 added) synchronized into main specs. SM5B and SM5C remain planned. |
| 2026-11-01 | SM5B | `sm05b-conditional-field-delivery` | Proposed. Use case computes the published projection (fields, every block's data, media and internal-link references) and passes it on `PublishContentEntryCommand.projection` when the model or a draft block declares rules; Node and D1 write it in the existing guarded publication and guard links from the supplied rows; unopted entries keep the SQL copy. Draft link rows mark hidden links undelivered; render projects parsed block data; published value types make targets optional; MCP/OpenAPI/import guidance. 21 tasks. |
| 2026-11-01 | SM5B | `sm05b-conditional-field-delivery` | Implemented and verified, 21/21 tasks. Publication writes the projection of fields, every block's data and their media/link references on Node SQLite, D1 and the in-memory store (copy path kept for unopted content); atomic link guard over projected rows; hidden media are draft usage only; draft link rows mark hidden links undelivered; render projects parsed block data; `BlockDataValues`/`ModelFieldValues`/`BlockDataOf` make targets optional; MCP, OpenAPI, MCP and import docs. Package and repository contract tests (SQLite 209, D1 104 cases), cross-runtime 7/7, D1 budgets, root format/lint/typecheck/test/build (pinned Node 24.12.0), starter and existing-site acceptance, docs, OpenAPI and OpenSpec checks pass. Awaiting explicit archive. |
| 2026-11-01 | SM5B | `sm05b-conditional-field-delivery` | Archived at `openspec/changes/archive/2026-11-01-sm05b-conditional-field-delivery`; deltas synchronized into main specs: `conditional-fields` (5 added), `content-repository-contracts`, `mcp-content-server`, `render-core` (1 added each) and `rest-contracts` (1 modified). SM5C remains planned. |
