## Why

A block card's header summary only reads the block's top-level text, rich-text,
URL/select and media fields. A Gallery with three images and no title, or a
Navigation with two links and no name, keeps all of its content inside a list
field, so its header says "Empty block" even when the block is full. Collapsed
blocks are then indistinguishable from blocks that really are empty. The list
rows got useful summaries in `admin-compact-list-media-rows`; the block header
did not.

This is a standalone, owner-requested admin fix found while reviewing
`admin-compact-list-media-rows`. It is not a roadmap unit. It refines the block
card header described in `docs/mvp-architecture.md` §17 "Admin application"
and the composite summaries of "Bounded composite fields (CE7A)" and the CE7C
`itemLabel` note, without changing any data contract.

## What Changes

- **Composite fields count toward the block summary.** When no top-level text,
  rich-text, URL or select value exists, the summary uses the block's first
  non-empty composite field in rendered order (block layout, then declared
  order):
  - a list with at least one item reads `<List label> (<count>)`, followed by
    `: ` and the items' primary summaries joined by `, ` when any item has one,
    for example `Links (2): Blog, About` or `Images (3)`;
  - a group reads its primary summary.
- **One summary rule for items and blocks.** Item primaries come from the
  existing `itemSummary` (declared `itemLabel` text first, then text, rich-text
  plain text, URL or select). No per-block or per-field-type code is added.
- **Media inside composites.** "Media selected" also applies when the only
  content is media inside a group. A non-empty list always yields its count,
  so a gallery of uncaptioned images reads `Images (3)`, not "Media selected".
- **Unchanged.** Top-level text, rich text and URL/select still win, so a
  Gallery with a title or a Navigation with a name keeps showing it. Empty
  lists are skipped, and "Empty block" stays the last fallback. The summary
  is still truncated to one line and never shows media IDs or rich-text JSON.

Non-goals: singular/plural wording (the count is shown in parentheses so no
inflection is needed), thumbnails in the block header, new schema metadata
(such as a block-level summary key), list or item row changes, and any API,
DSL, export or public-site change.

Dependency: builds on the archived `admin-compact-list-media-rows` change
(`itemSummary` in `apps/admin/src/entities/content/item-summary.ts`), which is
staged on `feat/admin-compact-list-media-rows` but not yet merged. Apply this
change on that branch or after it merges.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: the block card header summary order in "Draft blocks
  are authored as an ordered allowed aggregate" gains a composite-field step
  between URL/select values and the media fallback.

## Impact

- `apps/admin/src/widgets/block-editor/block-presentation.ts` (`blockSummary`
  takes the block layout and walks composite fields) and its unit tests;
  `BlockCard.tsx` passes the block layout.
- `apps/admin/src/entities/content/index.ts` exports `itemSummary`.
- `docs/mvp-architecture.md` §17 and `docs/composite-fields.md` describe the
  new summary order.
- No API, database, contract, SDK, registry, starter-template or public-site
  change. Saved data and dirty state are unaffected because summaries are
  derived only for display.
