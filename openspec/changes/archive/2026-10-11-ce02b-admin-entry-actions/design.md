## Context

CE2A (`f8be55f`) added `POST /api/v1/admin/entries/:entryId/{unpublish,revert,duplicate}` and refused page deletion. The admin consumes none of them. Today:

- `EntryPage` (`apps/admin/src/pages/entry/EntryPage`) fills the shell header with `EntryEditorActions`: the save-state indicator, Save and, for `content:publish`, `PublishEntryDialog`. Publish is disabled while the form is dirty.
- `DeleteEntryDialog` (`features/delete-entry`) owns its icon trigger and is rendered only by `EntryListTable` as a label-less trash button per row.
- `CreateEntryDialog` closes after creation and leaves the user in the list.
- `EntryPublicationDetails` shows the public path as `<code>`. The admin has no site origin: `LACE_PUBLIC_BASE_URL` is the CMS origin, and on Cloudflare the site lives on a Pages domain.
- The build-site identity (`LACE_BUILD_SITE_ID`, `LACE_BUILD_SITE_LABEL`) is parsed by `parseBuildSiteIdentity` in `@lacecms/server` for Node and the Worker and read through `GET /api/v1/admin/build-site`.

Permissions are server-derived (`can(session, …)`). Editors have `content:write`, admins also `content:publish`. CE2A's delete requires `content:publish` for a published entry.

The admin follows the feature-sliced layout (`admin-source-structure`): a module imports only lower layers or its own slice, and every slice exports through `index.ts`.

## Goals / Non-Goals

**Goals:**

- One entry actions menu in the editor header and one row actions menu in collection lists, both permission- and state-aware.
- Confirmations that say what happens to the public site and what is lost.
- Save and publish in one confirmed action with one idempotency key.
- Create and duplicate open the entry. Delete returns to the list.
- A real "Open on site" link backed by explicit deployment configuration.

**Non-Goals:**

- Changing CE2A API semantics, adding endpoints, or adding a database migration.
- Trash, restore or undo for deletion.
- Showing the site URL on Builds or Settings.
- Bulk actions.

## Decisions

### D1. Action availability is one pure function

`entities/content` gains `entryActions({ canWrite, canPublish, kind, published, savedChanges, unsavedChanges })`. It returns `{ duplicate, revert, unpublish, delete }` booleans, implementing the spec table:

- duplicate: write ∧ collection;
- revert: write ∧ published ∧ (savedChanges ∨ unsavedChanges);
- unpublish: publish ∧ published;
- delete: write ∧ collection ∧ (¬published ∨ publish).

`savedChanges` is `entryStatus(entry) === "changed"`. The editor menu and the row menu use it, and the row passes `unsavedChanges: false` and derives `published`/`savedChanges` from the summary `status`. One function keeps the two menus consistent and is unit tested exhaustively.

### D2. Lifecycle dialogs are controlled feature slices; menus compose them

- `features/delete-entry`: `DeleteEntryDialog` becomes controlled (`open`, `onOpenChange`) and loses its trigger. New props: `published` (typed-title confirmation) and `onDeleted(entry)`. A `returnFocus` ref is focused on a cancelled close. On success it invalidates the model's entry queries and the models query, and removes the entry's detail query.
- `features/unpublish-entry` (new): controlled `UnpublishEntryDialog` with `entryId`, `expectedPublishedSnapshotId`, `kind` (page wording) and `onUnpublished(result)`. It owns the mutation and keeps one idempotency key per attempt. The key is created when the dialog opens and replaced only after a terminal server response, as for publish. On a conflict or a not-published error it shows the error and a "Reload entry" action that calls `onReload`.
- `features/revert-entry` (new): controlled `RevertEntryDialog` with `savedChanges`, `unsavedChanges`, `entryId`, `expectedRevision`, `onReverted(entry)` and `onDiscardUnsaved()`. When `savedChanges` is false it never calls the API.
- `features/duplicate-entry` (new): `useDuplicateEntry(modelKey)`, a mutation hook that calls the API, invalidates list queries, seeds the copy's detail query, shows a success toast and navigates to the copy. It reports failures with an error toast. No dialog.
- `pages/entry`: `EntryActionsMenu` renders the ⋯ `DropdownMenu` (accessible name "Entry actions") and the three dialogs as siblings. It renders for every user with `content:write` or `content:publish`, and shows a disabled "No actions available for this entry" item when the state allows nothing, so an action that empties the menu (for example unpublishing a page) does not remove the element focus returns to.
- `widgets/collection-entries`: `EntryRowActions` renders "Actions for {title}" with Open (a router `Link` item), Duplicate and Delete.

