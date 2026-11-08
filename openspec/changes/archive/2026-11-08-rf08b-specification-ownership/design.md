## Context

RF8X and RF8Y left specifications that describe only rc1 and later. RF8B
reorganizes them so that each rule has one owning capability and an index
names the owner. Architecture: §25 (documentation ownership) and the RF8A
pointer convention — architecture files name a capability and, where useful,
a requirement title.

## Goals / Non-Goals

**Goals:**

- One index (`openspec/specs/README.md`) that lists every capability once,
  grouped by domain, with an ownership rule per group.
- Gallery requirements in one capability; `admin-draft-editor` split by
  sub-surface with a thin core.
- Requirement text agrees with code and names no roadmap code.
- No requirement text is lost: every removed requirement names its
  replacement; moved requirements are copied verbatim.

**Non-Goals:**

- No behavior change and no rewrite of moved requirement text beyond the
  listed corrections.
- No pruning of `openspec/changes/archive` (owner decision 4).
- No user documentation audit (RF8C).

## Decisions

1. **Moves are delta operations, generated mechanically.** Each moved
   requirement is REMOVED from its source with a **Migration** naming the new
   owner and ADDED verbatim to the target, so the archive applies the move and
   the delta is the review record. The deltas are generated from the main
   specs by a script (kept in the session scratchpad, not the repository),
   which fails if a requirement or scenario it expects is missing or if the
   editor split does not cover every requirement exactly once.
2. **Extraction uses remove-and-re-add.** OpenSpec refuses a MODIFIED block
   that drops a scenario, so the `block-registry` starter requirement, the
   `block-source-registry` canonical-source requirement, the
   `block-installation-cli` installation requirement and the
   `admin-application-shell` route requirement are re-added under new titles.
   Text-only corrections keep MODIFIED.
3. **Editor split.** Core keeps layout, read-only viewers, validation summary,
   the global editor with its site-defaults note, unsaved drafts and saving.
   Fields: field rendering, slugs, rich text, SEO, composites, guidance,
   counters, layouts, select cards, URL controls and conditional fields.
   Media lists: media fields, selected-media alt text, list operations,
   collapsed-row summaries, bulk media additions and embed previews. Blocks:
   aggregate, block alt text, block cards, Settings tab, hidden blocks,
   envelopes and palette. Publication: concurrency, conflicts, later-edit
   separation, lifecycle menu and its confirmations, publish-saves-first, site
   link and link-impact dialogs.
4. **Gallery ownership.** `gallery-block` owns gallery-only rules. Rules shared
   by `image`, `gallery` and `hero` — media-first field order, the adapter
   image component, lightbox and link precedence — stay in `block-registry`
   and `block-source-registry`, because splitting them would duplicate the
   shared contract.
5. **README grouping.** Domains follow the architecture directory: workspace
   and release; configuration and content model; content domain and storage;
   delivery and rendering; blocks; admin; API, auth and MCP; CLI, generator
   and operations; acceptance and verification; documentation. Each group
   states its ownership rule; a capability appears in exactly one group.

## Risks / Trade-offs

- [A moved requirement changes text] → moves copy the parsed block verbatim;
  the title diff after archive accounts for every title (moved unchanged,
  re-added under a named new title, or removed with a named replacement).
- [Architecture pointers go stale] → every `admin-draft-editor` and gallery
  pointer in `docs/architecture/` is checked after archive; the documentation
  link guard verifies the paths.
