## ADDED Requirements

### Requirement: The editor offers entry lifecycle actions in one menu
The entry editor SHALL offer an "Entry actions" menu button in the shell header, after Save and Publish, when the signed-in user has `content:write` or `content:publish`. The menu SHALL be operable by keyboard and SHALL contain only the actions that the user's permissions and the entry's state allow; when they allow none, the menu SHALL say that no actions are available, so the button keeps its place and focus after an action:

- Duplicate: `content:write` and a collection entry.
- Revert to published: `content:write`, a published entry, and a saved draft whose revision differs from the published revision or a form with unsaved changes.
- Unpublish: `content:publish` and a published entry.
- Delete: `content:write`, a collection entry, and `content:publish` when the entry is published.

Page entries SHALL NOT offer Duplicate or Delete. A viewer SHALL see no menu. The menu SHALL be a convenience; the API SHALL remain the authorization boundary. Each action SHALL be unavailable while another lifecycle, save or publish request of the editor is pending. A failed action SHALL keep its dialog open with the error, SHALL keep the form values and dirty state, and SHALL NOT change the displayed entry. On success, focus SHALL return to the menu button unless the action navigates away.

#### Scenario: An admin opens the menu of a published collection entry
- **WHEN** an admin opens the entry actions menu of a published collection entry whose saved draft has later changes
- **THEN** the menu offers Duplicate, Revert to published, Unpublish and Delete

#### Scenario: An editor opens the menu of a published collection entry
- **WHEN** an editor opens the entry actions menu of a published collection entry without draft changes
- **THEN** the menu offers Duplicate only

#### Scenario: An editor opens the menu of a draft-only collection entry
- **WHEN** an editor opens the entry actions menu of a collection entry that was never published
- **THEN** the menu offers Duplicate and Delete

#### Scenario: An admin opens the menu of a published page
- **WHEN** an admin opens the entry actions menu of a published page whose draft matches its publication
- **THEN** the menu offers Unpublish only

#### Scenario: A viewer opens an entry
- **WHEN** a viewer opens any entry
- **THEN** the editor shows no entry actions menu

### Requirement: Unpublish is confirmed with its public consequence
Choosing Unpublish SHALL open a confirmation dialog that can be cancelled. It SHALL say that the entry's public path stops working after the next site build, that the draft and its unsaved changes are kept, and that publishing again makes the current draft public. For a page it SHALL say that the page's fixed path will return 404 after the next build. Confirming SHALL send one unpublish request with the publication the editor displays as the expected published snapshot and with a new idempotency key. A retry of the same attempt after a network failure SHALL reuse that key. On success the editor SHALL adopt the returned entry without discarding unsaved form changes, SHALL show the entry as not published, SHALL follow the queued build in the publication card as it does after a publication, and SHALL announce the result. When the publication changed or disappeared in the meantime, the dialog SHALL show the API's conflict or not-published error and SHALL offer to reload the entry.

#### Scenario: An admin unpublishes a collection entry
- **WHEN** an admin confirms Unpublish for a published collection entry
- **THEN** one unpublish request carries the displayed publication and an idempotency key, the publication card reads "Not published" and follows the queued build, and the draft revision is unchanged

#### Scenario: An admin unpublishes a page
- **WHEN** an admin opens Unpublish for a published page
- **THEN** the confirmation says that the page's fixed path will return 404 after the next build

#### Scenario: An admin cancels Unpublish
- **WHEN** an admin opens Unpublish and chooses Cancel
- **THEN** no request is sent and focus returns to the entry actions menu button

#### Scenario: Unpublish keeps unsaved changes
- **WHEN** an admin with unsaved changes in the form unpublishes the entry
- **THEN** the form keeps the unsaved values and the dirty state after the entry reads as not published

#### Scenario: The publication changed elsewhere
- **WHEN** an admin confirms Unpublish and the API reports a revision conflict
- **THEN** the dialog stays open with the error and a reload action, and the entry stays displayed as published