Both menus are non-modal (`modal={false}`): a modal Radix menu marks the rest of the page `aria-hidden` while its controls stay focusable, which the axe audit rejects. Menu items set dialog state in `onSelect`. Dialogs render outside the menu content. Because a Radix dialog opened from a closing menu cannot restore focus to an unmounted item, each dialog's `onCloseAutoFocus` prevents the default and focuses the menu trigger through a ref, except after a navigating success. Rejected: keeping triggers inside the dialogs (not compatible with a menu) and nesting dialogs inside menu items (unmounts with the menu).

### D3. Typed-title confirmation compares the saved title exactly

For a published entry the delete button is enabled only when the input equals the saved draft title (`entry.draft.title` or the summary `title`) after trimming surrounding whitespace in the input. The input is labeled "Type {title} to confirm". The saved title, not unsaved form text, is what the list shows and what the dialog names. Rejected: case-insensitive matching, which weakens the deliberate step.

### D4. Save and publish chains two existing mutations

`PublishEntryDialog` gains `unsavedChanges`. When it is true the trigger reads "Save and publish" and the description says that unsaved changes are saved first. Publish no longer depends on `dirty` for being disabled; it is disabled while a save or publish is pending.

On confirm, `EntryPage` closes the dialog and:

1. runs `form.handleSubmit(onValid, showSummary)`;
2. `onValid` awaits `save.mutateAsync(values)`. The existing `save` `onError`/`onSuccess` handlers apply unchanged: conflict state, server issues, form reset to the saved draft. A rejection ends the chain;
3. it creates `{ idempotencyKey: ulid(), revision: saved.draft.revision }` and calls `publish.mutate(attempt)`. Retry and conflict handling stay as today.

A clean form keeps today's path. Rejected: a combined server command. CE2A deliberately kept publish separate, and two guarded requests give the same safety: publish is guarded on the saved revision.

### D5. Editor state after lifecycle results

- **Unpublish**: `setQueryData(entry)`, `setSavedEntry(result.entry)`, `setLatestBuild(result.build)`. The draft revision is unchanged, so the revision-keyed reset effect does not touch the form and unsaved values survive. The publication card already follows `build.targetVersion`. Spec and labels move from "publication" to "publish or unpublish" wording.
- **Revert via API**: the same adoption path as `reloadServerDraft` (set cache, `loaded` key, `form.reset(draftValues(...))`, clear summary and conflict).
- **Revert locally**: `form.reset(draftValues(model, currentEntry))`.
- **Delete**: a `leaving` ref makes `useBlocker`'s `shouldBlockFn` and `enableBeforeUnload` return false. The editor removes the entry query, records a one-shot focus request (`shared/lib` `requestFocus(collectionFocusTarget(modelKey))`) and navigates to `/content/$modelKey`. `CollectionEntries` consumes that request once when it mounts and focuses its heading. A typed router history state was rejected because augmenting `HistoryState` needs `@tanstack/history`, which is not a direct admin dependency, and the request must not outlive the page (history state survives reloads). A toast announces "Deleted “title”".
- **Duplicate**: navigates to `/content/$modelKey/$copyId`. The existing blocker asks when the form is dirty.

All lifecycle actions are disabled while `save`, `publish` or another lifecycle mutation is pending. The menu reads a `busy` prop.

### D6. Create opens the entry

`CreateEntryDialog` seeds `adminQueryKeys.entry(created.id)`, invalidates list queries, closes, and navigates to `/content/$modelKey/$entryId`. Focus lands where the editor normally starts. The acceptance flows that clicked the new row now continue in the editor.

New and duplicated collection entries have no slug, so their first save exposed an existing editor defect: the registered slug input holds `""`, which the editor sent as `slug: ""` (rejected by the identifier contract), and which also left the form dirty after a reset because the baseline had no `slug` key. `draftValues` now uses `""` as the baseline slug of a collection entry, and the save and the copied local JSON omit an empty slug, which means "no slug" under complete-draft replacement.

