## 1. Shared SEO text rules

- [x] 1.1 In `packages/contracts/src/index.ts`, re-export `isCanonicalUrl` and `normalizeSeoText` from `@lacecms/domain`, and add `seoText(value)` and `formatSeoTitle(title, defaults: { siteName?, titleTemplate? })` moved unchanged from `packages/sdk/src/seo.ts`; add contracts unit tests (whitespace collapse, blank → undefined, template with `%s` inserted literally including `$&`, template without `%s` ignored, default `%s | siteName`, bare title without site name); verify with `pnpm --filter @lacecms/contracts test`.
- [x] 1.2 Make `packages/sdk/src/seo.ts` import `seoText` and `formatSeoTitle` from `@lacecms/contracts` and keep exporting `seoText`; verify `pnpm --filter @lacecms/sdk build && pnpm --filter @lacecms/sdk test` pass unchanged.

## 2. Form values, validation and issue mapping

- [x] 2.1 Add `entities/content/seo.ts` with the `seo` form shape, `seoFormValues(dto)`, `seoInput(values)` (trimmed text, blank → `null`), the recommended lengths 60/160, `seoProblems(values)` with the design's sentences, and `seoDefaultsAnnotation(model, key)`; extend `DraftEditorValues` with optional `seo`, make `draftValues` set it only for models with `seo`, include it in `localDraftJson`, and run `seoProblems` in the draft resolver; cover in `seo.test.ts`, `draft.test.ts` and `editor-form.test.ts`, and verify they pass.
- [x] 2.2 Extend `IssueLocation`/`issueLocation()` for `/seo/<key>` (leaving `/seo` unmapped), `serverIssueMessage()` for the SEO issue codes, and `validationProblems()` with SEO problems after model fields in card order with the `seo-*` control targets; add cases to `editor-form.test.ts` and `validation-problems.test.ts` and verify they pass.

## 3. Inheritance, preview and site defaults

- [x] 3.1 Add `seoInheritance({ model, values, defaults, siteUrl })` to `entities/content/seo.ts` returning the title, description, image and canonical placeholders and the preview (title, URL, description or snippet note, hidden flag) per the spec, using `seoText`/`formatSeoTitle` from contracts; unit-test every fallback step, the page and collection paths (no slug → no URL), canonical override and unsaved field values.
- [x] 3.2 Add `useSeoDefaults(models)` in `entities/content` (defaults global → overview singleton → `loadEntry` → published fields through the mapping); test with a mocked client that published values are used and that a missing global, missing entry, draft-only global or read error yields no defaults; export the new API from `entities/content/index.ts`.

## 4. Editor UI

- [x] 4.1 Add an optional `label` prop to `widgets/media-library/MediaPicker` (button name and dialog title) with a `MediaPicker.test.tsx` case, and an optional `annotation` prop to `FieldRenderer` (shown to all users, part of `aria-describedby`) with a `FieldRenderer.test.tsx` case; verify they pass.
- [x] 4.2 Add `pages/entry/EntrySeoCard` (SEO title and description with counters, soft warnings, placeholders and errors; SEO image through `MediaPicker` with an inherited-image line; canonical URL; "Hide from search engines" switch with description; search-result preview section) with `EntrySeoCard.test.tsx` covering counters and warnings at the thresholds, placeholders, preview, read-only mode and accessible descriptions; verify it passes.
- [x] 4.3 Wire the card into `EntryPage` after *Fields* for models with `seo`, read the build site URL and `useSeoDefaults`, send `seo: seoInput(...)` on save only for SEO models (removing the pass-through), and pass `seoDefaultsAnnotation` to the defaults global's fields; update `EntryPage.test.tsx` (edit and save payload with `null`s and `noindex`, clearing a stored value, no `seo` key and no card without SEO, revert/discard reset, server `/seo/canonical` issue in summary, `/seo` issue as text, global annotations for writer and viewer) and verify `pnpm --filter @lacecms/app-admin test` passes.

## 5. Browser tests

- [x] 5.1 Add a mocked Playwright spec `apps/admin/e2e/seo.e2e.ts` (stateful mock in the style of `globals.e2e.ts`: a `posts` collection with `seo: { description: "excerpt", image: "cover" }`, a published `settings` global with `seoDefaults`, configured site URL) where an admin, using only the keyboard, opens a post, checks the inherited placeholders and preview, types a long SEO title and sees the count and warning, enters a relative canonical URL and is blocked with the summary focusing the control, fixes it, checks "Hide from search engines", saves (asserting the exact `seo` payload and request sequence) and sees the preview update; assert visible focus along the flow and the site-default text in the `settings` editor; verify with `pnpm --filter @lacecms/app-admin test:e2e -- seo`.
- [x] 5.2 Add an SEO-enabled model and a `seoDefaults` global to the mocked models of `apps/admin/e2e/accessibility.e2e.ts` and add the SEO entry editor (with a length warning and an SEO error shown) and the defaults global editor to the audited routes in both themes; verify the accessibility spec passes.

## 6. Documentation

- [x] 6.1 Update `docs/mvp-architecture.md` section 17 (the SEO card, counters and soft warnings, placeholders, preview from published defaults, defaults global annotations, preview ignores `LACE_SITE_INDEXING`) and add an "Admin editing (CE4C)" section to `docs/adr/0011-seo-system-group.md`.
- [x] 6.2 Update `docs/content-editor-roadmap.md`: CE4 status done and a log row for CE4C with the decisions recorded in design.md.

## 7. Verification

- [x] 7.1 Run the admin unit tests and the full admin Playwright e2e suite, then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate ce04c-admin-seo-editing --type change --strict`; record any skipped check and why.
