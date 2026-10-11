## 1. Build-site URL (contracts, server, runtimes)

- [x] 1.1 Add `buildSiteUrlSchema` and the optional `url` to `buildSiteIdentitySchema` in `packages/contracts` (D7), with contract tests that accept `https://example.com/` and `http://127.0.0.1:4321/blog/` and reject credentials, a query, a fragment, a non-HTTP scheme, a missing trailing slash and more than 2048 characters; verify `pnpm --filter @lacecms/contracts test`.
- [x] 1.2 Extend `parseBuildSiteIdentity` in `packages/server` to read `LACE_BUILD_SITE_URL` (empty means unset, `href` normalization plus a trailing slash, raw `?`/`#` rejected, URL without identity rejected, sanitized messages naming only invalid variables), and cover each case in `build-site.test.mjs`; verify `pnpm --filter @lacecms/server test`.
- [x] 1.3 Pass `LACE_BUILD_SITE_URL` through the Node runtime and Worker settings environment types and add one Node and one Worker startup test each for a valid URL in `/api/v1/admin/build-site` and an invalid URL failing startup without its value; verify the `@lacecms/platform-node` and `@lacecms/platform-cloudflare` tests.
- [x] 1.4 Regenerate `apps/api/openapi/api-v1.json` and verify that the OpenAPI check passes.

## 2. Admin client and shared state

- [x] 2.1 Add `unpublishEntry` (body `expectedPublishedSnapshotId`, `idempotency-key` header, `unpublishContentEntryResultSchema`), `revertEntry` (body `expectedRevision`) and `duplicateEntry` (body `expectedRevision`, `201`) to the admin client with tests for paths, bodies, headers and invalid responses; verify `admin-client.test.ts`.
- [x] 2.2 Add `entryActions(...)` to `entities/content` (D1) with a truth-table test covering role, kind, published, saved changes and unsaved changes; verify the entity tests.
- [x] 2.3 Add a one-shot focus request to `shared/lib` (`requestFocus`/`consumeFocusRequest`) and make `CollectionEntries` focus its heading once when it mounts with a request for its model (D5); verify with `pending-focus` and `CollectionEntries` tests.

## 3. Feature slices

- [x] 3.1 Rework `features/delete-entry` `DeleteEntryDialog` into a controlled dialog with `published` typed-title confirmation, the site-disappears wording, return focus on cancel and `onDeleted` (D2, D3), and update its tests: draft single confirmation, published typed title (mismatch keeps the action unavailable, exact match enables it), cancel sends nothing, failure keeps the dialog open.
- [x] 3.2 Add `features/unpublish-entry` `UnpublishEntryDialog` (collection and page wording, idempotency key kept across a network retry and replaced after a terminal response, conflict and not-published errors with a reload action) with tests for each.
- [x] 3.3 Add `features/revert-entry` `RevertEntryDialog` (loss list for saved and unsaved changes, API revert only when saved changes exist, local discard otherwise, conflict keeps the dialog) with tests for each.
- [x] 3.4 Add `features/duplicate-entry` `useDuplicateEntry` (API call, list invalidation, seeded detail query, toast, navigation to the copy, error toast) with tests for success navigation and failure.
- [x] 3.5 Make `CreateEntryDialog` seed the created entry and navigate to its editor (D6), and update its tests to assert the navigation.
- [x] 3.6 Give `PublishEntryDialog` the `unsavedChanges` mode ("Save and publish" trigger and wording) and update its tests.

## 4. Editor and list composition

- [x] 4.1 Add `pages/entry` `EntryActionsMenu` ("Entry actions" menu, items from `entryActions`, dialogs as siblings, trigger refs for focus, `busy` disabling) and test admin/editor/viewer and page/collection combinations.
- [x] 4.2 Wire `EntryPage`: menu in the header, save-and-publish chain (D4), unpublish adoption with build follow-up and kept dirty values, revert adoption and local discard, delete with blocker bypass and navigation, duplicate navigation (D5). Treat an empty collection slug input as no slug, both in the form baseline and in the saved draft, so that created and duplicated entries without a slug save cleanly (D6). Cover validation stop, save failure stop, request order, unpublish with a dirty form, revert, delete without the discard prompt, duplicate and the slugless save in `EntryPageLifecycle.test.tsx`.
- [x] 4.3 Add the "Open on site" link to `EntryPublicationDetails` from the build-site query (D7), with tests for a configured URL with a base path, no URL, a failed identity read and an unpublished entry.
- [x] 4.4 Replace the row trash icon with `widgets/collection-entries` `EntryRowActions` ("Actions for {title}": Open, Duplicate, Delete per `entryActions`) and update the `EntryListTable` and `CollectionEntries` tests, including focus return to the menu button after cancel and focus on the heading after deletion.

## 5. Browser verification

- [x] 5.1 Add `apps/admin/e2e/entry-actions.e2e.ts` (mocked API) covering unpublish, revert, duplicate and delete for admin, editor and viewer, the typed-title delete, save-and-publish with a validation error and with success, row menu keyboard operation, and the site link; verify `pnpm --filter @lacecms/app-admin test:e2e -- entry-actions`.
- [x] 5.2 Extend `accessibility.e2e.ts` to audit the open entry actions menu and the unpublish, revert and published-delete dialogs in both themes; verify the accessibility suite passes.
- [x] 5.3 Update the create-entry steps in `apps/admin/e2e/acceptance.e2e.ts` and `scripts/cloudflare-consumer-acceptance.mjs` for create-opens-editor and check them with Oxlint. They need live environments and are not run here.

## 6. Templates and documentation

- [x] 6.1 Add `LACE_BUILD_SITE_URL` to the generated `.env.example` (starter and existing modes), `docker-compose.yml` API service (site modes), `worker/wrangler.jsonc` (commented example) and the root `docker-compose.yml`. Document it in `templates/docs/lace-operations.md` (Selecting the build site), `docs/node-api.md` and `docs/cloudflare-worker.md`. Refresh `tests/fixtures/generated-project/*.json` and verify the `create-lace` tests and the generated-project snapshot check.
- [x] 6.2 Update `docs/mvp-architecture.md` section 17 (header entry actions menu, confirmations, save and publish, create/duplicate/delete navigation, row actions menu, site link from `LACE_BUILD_SITE_URL`) and mark CE2B and CE2 done in `docs/content-editor-roadmap.md`, with a session log row.

## 7. Verification

- [x] 7.1 Run the narrowest admin tests, then root `pnpm typecheck`, `pnpm lint` (Oxlint), `pnpm format:check` (Oxfmt) and `pnpm exec openspec validate ce02b-admin-entry-actions --type change --strict`, and fix any failure.
