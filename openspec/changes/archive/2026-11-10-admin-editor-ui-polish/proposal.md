## Why

An owner review of the admin editor on 2026-11-10 (Site settings and Home
screenshots) found the navigation group name "Site" confusing next to the
`global` model kind, a block-less global editor that leaves the main column
empty while its fields crowd a 20rem side column, a block highlight that never
clears, no way to collapse a long block list at once, and several smaller
visual defects. This is an owner-inserted change after the 2026-11-10 feature
changes, outside the RF steps; it does not move RF7, RF8C or RF9C–RF9F and is
independent of route-less collections.

## What Changes

- Rename the Site navigation group, content-landing section, its anchor and
  tour step to **Globals** (`#globals`), matching the `global` model kind.
- Show the entry-wide list budget line only when an entry uses at least 400 of
  its 500 list elements or exceeds the budget.
- When a model allows no blocks and the entry holds none, omit the Blocks
  section and show the entry fields in the main column; publication details
  (and SEO, when enabled) stay in the right-hand column.
- Clear the active-block highlight when the pointer or focus moves outside the
  block list (ignoring overlays opened from a block). The editor highlights at
  most one block instead of exactly one.
- Add a Collapse all / Expand all control beside the Blocks heading when an
  entry has two or more blocks; blocks with validation errors stay expanded.
- Center the editor in wide content areas instead of pinning it left.
- Ordinary unbounded text counters appear only when the field has a value;
  bounded fields keep a visible count. SEO counters read
  "`n` / 60 recommended · 200 max".
- Replace the visible "EDIT HOME" eyebrow with a visually hidden `h1`, so the
  breadcrumbs and title are not repeated.
- Sentence-case the empty group/object Create button ("Create links").
- Keep the title input transparent in the dark theme until hover or focus.
- Development configuration (`lace.config.ts`): drop the Title template field
  description that repeats the site-default annotation and move Help page
  after the site-default fields.

Non-goals: per-model navigation icons (needs a model-configuration contract
change; recorded in the backlog), template (`create-lace`) field order, any
API, persistence, permission or generated-project change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-application-shell`: the Site navigation group becomes Globals.
- `admin-remote-state-and-lists`: the content landing presents globals, and
  its unsynchronized-model guidance, in a Globals group.
- `admin-introductory-tour`: the Site step becomes the Globals step.
- `admin-draft-editor`: block-less layout, centered editor and conditional
  list-budget line.
- `admin-draft-editor-blocks`: at most one active block that clears on outside
  interaction; Collapse all / Expand all.
- `admin-draft-editor-fields`: unbounded counters hidden while empty.

## Impact

Admin shell navigation, tour, content landing, entry page, block editor,
field renderer, SEO card, `Input` usage, colocated unit tests and admin e2e
specs; the repository development `lace.config.ts`; `backlog.md` and the
roadmap's owner-inserted change list. Architecture §§6 and 17 are unchanged;
the admin keeps its layer/slice structure. No dependency, public API, saved
data, migration, permission or Node/Cloudflare parity change.