### Requirement: Revert to published is confirmed with what is lost
Choosing Revert to published SHALL open a confirmation dialog that can be cancelled. It SHALL say that the draft is replaced with the published version and SHALL list what is lost: the saved draft changes since the last publication when the saved draft differs from the publication, and the unsaved changes in the form when the form is dirty. When the saved draft differs from the publication, confirming SHALL send one revert request with the displayed draft revision as the expected revision, SHALL replace the form values with the returned draft, and SHALL show the entry as published. When only the form differs from a saved draft that matches the publication, confirming SHALL discard the unsaved changes locally without a request. A revision conflict SHALL keep the dialog open with the error and SHALL keep the local form values.

#### Scenario: A writer reverts saved draft changes
- **WHEN** a writer confirms Revert for a published entry whose saved draft revision is ahead of its publication
- **THEN** one revert request carries the displayed draft revision, the form shows the published title, slug, fields and blocks, the entry reads as published, and no publish or build request is sent

#### Scenario: A writer reverts unsaved changes only
- **WHEN** a writer has unsaved changes on a published entry whose saved draft matches its publication and confirms Revert
- **THEN** no request is sent and the form shows the saved draft without unsaved changes

#### Scenario: The confirmation lists both losses
- **WHEN** a writer with unsaved changes opens Revert for an entry whose saved draft is ahead of its publication
- **THEN** the confirmation names the saved draft changes since the last publication and the unsaved changes as lost

### Requirement: Deletion from the editor is confirmed in proportion to its effect
Choosing Delete SHALL open a confirmation dialog that names the entry by its saved title and says that deletion is permanent. For a published entry the dialog SHALL also say that the page disappears from the site after the next build and SHALL enable deletion only after the user types the saved title exactly. For a draft-only entry the dialog SHALL keep a single confirmation without typing. Confirming SHALL send one delete request with the displayed draft revision. On success the editor SHALL navigate to the collection list without the discard-changes prompt, the list SHALL no longer show the entry, focus SHALL move to the collection heading, and the deletion SHALL be announced. A failure SHALL keep the dialog open with the error.

#### Scenario: An admin deletes a published entry
- **WHEN** an admin opens Delete for the published entry "First post"
- **THEN** the delete action stays unavailable until "First post" is typed, and confirming deletes the entry and returns to the collection list with focus on its heading

#### Scenario: A writer deletes a draft-only entry with unsaved changes
- **WHEN** a writer with unsaved changes confirms Delete for an entry that was never published
- **THEN** the dialog asks for no typed title, the entry is deleted, and the list opens without a discard-changes prompt

#### Scenario: A mistyped title
- **WHEN** an admin types a title that differs from the saved title in the published-entry delete confirmation
- **THEN** the delete action stays unavailable and no request is sent

### Requirement: Duplicate opens the copy
Choosing Duplicate SHALL send one duplicate request with the displayed draft revision as the expected revision, without a confirmation dialog. The copy SHALL be made from the last saved draft. On success the editor SHALL announce the copy and navigate to it; when the form has unsaved changes, the existing discard-changes prompt SHALL apply to that navigation, and choosing to stay SHALL keep the form and leave the copy in the collection. A failure SHALL be shown in the editor without navigation.

#### Scenario: A writer duplicates a clean entry
- **WHEN** a writer chooses Duplicate on the saved entry "First post"
- **THEN** one duplicate request is sent and the editor opens "First post (copy)" without a slug

#### Scenario: A writer duplicates with unsaved changes
- **WHEN** a writer with unsaved changes chooses Duplicate
- **THEN** the copy is created from the last saved draft and the discard-changes prompt asks before the editor opens the copy

