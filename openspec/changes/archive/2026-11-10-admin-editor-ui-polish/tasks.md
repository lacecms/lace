## 1. Globals naming

- [x] 1.1 Rename the navigation group key/label to `globals`/"Globals" in `widgets/admin-shell/navigation.ts`, the unsynchronized-global hash in `SidebarNav`, the tour step in `tour.ts`, and the content-landing section id/heading in `pages/content/ContentPage` (design D1); update `navigation.test.ts`, `SidebarNav.test.tsx`, the tour tests, `ContentPage.test.tsx`, `admin-client.test.ts` and `e2e/globals.e2e.ts`; verify those tests pass

## 2. Entry editor layout

- [x] 2.1 Center the editor form and replace the visible "Edit {label}" eyebrow with a visually hidden `h1` of the same text in `EntryPage` (design D4, D8); verify `EntryPage` tests still find the "Edit …" heading
- [x] 2.2 Show the list budget line only from 400 elements or with a budget problem in `EntryListBudget` (design D3); add unit cases for 12, 400 and over-budget entries
- [x] 2.3 Omit the Blocks section and render the *Fields* card in the main column when the model allows no block types and the entry holds no blocks (design D2); verify unit tests for a block-less global, a block-less model with an orphaned block, and a page with blocks keeping fields in the right-hand column
- [x] 2.4 Make the title input transparent in the dark theme until hover or focus (design D10)

## 3. Block editor

- [x] 3.1 Clear the active block on pointer press or focus outside the block list, ignoring dialogs, menus, listboxes and popovers (design D5); verify `BlockEditor.test.tsx` cases for an outside click, focus leaving the list, the block actions menu and the media dialog keeping the highlight
- [x] 3.2 Add the Collapse all / Expand all control beside the Blocks heading for two or more blocks (design D6); verify cases for collapse then expand, an invalid block staying expanded, no control with one block, and the draft staying clean

## 4. Field polish

- [x] 4.1 Hide the count of unbounded text/textarea fields while empty and keep bounded counts (design D7); update `FieldRenderer` tests and `e2e/field-guidance.e2e.ts`, verify they pass
- [x] 4.2 Change SEO counters to "`n` / 60 recommended · 200 max" and the description equivalent in `EntrySeoCard`; update `EntrySeoCard.test.tsx` and `e2e/seo.e2e.ts`
- [x] 4.3 Sentence-case the Create button label of empty groups/objects in `FieldRenderer` and `ListField` (design D9); add unit cases for "Links" and an acronym label
- [x] 4.4 In the repository `lace.config.ts`, remove the Title template description and move `helpUrl` after `image` (design D11); verify the configuration synchronization check reports no blocking change and any test relying on the field order passes

## 5. Documentation and verification

- [x] 5.1 Add a per-model navigation icon item to `backlog.md` and record this change in the roadmap's owner-inserted change list
- [x] 5.2 Check the changed screens in the browser in dark theme (Site settings → Globals, Home blocks, collapse all, outside click); run the admin unit suite, the affected admin e2e files, root typecheck, Oxlint, Oxfmt check, `pnpm spec:validate` and `pnpm exec openspec validate admin-editor-ui-polish --type change --strict`; verify all pass
