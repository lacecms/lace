## Why

Building a gallery today takes one picker round trip per image: Add creates an
empty item, the writer opens it, chooses Choose media, finds the image and
confirms. A 20-image portfolio gallery (tatianae.com has about 65 projects with
several images each) takes 20 such trips. SM3A and SM3B made the library
filterable by tag, so an editor can now narrow the picker to one project's
images; the remaining gap is choosing all of them at once.

## Roadmap unit

Session **SM3C** of step SM3 in
[`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md),
the last session of the step. Depends on SM3B (`sm03b-admin-media-tagging`,
archived 2026-10-31) for the picker's tag filter and tagged uploads. It is
independent of SM4 (import) and SM5 (conditional fields).

## What Changes

- **Multiple mode in `MediaPickerDialog`.** In this mode activating a tile
  toggles it in a selection instead of choosing it. Selected tiles show their
  one-based selection number; a counter states how many are selected and how
  many more the list can take; Clear selection empties it. The selection keeps
  the order in which items were selected, survives search, filter, sort and
  page changes inside the dialog, and is confirmed by an "Add N" action
  (for example "Add 12 images"). Escape and Cancel close without changing the
  draft. Confirmed uploads made in the dialog join the selection
  automatically, in completion order, while capacity remains. The existing
  single mode (media fields, Replace, the SEO image) is unchanged.
- **Capacity.** The selection is capped by the list's remaining `maxItems`
  and by the entry's 500-element list budget, measured on the prospective
  normalized snapshot like every other growing action. When the cap is
  reached, unselected tiles cannot be selected, further uploads are not
  selected, and the dialog says why. A full list keeps its Add disabled with
  the existing limit explanation.
- **Already-used media.** Tiles of media already present in the list say so
  ("Already in Images") and remain selectable, because lists allow
  duplicates.
- **Eligible lists.** A `field.list` whose item is `field.media()`, or whose
  item is a `field.group()` with exactly one direct `media` field that is
  `required` (other fields arbitrary). This covers the built-in `gallery`
  block and custom block, model, page and global lists. Nested eligible lists
  inside groups and list items qualify too.
- **Add opens the picker.** For an eligible list, Add opens the picker in
  multiple mode instead of inserting an empty item or asking for a scalar
  value. Confirming appends one item per selected media, in selection order:
  a scalar item is the media identifier; a group item is the item's
  draft-valid starting value (declared item default, else child defaults)
  with the media field set. Appended group items start collapsed, focus moves
  to the first appended row, and the result is announced. Nothing is saved;
  the draft becomes dirty like any other list edit. Other lists keep today's
  Add.
- Documentation: composite fields guide, media tags guide (picking a tagged
  set), architecture admin paragraph, roadmap status and progress log.

## Scope, Dependencies and Non-goals

Admin UI only (`apps/admin`) plus documentation. No API, contract, schema,
database, public-delivery, registry or template change, and no
`TEMPLATE_VERSION` bump. The server remains authoritative for list maxima and
the snapshot budget.

Non-goals: multiple selection for a single media field; replacing several list
items at once; inserting at a position other than the end; selecting across
dialog openings; select-all of a filtered result or range selection with
Shift; drag-to-reorder inside the selection (the list's own reorder applies
after adding); bulk tagging or other bulk library actions; uploaded video
files; eligibility for groups with several media fields or an optional media
field; MCP or import changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-media-library`: the picker requirement is scoped to single mode
  (activating a tile chooses, uploading does not choose); a new requirement
  defines multiple mode — toggle selection, order, counter, capacity,
  automatic selection of uploads, already-used indication and confirmation.
- `admin-draft-editor`: the list-operations requirement gains the exception
  that Add of an eligible media list opens the multiple-mode picker and that
  bulk-appended items start collapsed; a new requirement defines eligible
  lists, the appended item values, capacity from `maxItems` and the snapshot
  budget, focus and announcements.

## Impact

- Architecture: no invariant changes and no ADR. The admin paragraph of the
  media section (§9.7 admin UI description) gains one sentence on multiple
  mode; §8 *Bounded composite fields* list limits apply unchanged.
- Code: `apps/admin` — `widgets/media-library` (`MediaPickerDialog` multiple
  mode, `MediaGrid` toggle tiles, a list-adding control registered like the
  media renderer), `features/upload-media` (a select toggle on confirmed
  upload rows), `entities/content` (eligibility and item construction helpers,
  a list-adder registry slot in `FieldRendererProvider`, `ListNode` Add and
  bulk insert with capacity), `pages/entry` registration; unit tests and
  Playwright end-to-end tests.
- Docs: `docs/composite-fields.md`, `docs/media-tags.md`,
  `docs/mvp-architecture.md`, `docs/site-migration-roadmap.md`.