### Requirement: Publish saves unsaved changes first
When the draft form has unsaved changes, the admin's publish control SHALL read "Save and publish" and SHALL remain available. Its confirmation SHALL say that the unsaved changes are saved as a new draft revision that then becomes the public version. Confirming SHALL first validate the form. When validation fails, the dialog SHALL close, no save or publish request SHALL be sent, and the validation summary SHALL take focus. Otherwise the editor SHALL send one complete-draft save and, only after it succeeds, one publish request for the saved revision with a new idempotency key. When the save fails, no publish request SHALL be sent and the editor SHALL present the save failure exactly as for Save, including server validation issues and revision conflicts. When the publish request fails after the save succeeded, the editor SHALL keep the saved draft and SHALL offer the existing publish retry with the same idempotency key. While the save and publish run, both Save and the publish control SHALL be unavailable.

#### Scenario: An admin saves and publishes in one action
- **WHEN** an admin changes the title and confirms Save and publish
- **THEN** one draft save is sent, then one publish request for the new revision, and the entry reads as published at that revision with no unsaved changes

#### Scenario: Local validation blocks save and publish
- **WHEN** an admin clears a required field and confirms Save and publish
- **THEN** no save or publish request is sent and the validation summary takes focus

#### Scenario: The server rejects the save
- **WHEN** an admin confirms Save and publish and the save returns validation issues
- **THEN** no publish request is sent, the issues appear at their locations and in the summary, and the unsaved values remain

#### Scenario: Publishing fails after the save
- **WHEN** the save succeeds and the publish request cannot reach the server
- **THEN** the editor shows the saved revision without unsaved changes and Retry publish resends the same revision and idempotency key

### Requirement: A published entry links to its page on the site
When the entry is published, the model resolves a public path, and the deployment configures the build site's URL, the publication card SHALL present the path as an "Open on site" link to that path resolved against the site URL, opening in a new browsing context without referrer or opener access. Its accessible name SHALL include the path and SHALL say that it opens in a new tab. When the entry is not published, the path SHALL stay as text marked as not yet public. When no site URL is configured or the site identity cannot be read, the path SHALL stay as text.

#### Scenario: A published post with a configured site URL
- **WHEN** a user opens the published entry at `/posts/first-post` and the site URL is `https://example.com/blog/`
- **THEN** the publication card links "Open on site" to `https://example.com/blog/posts/first-post` in a new tab

#### Scenario: No site URL is configured
- **WHEN** a user opens a published entry and the build-site identity has no URL
- **THEN** the publication card shows the public path as text without a link

## MODIFIED Requirements

### Requirement: System fields have predictable collection-slug behavior
Every entry editor SHALL present title as an explicit required system field. A
collection editor SHALL additionally present slug as an explicit system field;
a page editor SHALL not render a slug control. A collection writer MAY opt into
slug suggestions derived from title. While suggestion is enabled and the slug
has not been manually changed, title edits SHALL update the suggested slug; a
manual slug edit SHALL stop automatic updates until the writer explicitly
re-enables suggestions. An empty slug control SHALL mean that the draft has no
slug: a complete-draft save SHALL omit the slug, and a collection entry without
a slug SHALL read as having no unsaved changes once it is loaded or saved.

#### Scenario: An opted-in suggestion follows a title
- **WHEN** a writer enables slug suggestions for an unedited collection slug
  and changes the title
- **THEN** the slug control receives the deterministic slug suggestion and the
  writer can save the suggested value as part of the complete draft

#### Scenario: A manual slug is preserved
- **WHEN** a writer manually changes a collection slug after enabling
  suggestions and subsequently changes the title
- **THEN** the manually entered slug remains unchanged and automatic suggestion
  stays disabled until the writer explicitly opts in again

#### Scenario: A page entry is edited
- **WHEN** a writer opens a page entry
- **THEN** the editor renders title and model fields but no slug control or slug
  suggestion affordance

#### Scenario: A collection entry without a slug is saved
- **WHEN** a writer changes the title of a new or duplicated collection entry
  that has no slug and saves
- **THEN** the complete-draft request carries no slug and the editor shows the
  saved revision without unsaved changes

