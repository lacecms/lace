## Why

CE2A added unpublish, revert and duplicate commands to the API, but the admin offers none of them. Delete is reachable only from a label-less trash icon in a collection row, the editor has no lifecycle actions at all, publishing edited content takes two steps (Save, then Publish), creating an entry leaves the author in the list, and the public path is plain text that cannot be opened.

This change implements roadmap step **CE2 — Entry lifecycle**, session unit **CE2B — Admin editor actions** ([content and editor roadmap](../../../docs/content-editor-roadmap.md), section 5, owner decisions 1–3). It consumes the CE2A endpoints ([ADR 0008](../../../docs/adr/0008-entry-lifecycle-commands.md)) and completes CE2.

## What Changes

- **Entry actions menu.** The editor header gets an "Entry actions" menu (⋯) with Duplicate, Revert to published, Unpublish and Delete. Each item appears only when the actor has the permission and the entry state allows it:
  - Duplicate: `content:write`, collection entries only.
  - Revert to published: `content:write`, the entry is published and the saved draft or the form differs from the publication.
  - Unpublish: `content:publish`, the entry is published.
  - Delete: `content:write`, collection entries only, and `content:publish` when the entry is published (the API rule from CE2A).
  
  Viewers see no menu. Pages never offer Duplicate or Delete.
- **Plain-language confirmations.**
  - Unpublish says that the public path stops working after the next site build. For a page, it says that the fixed path will return 404. On success the publication card follows the queued build, like a publication.
  - Revert says what is lost: the saved draft changes since the last publication and any unsaved changes in the form. When only unsaved changes differ, Revert discards them locally without a request.
  - Deleting a published entry requires typing the entry's saved title and says that the page disappears from the site after the next build. Deleting a draft-only entry keeps the single confirmation.
- **Save and publish.** When the draft has unsaved changes, the admin's Publish control reads "Save and publish". Confirming validates the form, saves the draft, and then publishes the saved revision with one idempotency key. If validation or the save fails, nothing is published and the editor shows the save error as it does today. A publish retry reuses the same key.
- **Navigation.**
  - Creating an entry opens it in the editor.
  - Duplicating opens the copy. The copy is built from the last saved draft, so unsaved changes stay behind the existing discard-changes prompt.
  - Deleting from the editor returns to the collection list without a discard prompt and announces the deletion.
- **Slugless drafts save cleanly.** An empty collection slug input means "no slug": the save omits it and the form baseline matches it. Today the editor sends `slug: ""`, which the API rejects, and new and duplicated entries, which CE2B now opens directly, have no slug.
- **Open on site.** When the entry is published and the deployment configures the site's URL, the public path becomes an "Open on site" link that opens in a new tab. Otherwise the path stays as text.
- **Site URL setting.** The new optional deployment setting `LACE_BUILD_SITE_URL` is the public site's absolute HTTP(S) base URL. It sits next to `LACE_BUILD_SITE_ID` and `LACE_BUILD_SITE_LABEL` and is parsed by the shared `parseBuildSiteIdentity` for Node and the Worker. `GET /api/v1/admin/build-site` returns it as an optional `url` on the configured site. A URL without an identity, or a malformed URL, fails startup and names only the variable. An empty value counts as unset. Generated Compose, `.env.example` and `wrangler.jsonc` templates document it.
- **Collection row actions.** The row trash icon is replaced by a labeled "Actions for {title}" menu with Open, Duplicate and Delete. Duplicate and Delete follow the same permission and state rules as the editor menu. Delete opens the same confirmation as the editor, including typed-title confirmation for published entries.
- **Docs.** Architecture section 17 (editor header, menus, confirmations, save-and-publish, site URL). Build-site identity in the operations guides. Roadmap status, session log and step completion.

Non-goals:

- New lifecycle semantics: unpublish, revert, duplicate and delete keep the CE2A API behavior.
- Trash, restore or undo for deletion (owner decision 1).
- Showing the site URL on the Builds and Settings screens. They keep showing the label and ID.
- Deriving the site URL from `LACE_PUBLIC_BASE_URL`, the admin origin or provider deployment data.
- Bulk list actions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: the entry actions menu and its confirmations, save-and-publish, navigation after create/duplicate/delete, and the "Open on site" link. The publication requirement drops the clean-draft precondition for publishing.
- `admin-remote-state-and-lists`: the labeled row actions menu replaces the delete icon; create opens the editor; duplicate from the list.
- `build-site-selection`: the optional site URL in the `GET /api/v1/admin/build-site` identity contract and its startup validation. This spec owns that endpoint's contract, so `rest-contracts` does not change.

## Impact

- `packages/contracts`: `buildSiteIdentitySchema` gains optional `url`.
- `packages/server`: `parseBuildSiteIdentity` reads `LACE_BUILD_SITE_URL`.
- `packages/platform-node`, `packages/platform-cloudflare`: pass the variable through their settings types.
- `apps/api/openapi/api-v1.json`: regenerated.
- `apps/admin`: admin client (unpublish, revert, duplicate), the entry actions menu, dialogs, the row actions menu, create/duplicate navigation, save-and-publish, the site link, unit tests, Playwright tests and the accessibility audit.
- Templates and docs: `packages/create-lace/templates` (`.env.example`, `docker-compose.yml`, `worker/wrangler.jsonc`, `docs/lace-operations.md`), the root `docker-compose.yml`, refreshed generated-project fixtures, `docs/mvp-architecture.md`, `docs/content-editor-roadmap.md`.
- Browser acceptance scripts that create an entry and then click it in the list (`apps/admin/e2e/acceptance.e2e.ts`, `scripts/cloudflare-consumer-acceptance.mjs`) are updated, because creation now opens the editor.
- No database migration. No new endpoints. Depends on CE2A (`f8be55f`) on the same branch.
