# admin-draft-editor-publication Specification

## Purpose
Defines publication and lifecycle actions in the admin draft editor: concurrency, conflict recovery, publish, unpublish, revert, delete, duplicate and their confirmations.

## Requirements

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

### Requirement: Revision-conflict recovery preserves local authoring
When a complete-draft save or publish receives `CONTENT_REVISION_CONFLICT`, the
editor SHALL retain all current local form values and dirty state and SHALL
present an accessible conflict recovery state. That state SHALL offer explicit
actions to reload the current server draft or copy a stable JSON representation
of the local complete draft. Reloading SHALL replace local values only after
the user selects that action; copying SHALL not mutate the form. The editor
SHALL NOT automatically merge, reload, resubmit, or overwrite the local draft
after a revision conflict.

#### Scenario: A concurrent save conflicts
- **WHEN** a writer saves a changed draft and the API returns
  `CONTENT_REVISION_CONFLICT`
- **THEN** the writer's current title, slug, fields, and ordered blocks remain
  editable, and the editor offers reload-server-draft and copy-my-JSON actions

#### Scenario: Reload is explicitly chosen
- **WHEN** a writer selects reload-server-draft from a revision-conflict state
- **THEN** the editor fetches and adopts the validated current server draft,
  clears the conflict state, and does not issue another save or publish request

#### Scenario: Copy preserves the conflicted form
- **WHEN** a writer selects copy-my-JSON from a revision-conflict state
- **THEN** the editor copies the local complete-draft representation and leaves
  the same local values and conflict recovery state visible

### Requirement: Later draft edits remain separate from public output
After a successful publication, the editor SHALL adopt the returned entry as
its baseline and continue to treat later complete-draft edits as unpublished
local/draft changes. It SHALL present the current published snapshot separately
from the editable draft and SHALL not claim that a subsequent save changed the
published public output unless a later publication succeeds.

#### Scenario: A later save follows publication
- **WHEN** an admin publishes an entry and then saves a changed draft without
  publishing again
- **THEN** the editor shows the newer draft revision as unpublished changes and
  retains the prior published state/path as the current public output

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
Choosing Unpublish SHALL open a confirmation dialog that can be cancelled. It SHALL say that the entry's public path stops working after the next site build, that the draft and its unsaved changes are kept, and that publishing again makes the current draft public. For a page it SHALL say that the page's fixed path will return 404 after the next build. For a global the dialog SHALL ask to unpublish the site content and SHALL say that pages showing it fall back to their defaults after the next site build, without naming a path. For an entry of a route-less collection the dialog SHALL say that the entry disappears from the pages that list it after the next site build, without naming a path or saying that a path stops working. Confirming SHALL send one unpublish request with the publication the editor displays as the expected published snapshot and with a new idempotency key. A retry of the same attempt after a network failure SHALL reuse that key. On success the editor SHALL adopt the returned entry without discarding unsaved form changes, SHALL show the entry as not published, SHALL follow the queued build in the publication card as it does after a publication, and SHALL announce the result. When the publication changed or disappeared in the meantime, the dialog SHALL show the API's conflict or not-published error and SHALL offer to reload the entry.

#### Scenario: An admin unpublishes a collection entry
- **WHEN** an admin confirms Unpublish for a published collection entry
- **THEN** one unpublish request carries the displayed publication and an idempotency key, the publication card reads "Not published" and follows the queued build, and the draft revision is unchanged

#### Scenario: An admin unpublishes a page
- **WHEN** an admin opens Unpublish for a published page
- **THEN** the confirmation says that the page's fixed path will return 404 after the next build

#### Scenario: An admin unpublishes a global
- **WHEN** an admin opens Unpublish for the published `settings` global
- **THEN** the confirmation asks "Unpublish this site content?" and says that pages showing it fall back to their defaults after the next site build

#### Scenario: An admin cancels Unpublish
- **WHEN** an admin opens Unpublish and chooses Cancel
- **THEN** no request is sent and focus returns to the entry actions menu button

#### Scenario: Unpublish keeps unsaved changes
- **WHEN** an admin with unsaved changes in the form unpublishes the entry
- **THEN** the form keeps the unsaved values and the dirty state after the entry reads as not published

#### Scenario: The publication changed elsewhere
- **WHEN** an admin confirms Unpublish and the API reports a revision conflict
- **THEN** the dialog stays open with the error and a reload action, and the entry stays displayed as published

#### Scenario: An admin unpublishes a route-less entry
- **WHEN** an admin opens Unpublish for a published entry of the route-less
  `testimonials` collection
- **THEN** the confirmation says that the entry disappears from the pages that
  list it after the next site build and names no path

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

### Requirement: Destructive dialogs show link impact and require acknowledgment
Delete/unpublish dialogs in entry screens and collection rows SHALL load the
paginated impact view, expose all entities/locations through continuation,
distinguish published-visible links from drafts/hidden links, and explain the
post-build non-navigating fallback. Published-visible impact SHALL add an
unchecked explicit acknowledgment before the destructive submit is enabled.
Loading/failure SHALL NOT be presented as zero usages. Stale receipts SHALL
clear acknowledgment, reload impact and require review again; local editor
content SHALL remain recoverable. Existing focus return, permissions, target
revision errors and unpublish retry/idempotency behavior SHALL remain intact.

#### Scenario: Impact lookup fails
- **WHEN** the incoming usage request fails
- **THEN** the dialog displays retryable failure and does not permit an unreviewed destructive action

#### Scenario: Incoming set changes
- **WHEN** submission returns `CONTENT_LINK_IMPACT_CHANGED`
- **THEN** the dialog reloads impact and requires renewed acknowledgment without losing unsaved source edits

### Requirement: Publication of a route-less entry names no path
The publication card of an entry of a route-less collection SHALL show its
status, revisions, editor, times and build state like any entry, and SHALL
show no public path, not-yet-public path text or "Open on site" link. The
publish confirmation and result announcement SHALL name no path.

#### Scenario: A published testimonial
- **WHEN** an admin opens a published `testimonials` entry while a site URL is
  configured
- **THEN** the publication card shows the publication and build state and no
  path or "Open on site" link