### Requirement: Unsaved drafts are explicit and protected
The entry editor SHALL start clean from the loaded server draft, show a
distinct dirty state after an editable value differs from that draft, and SHALL
not implicitly save on typing, navigation, route reload, or unmount. Before an
in-application navigation or browser unload that would discard a dirty draft,
it SHALL require the writer to explicitly choose whether to leave. The
in-application choice SHALL be a modal alert dialog that traps focus, and
dismissing it SHALL count as choosing to stay. Choosing to stay SHALL retain the
current local values. The navigation to the collection list after a confirmed,
successful deletion of the entry SHALL NOT ask, because the draft no longer
exists. Loading, local-validation, saving, saved, and save-failure states SHALL
be distinguishable without relying only on color.

#### Scenario: A dirty writer navigates away
- **WHEN** a writer changes a field and then attempts to navigate away from the
  entry route
- **THEN** the application asks for explicit confirmation in a modal alert
  dialog before discarding the draft and retains the local values when the
  writer chooses to remain or dismisses the dialog

#### Scenario: A writer leaves a pristine editor
- **WHEN** a writer has not changed the loaded draft and navigates away
- **THEN** navigation proceeds without a discard confirmation and no save
  request is sent

#### Scenario: A dirty writer deletes the entry
- **WHEN** a writer with unsaved changes confirms deletion of the entry and the
  API confirms it
- **THEN** the collection list opens without a discard confirmation

### Requirement: The editor makes publication and draft concurrency explicit
The authenticated entry editor SHALL display, in plain language, the entry's
derived status (draft, published, or published with later changes), the live
revision and when it was published or that the entry is not published, the
current draft revision, the display name of the draft's last editor, and the
draft's update time. It SHALL also display the resolved canonical public path
when the model and draft make one available, and the latest build state known
to the editor. Times SHALL be shown relative to now with the absolute local time
available on demand. Publication details SHALL NOT display raw user or entry
identifiers or ISO timestamps. When no publish or unpublish attempt was made in
the editor, the build state SHALL say that no build was requested from the
editor, with a link to the Builds screen. After a publish or unpublish queued a
build for a published version, the editor SHALL follow persisted build history
and describe the build covering that version (target version greater than or
equal to it) as waiting to be recorded, pending, running, succeeded or failed,
preferring a succeeded, then active, then failed covering build, and SHALL stop
refreshing once the state is terminal. A failed state SHALL say the previous
release stays served and link to Builds. When build history cannot be loaded
the editor SHALL keep the dispatch result and the Builds link rather than
guess. When the current configured build site identity is known, the build
state SHALL name its label. The editor SHALL display the distinct result of the
most recent publish or unpublish attempt, including that it succeeded while its
build is pending, unavailable, rejected, or not dispatched; it SHALL not
represent a dispatch result or a recorded build outcome as confirmed
availability in Astro dev, a manual static deployment or a provider deployment.
Only an `admin` role SHALL be offered publication. Before an admin publishes,
the editor SHALL require explicit confirmation that names the draft revision
that will become live, or says that unsaved changes are saved first, and can be
cancelled. It SHALL then submit the current, or newly saved, draft revision
with a non-empty idempotency key. The browser SHALL retain that key while
retrying the same pending/failed network publish attempt and SHALL replace it
only after the attempt reaches a terminal server response or the user starts a
new confirmed publish attempt.

#### Scenario: An admin reviews publication state
- **WHEN** an admin opens a loaded entry with a collection slug and a current
  published snapshot
- **THEN** the editor shows its derived status, the live and draft revisions,
  the last editor's display name with a relative time, the resolved canonical
  public path, and a build state that does not claim a pending build has
  succeeded, without showing a user ID or an ISO timestamp

#### Scenario: No build was requested from the editor
- **WHEN** a user opens an entry and has not published or unpublished it from
  this editor
- **THEN** the build state says that no build was requested from the editor and
  links to the Builds screen

#### Scenario: A publication's build is followed
- **WHEN** an admin publishes and history later records a pending, then
  succeeded build whose target version covers the publication
- **THEN** the build state changes from pending to succeeded for that version,
  names the configured site label when known, and stops refreshing

