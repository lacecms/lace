## 1. Architecture and docs

- [x] 1.1 Confirm `apps/admin/src/entities/content/item-summary.ts` (from `admin-compact-list-media-rows`) is present on the working branch; stop and report if it is not.
- [x] 1.2 Update the block card summary bullet in `docs/mvp-architecture.md` §17 to the new order: top-level text, rich text, URL/select, first non-empty list (`Label (n): item, item`) or group, "Media selected", "Empty block".
- [x] 1.3 Add one sentence to `docs/composite-fields.md` (near the `itemLabel` summary paragraph) explaining that block headers summarize their first non-empty list as its label, count and item summaries.

## 2. Block summary

- [x] 2.1 Export `itemSummary` from `apps/admin/src/entities/content/index.ts`.
- [x] 2.2 In `apps/admin/src/widgets/block-editor/block-presentation.ts`, widen `blockSummary` to `Pick<BlockDefinitionDto, "fields" | "layout">` and add the composite tier after URL/select: visit `formFieldKeys(fields, layout)`, for a list with items return `fieldLabel(key, label) + " (n)"` plus `": "` and the joined non-empty item primaries from `itemSummary(field.item, item, field.itemLabel)`, for a group return `itemSummary(field, value).primary`; truncate as today.
- [x] 2.3 Extend the media tier so a group whose `itemSummary` reports media yields "Media selected"; keep "Empty block" as the last fallback.
- [x] 2.4 Make `BlockCard.tsx` pass the definition (with `layout`) unchanged, adjusting the call only if types require it.

## 3. Tests

- [x] 3.1 Add `block-presentation.test.ts` cases using the built-in `navigation` and `gallery` definitions from `@lacecms/content`: "Links (2): Blog, About"; "Images (3)" for uncaptioned media items with no media ID in the output; captioned items list their captions; a title still wins ("Team"); an empty list gives "Empty block"; a long list is truncated with an ellipsis.
- [x] 3.2 Add cases for a custom definition with a top-level group (primary text wins; media-only group gives "Media selected") and for layout order deciding which of two non-empty lists is used.
- [x] 3.3 Keep all existing `blockSummary` cases passing unchanged.
- [x] 3.4 Add a `BlockCard.test.tsx` case that a collapsed Navigation card with two links shows "Links (2): Blog, About" in its header.

## 4. Verification

- [x] 4.1 Run the admin unit tests for `block-presentation` and `BlockCard` (`pnpm --filter @lacecms/app-admin exec vitest run src/widgets/block-editor`).
- [x] 4.2 Run root typecheck, Oxlint and Oxfmt check.
- [x] 4.3 Run `pnpm exec openspec validate admin-block-list-summary --type change --strict`.
