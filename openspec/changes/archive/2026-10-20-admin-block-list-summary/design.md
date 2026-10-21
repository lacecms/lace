## Context

`blockSummary(definition, data)` in
`apps/admin/src/widgets/block-editor/block-presentation.ts` walks only
top-level fields: text/textarea (with `title`, `heading`, `name`, `quote`,
`caption`, `alt` preferred), then rich text, then URL/select, then a top-level
media value ("Media selected"), else "Empty block". `group` and `list` fields
are ignored, so blocks whose content lives in a list (Gallery `images`,
Navigation `links`) read "Empty block".

`itemSummary(definition, value, itemLabel)` in
`apps/admin/src/entities/content/item-summary.ts` (added by
`admin-compact-list-media-rows`) already summarizes any composite value
generically: `primary` is the nonblank `itemLabel` text or the first useful
text (text/textarea, then rich-text plain text, then URL/select) found
anywhere in the item, and `media` says whether the item holds media. It is
pure, has no React or media-API dependency and never returns media IDs or
rich-text JSON. It is not yet exported from the `entities/content` public
index.

`BlockCard` renders `blockSummary(definition, data)` in a truncated `span` and
already has `definition.layout`. `formFieldKeys(fields, layout)` from
`@lacecms/content` gives the rendered field order.

## Goals / Non-Goals

**Goals:**

- Non-empty list and group fields make a block summary useful, using the
  same item summary rules as collapsed list rows.
- Existing summaries for blocks with top-level text, rich text or URL/select
  values stay exactly the same.
- No block-type, field-key or media-specific branches.

**Non-Goals:**

- Pluralized or localized wording, thumbnails in the header, new schema
  metadata, or changes to list rows, previews or validation.

## Decisions

1. **New tier after URL/select, before media.** Order becomes: top-level
   text → rich text → URL/select → first non-empty composite → media → empty.
   Putting composites after every top-level scalar keeps all existing
   summaries unchanged (a titled Gallery still shows its title) and only
   replaces results that were "Media selected" or "Empty block".
   *Alternative rejected:* merging composite text into the existing text tier
   by priority. That would change current summaries for blocks that have a
   URL at the top level and text inside a list, and make the order hard to
   explain.

2. **Composite order is rendered order.** Composites are visited in
   `formFieldKeys(definition.fields, definition.layout)` order, the order the
   writer sees in the card. The existing scalar tiers keep their current
   declared-order/preferred-key behavior so this change does not move them.

3. **List format `Label (n)` plus item primaries.** A list with at least one
   item yields `fieldLabel(key, field.label)`, then ` (n)`, then, when at least
   one item has a primary line, `: ` and the primaries joined by `, ` (items
   without a primary are skipped, the count still covers all items). The
   existing 120-character truncation applies to the whole string. Parentheses
   avoid singular/plural inflection, which the schema cannot express (labels
   are plural nouns such as "Images", "Links").
   *Alternatives rejected:* "3 images" (needs lowercase/plural rules that fail
   for labels like "Submenu links" with count 1 or non-English labels); only
   the first item's label (hides how many items exist); a "Media selected"
   fallback for uncaptioned galleries (says nothing about size).

4. **Group format is its primary line.** A top-level group with a primary
   line yields that line; a group whose only content is media sets the media
   flag so the existing "Media selected" tier covers it. Groups have no count.

5. **Reuse `itemSummary`, do not duplicate it.** Export `itemSummary` from
   `apps/admin/src/entities/content/index.ts` and call it from
   `block-presentation.ts` per list item (`itemSummary(field.item, item,
   field.itemLabel)`) and per group (`itemSummary(field, value)`). This keeps
   the widget → entity dependency direction and one definition of "primary".
   The local rich-text/whitespace helpers in `block-presentation.ts` stay for
   the top-level tiers.

6. **Signature.** `blockSummary` accepts `Pick<BlockDefinitionDto, "fields" |
   "layout">`; `layout` is optional on the DTO, so existing callers and tests
   compile unchanged, and `BlockCard` already passes the full definition.

## Risks / Trade-offs

- [Long item lists produce long strings] → the existing one-line truncation
  with an ellipsis bounds the text, and the header `span` already truncates
  visually.
- [Labels are not localized] → same as every other label in the admin today;
  the format adds only digits and punctuation.
- [Dependency on the unmerged compact-rows branch] → apply on
  `feat/admin-compact-list-media-rows` or after it merges; tasks start by
  confirming `itemSummary` is present.
- [Summaries recompute on every render] → cost is linear in the block's data,
  the same order as the current walk; no memoization needed.