#### Scenario: A covering build fails
- **WHEN** the covering build is recorded as failed
- **THEN** the build state says the previous release stays served and links to
  Builds without claiming the publication is visible on the site

#### Scenario: An editor cannot publish
- **WHEN** an `editor` opens a loaded entry
- **THEN** the editor does not offer a publish action, while the API remains the
  authorization boundary if a publication request is attempted independently

#### Scenario: An admin cancels publication
- **WHEN** an admin opens the publish confirmation and chooses Cancel
- **THEN** the dialog closes and no publication request is sent

#### Scenario: A confirmed publish is retried after a network failure
- **WHEN** an admin confirms publication and the browser cannot determine
  whether the request reached the server
- **THEN** a retry sends the same draft revision and idempotency key, and the UI
  uses the server's eventual one-publication result rather than creating a new
  attempt

### Requirement: The editor layout keeps actions and entry details at hand
The entry editor SHALL place its save-state indicator, its single Save action, for administrators its Publish (or Save and publish) action, and its entry actions menu when one is offered in the shell header beside the breadcrumbs, so they stay visible while the editor scrolls. The save-state indicator SHALL distinguish unsaved changes, saving, a failed save with local changes kept, the saved revision, and view-only access in text. Save SHALL be available through the platform save shortcut (`⌘S` on Apple platforms, `Ctrl+S` elsewhere), which the Save control SHALL advertise visibly and programmatically. While the editor is mounted, the shortcut SHALL NOT open the browser's page-save behavior. The shortcut SHALL submit exactly like the Save control and SHALL do nothing when the draft is clean, a save is in progress, or the user cannot save. The title SHALL be presented as a prominent input with an accessible "Title" label. At wide viewports the editor SHALL show the title and blocks in a main column and the publication details and entry fields (collection slug and model fields) in a right-hand column. At narrow viewports that column SHALL follow the blocks in reading and keyboard order.

#### Scenario: A writer saves with the keyboard
- **WHEN** a writer changes the title and presses `Ctrl+S` (or `⌘S` on an Apple platform)
- **THEN** exactly one complete-draft request is sent, the browser does not open its save-page dialog, and the indicator changes from unsaved changes to saving to the saved revision

#### Scenario: The shortcut is pressed on a clean draft
- **WHEN** a writer presses the save shortcut without having changed the loaded draft
- **THEN** no draft-save request is sent and the browser's page-save behavior is still suppressed

#### Scenario: Header actions stay visible
- **WHEN** a writer scrolls a long entry
- **THEN** the breadcrumbs, the save-state indicator, Save, (for admins) Publish, and the entry actions menu remain visible in the header

#### Scenario: Entry fields sit in the right-hand column
- **WHEN** a collection entry with model fields is opened at a wide viewport
- **THEN** the title and blocks appear in the main column and the publication details, slug, and model fields appear in the right-hand column

#### Scenario: The entry column stacks on a narrow screen
- **WHEN** a collection entry with model fields is opened at a 375px-wide viewport
- **THEN** the publication details and entry fields appear below the last block, keyboard focus reaches them after the block controls, and the page does not scroll horizontally

### Requirement: Viewers see the editor read-only
When the signed-in role is `viewer`, the entry editor SHALL present the draft without Save, the save shortcut, Publish, or the entry actions menu. It SHALL present its field, slug, title, rich-text, and block controls as non-editable, and the save-state indicator SHALL read that the entry is view only. Media fields SHALL show their selected item without Choose media, Replace, or Remove. The API SHALL remain the authorization boundary for any request made independently of the editor.

#### Scenario: A viewer opens an entry
- **WHEN** a viewer opens a loaded entry
- **THEN** the editor shows the entry's title, fields, blocks, and publication details, offers no Save, Publish, or entry actions, and does not accept edits to its controls

#### Scenario: A viewer presses the save shortcut
- **WHEN** a viewer presses the save shortcut in the editor
- **THEN** no draft-save request is sent
