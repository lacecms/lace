## 1. Admin navigation, breadcrumbs and tour

- [x] 1.1 Add `isSingletonModel(model)` to `apps/admin/src/entities/content` (page or global) with a unit test, and use it wherever a check means "singleton"; verify with `pnpm --filter @lacecms/app-admin test -- entities/content`.
- [x] 1.2 Extend `widgets/admin-shell/navigation.ts`: `NavigationGroup.key` gains `"site"`, `NavigationItem` gains `kind: "global"` (Globe icon), `navigationGroups()` emits Pages, Collections, Site, Library, Admin and omits an empty Site group, and `breadcrumbsFor()` gives any singleton the `[Content, label]` crumb; update `navigation.test.ts` with a global model (group order, no Site group without globals, global breadcrumb) and verify it passes.
- [x] 1.3 Generalize `PageLink` in `SidebarNav.tsx` into a singleton link used for page and global items (overview fallback `#pages` or `#site`, refreshed with the same overview query); extend `SidebarNav.test.tsx` for the Site list, the singleton href and the unsynced fallback, and verify it passes.
- [x] 1.4 Add a Site tour step in `widgets/admin-shell/tour.ts` when the `site` group exists, describing globals as site-wide content with one entry each; extend `tour.test.ts` (step present after Collections only with globals) and verify it passes.

## 2. Content overview and model route

- [x] 2.1 Add the Site section (`id="site"`) with `GlobalCard` (label, description, status, relative edit time, editor; sync guidance with `pnpm content:sync` when the singleton is missing; per-card error) to `pages/content/ContentPage/ContentPage.tsx`, update the intro and empty-state copy to name globals, and cover it in `ContentPage.test.tsx`; verify it passes.
- [x] 2.2 Make `pages/model/ModelPage/ModelPage.tsx` render the singleton placeholder for globals with kind-neutral wording, and add a global case to `ModelPage.test.tsx`; verify it passes.

## 3. Global editor and dialogs

- [x] 3.1 In `pages/entry/EntryPage/EntryPage.tsx`, hide the title input for a global (the save payload keeps the loaded title) and show the model description under the heading when configured; add `EntryPage.test.tsx` cases for a global (no title or slug control, save request carries the stored title and no slug) and verify they pass.
- [x] 3.2 In `EntryPublicationDetails`, omit the Public URL fact and "Open on site" link for a global; add a test with a configured site URL and verify it passes.
- [x] 3.3 Add a `kind` prop to `features/publish-entry/PublishEntryDialog` with the global titles and the "affects every page that shows it after the next site build" description, pass `model.kind` from `EntryPage`, and title the global unpublish dialog "Unpublish this site content?"; extend the dialog tests and verify they pass.
- [x] 3.4 Verify `EntryActionsMenu` offers only Revert to published and Unpublish for a global with an `EntryActionsMenu.test.tsx` case; verify it passes.

## 4. Admin browser tests

- [x] 4.1 Add a mocked Playwright spec `apps/admin/e2e/globals.e2e.ts` (stateful mock in the style of `entry-actions.e2e.ts`) where an admin, using only the keyboard, opens "Site settings" from the Site group, changes the site name, saves, publishes through the confirmation (asserting the every-page text), changes the tagline, saves and reverts to published; assert visible focus, the absence of title, slug and "Open on site", the absence of Duplicate and Delete, and the exact request sequence; verify with `pnpm --filter @lacecms/app-admin test:e2e -- globals`.
- [x] 4.2 Add a global model to the mocked models of `apps/admin/e2e/accessibility.e2e.ts` and add the global editor and its model route to the audited routes; verify the accessibility spec passes.

## 5. Reference site and root configuration

- [x] 5.1 Add the `settings` global (`siteName` required text, `tagline` optional text, label "Site settings") to the root `lace.config.ts`, update `apps/api/src/project-config.test.mjs`, and verify that test and the cross-runtime fixture's synchronization unit tests pass.
- [x] 5.2 Give `apps/site/src/layouts/BaseLayout.astro` the `site` prop and the settings header with the "Lace reference site" fallback, pass `site` from every page, add header styles to `site.css`, and add a published `settings` global to `src/fixtures/published-export.json`.
- [x] 5.3 Extend `apps/site/src/fixture-build.test.mjs`: the fixture build shows the fixture site name and tagline on every route, and a live build of an export without `globals` shows the fallback with one export read; verify with `pnpm --filter @lacecms/app-site test`, then run `tests/existing-astro-site.test.mjs` and `tests/regression-helpers.test.mjs` against the changed fixture.

## 6. Starter template 0.24.0

- [x] 6.1 Add the `settings` global to `packages/create-lace/templates/lace.config.ts`; give the starter `BaseLayout.astro` the `site` prop and header with the "Lace starter" fallback, pass `site` from `index.astro` and `blog/[slug].astro`, and add header styles to `global.css`.
- [x] 6.2 Document `site.global()`, its `undefined` result and the fallback pattern in the managed `templates/docs/lace-astro-site.md`.
- [x] 6.3 Set `TEMPLATE_VERSION` to `0.24.0`, update `.lace/upgrade-instructions.json` (template version; three `database` entries for `0007` meaning and rollback-by-restore, Compose and Cloudflare steps; a `configuration` entry "Template 0.24.0: …" for the global kind, Site group, public endpoint, `globals` export key, coordinated deployment and manual adoption of the starter global), and update `packages/create-lace/src/index.test.mjs` and `packages/cli/src/upgrade-command.test.mjs`; verify both packages' tests pass.
- [x] 6.4 Extend `starterJourney` in `scripts/generated-project-acceptance.mjs` to build once with a served `settings` global and once without `globals`, asserting the header text and one export read per build; regenerate `tests/fixtures/generated-project/*.json` with `node scripts/generated-project-acceptance.mjs snapshots --update`, and verify `tests/generated-project-acceptance.test.mjs` and `pnpm acceptance:starter` pass.
- [x] 6.5 Run `scripts/template-upgrade-acceptance.mjs` (or its test) to confirm a 0.23.0 project upgrades to 0.24.0 with user-owned `lace.config.ts` and site files unchanged.

## 7. Documentation

- [x] 7.1 Update `docs/mvp-architecture.md` section 17 (Site group, global overview card and model route, global editor without title, path and link, publish wording) and section 8's starter description; update `docs/compatibility.md` (source template `0.24.0`, optional starter `settings` global) and `apps/site/README.md`.
- [x] 7.2 Update `docs/content-editor-roadmap.md`: CE5 status, and a log row for CE5B with the decisions recorded in design.md.

## 8. Verification

- [x] 8.1 Run the admin unit tests and full Playwright e2e suite, then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate ce05b-admin-globals-starter --type change --strict`; record any skipped check and why.
