## 1. Media-first built-in fields

- [x] 1.1 Reorder the `fields` literals of `builtInBlocks.image` and the `gallery` item group in `packages/content/src/index.ts` to `media`, `alt`, `caption`, `link`. Add a content test asserting that key order and that model and whole-configuration structural and projection hashes equal those of an alphabetical copy. Verify with `pnpm turbo run test --filter=@lacecms/content`.
- [x] 1.2 Confirm that the admin receives the new order. Assert in an admin unit test (BlockCard or FieldLayout over the starter `image` and `gallery` metadata) that the media control renders first. Verify the test passes.

## 2. Preview extension point and summaries (entities/content)

- [x] 2.1 Add `ItemPreview`, `FieldPreviewProps` (with `group` context) and `FieldPreviewRegistry` to `field-types.ts`, accept optional `previews` in `FieldRendererProvider`, and export the types from `entities/content`. Verify typecheck of `apps/admin`.
- [x] 2.2 Extract the alt-override shape rule (exactly one media field and a text `alt` field) into a shared helper in `entities/content`, and make `BlockCard`'s `InheritedAltField` use it. Verify that the existing BlockCard alt-inheritance tests still pass.
- [x] 2.3 Replace `summary()` with a pure `itemSummary()` that returns primary text, secondary text from a different field, and a media-present flag, and add the preview-leaf selection (first direct child in `formFieldKeys` order with a registered preview and a present value). Verify with unit tests for gallery-, navigation-, empty- and media-only items, and for whitespace and truncation rules.

## 3. List rows, menus and disclosures (FieldRenderer)

- [x] 3.1 Replace the text "Collapse/Expand <label>" button in `Disclosure` with an icon-only chevron `Button` that keeps the same accessible names. Render a group used as a list item flat (no `Disclosure`). Verify with FieldRenderer unit tests for a standalone group's names and a list item group without a legend or toggle.
- [x] 3.2 Rebuild `ListNode` presentation. Replace the `Disclosure` with a header (label, `count / max`, Add, list `DropdownMenu` with Clear when offered) and a single bordered container with divided rows. Show the publication-minimum text as quiet guidance. Keep the "Not set" and Create states. Verify with unit tests for a gallery and a nested submenu header, and for the minimum visible-while-unmet and accessible-always behavior.
- [x] 3.3 Rebuild `SortableItem` as a row: handle, leading visual (preview or position), primary and secondary lines, preview indicators, problem indicator, chevron toggle for group items, and an item `DropdownMenu` named "Actions for <list> item <n>" with Move up, Move down, Duplicate and Remove keeping their current aria-labels, disabled states and the Duplicate limit explanation. Scalar items render their control inline. Viewers get no menu or handle. Verify with unit tests for menu contents, boundary disabling, viewer mode and the limit explanation.
- [x] 3.4 Add per-list open state keyed by item token. It resets on `epoch`, new items from Add and Duplicate start open and focused, and rows open on `REVEAL_CONTROL_EVENT`. Prevent the menu's close auto-focus when a focus target was set. Verify with unit tests for collapsed-on-load, add/duplicate open and focus, focus after Remove (next, previous, Add), open state following a move, a clean form after toggling, and reveal of a nested error in a collapsed item.
- [x] 3.5 Wire the preview registry into collapsed rows: render the selected leaf's `Preview` with the `group` context and compose lines per the design merge rule, falling back to "Media selected" and "Empty item". Verify with unit tests using a stub preview, including a stub returning no title.

## 4. Stable field chrome

- [x] 4.1 Split guidance into publication-only and bounds parts and keep every `aria-describedby` ID resolvable. Verify with FieldRenderer and FieldControls unit tests and `pnpm --filter @lacecms/app-admin lint` with the admin color and boundary checks.
- [x] 4.2 Replace the focus-revealed helper text: render the text count right-aligned in the leaf label row, always visible; make "Required for publication only." `sr-only` unless the field has a problem or the editor is read-only, and set it as the Required marker's `title`; make list minimum guidance visible only while unmet, on a problem or in view-only mode. Verify with unit tests for the label-row counter, required tooltip, problem and viewer visibility, and with `media-metadata.e2e.ts` Replace opening the picker.

## 5. Compact media control and media preview (widgets/media-library)

- [x] 5.1 Restyle `SelectedMedia` as one frameless row: 56px thumbnail, filename with status badge, facts, alt line, Replace, and a `DropdownMenu` whose Remove keeps the "Remove media from <label>" name and focus-to-Choose-media behavior. Keep the resolving, missing, unreadable, pending-deletion and retry states. Verify with updated `SelectedMedia` and `MediaPicker` unit tests.
- [x] 5.2 Add `MediaItemPreview`: thumbnail visual, filename title, facts detail, a "No alt" indicator via the shared alt-override helper, and a placeholder visual with an accessible state for missing or unreadable items, using the shared media detail query. Pass `previews={{ media: MediaItemPreview }}` from `EntryPage`. Verify with unit tests for the with-caption, no-alt, alt-typed and missing-media scenarios.

## 6. Tests, docs and verification

- [x] 6.1 Add an e2e helper that opens an item's actions menu and activates an action, and update `composites`, `editor`, `form-layout`, `field-guidance`, `rich-text` and `block-order` e2e suites plus `EntryPage*`, `BlockEditor` and `BlockCard` unit tests for menu actions, collapsed items and quiet counters. Verify that the full admin e2e suite and admin unit tests pass.
- [x] 6.2 Update `docs/composite-fields.md` (rows, item menu, collapsed-by-default, previews and the "Media selected" fallback) and `apps/docs/src/content/docs/en/latest/editing-content/index.md` (Move up/down and Duplicate in the item menu). Verify with `pnpm docs:build`.
- [x] 6.3 Visually check the Image, Gallery and Navigation blocks in the running admin against the approved mockup, in light and dark themes and at a narrow viewport. Then run the root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate admin-compact-list-media-rows --type change --strict`, and confirm they pass.