### D7. `LACE_BUILD_SITE_URL` extends the build-site identity

- **Contract**: `buildSiteIdentitySchema` gains `url: v.optional(buildSiteUrlSchema)`. The schema accepts a string of at most 2048 characters that parses as an absolute `http:`/`https:` URL with no username, password, search or hash and that ends with `/`.
- **Parser**: `parseBuildSiteIdentity` reads `LACE_BUILD_SITE_URL`. It treats `undefined` and `""` as unset. It normalizes the value through `new URL(raw).href` and appends `/` when missing, but rejects a raw value containing `?` or `#` even when the parsed search or hash is empty. A URL with no ID and label is invalid. Errors list exactly the invalid variable names: `Invalid build site configuration: LACE_BUILD_SITE_URL.`, or all names that are invalid. The existing message for ID/label problems is unchanged.
- **Runtimes**: the Node runtime and the Worker settings pass the variable through their environment types. Startup parsing and `lace doctor` inherit validation.
- **Admin**: `EntryPublicationDetails` reads the existing `adminQueryKeys.buildSite` query (already used by build tracking). When `entry.published` exists and `site.url` is set, it renders `<a href={new URL(path.replace(/^\/+/u, ""), url)} target="_blank" rel="noopener noreferrer">`. The link shows the path and an external icon, and its accessible name is "Open {path} on site (opens in a new tab)". A pending or failed identity read falls back to text. An unpublished entry shows the path text with "Not public yet".
- **Templates**: Compose passes `LACE_BUILD_SITE_URL: ${LACE_BUILD_SITE_URL:-}` to the API in site modes only. `.env.example` documents an empty `LACE_BUILD_SITE_URL=` in starter and existing modes. `wrangler.jsonc` has a commented example. No-site mode stays free of build-site settings, as `project-generator` requires. The generated-project fixtures are refreshed. Template 0.22.0 is unreleased, so no version bump is needed.

Rejected alternatives:

- the admin origin, which is wrong on Cloudflare Pages and in local development;
- `LACE_PUBLIC_BASE_URL`, which is the CMS origin;
- deferring the link to CE4 (owner decision, 2026-10-11).

### D8. Testing

- **Vitest**: `entryActions` truth table; the client methods (paths, bodies, headers, response validation); each dialog (wording for page vs. collection, typed title, cancel sends nothing, error keeps the dialog open, idempotency-key reuse on retry); the menus' permission and state combinations; `EntryPage` save-and-publish (validation stop, save failure stop, ordering), unpublish keeping dirty values, revert, and delete bypassing the blocker; the create and duplicate navigation; the site link; `parseBuildSiteIdentity` URL cases.
- **Playwright** (mocked API, `apps/admin/e2e/entry-actions.e2e.ts`): each action for admin, editor and viewer; the typed-title delete; save-and-publish with a validation error; row menu keyboard operation; the site link.
- **Accessibility**: `accessibility.e2e.ts` audits the open entry actions menu and the unpublish, revert and published-delete dialogs.
- **Acceptance scripts**: updated for create-opens-editor. They need live environments and are not run in this session.

## Risks / Trade-offs

- [Save and publish creates a saved revision even when publish then fails] → The editor shows the saved state and offers Retry publish with the same key. This is the documented behavior.
- [Duplicate with unsaved changes copies the last saved draft] → The success toast names the copy, and the discard-changes prompt makes the choice explicit. The spec records that unsaved changes are not copied.
- [Focus restoration from menus to dialogs is easy to break] → Explicit trigger refs, plus unit and Playwright assertions on focus after cancel.
- [Typed title with very long or unusual titles] → An exact comparison of the saved title, a visible label quoting it, and paste allowed.
- [A misconfigured site URL produces wrong links] → Startup validation guards only the shape. The link is explicit operator configuration, and docs say it is not verified.
- [Generated fixture hashes change] → Refresh fixtures in the same change, as for CE1C.

## Migration Plan

Deploy normally. `LACE_BUILD_SITE_URL` is optional. Existing deployments keep the text path until an operator sets it. No data migration, and the rollback is a plain redeploy.

## Open Questions

None.
