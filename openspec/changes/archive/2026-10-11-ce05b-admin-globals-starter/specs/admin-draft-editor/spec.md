## MODIFIED Requirements

### Requirement: Draft fields are rendered from validated model metadata
The authenticated entry route SHALL load the requested entry and its matching
configured model before presenting editable content. It SHALL render the title
of a page or collection entry, the
collection-only slug, and every supported model-field descriptor from the
validated serializable metadata supplied by the model API. The field surface
SHALL cover text, textarea, rich text, number, boolean, date, datetime, select,
URL, and media descriptor types; it SHALL not execute callbacks or accept
unvalidated descriptor data from a response. Select fields SHALL choose from
the descriptor's options through a labelled listbox control, and an optional
select SHALL offer a choice that clears its value. Date fields SHALL be chosen
from a keyboard-operable calendar and SHALL display the chosen calendar date in
words. Datetime fields SHALL combine that calendar with a time input and SHALL
state that the time is in UTC; they SHALL store a UTC ISO timestamp. Optional
date and datetime values SHALL be clearable. Boolean fields SHALL be a labelled
switch that exposes its on or off state. URL fields SHALL offer to open an
entered `http` or `https` URL in a new browsing context. Editable values SHALL
be locally validated against the same client-safe descriptor constraints before
save, and each field error SHALL be programmatically associated with its
control, which SHALL also be marked invalid.

#### Scenario: A configured form is loaded
- **WHEN** an authenticated writer opens an entry whose model has text, number,
  boolean, select, date, datetime, URL, media, textarea, or rich-text fields
- **THEN** the draft values appear in controls generated from their descriptor
  metadata with accessible labels, descriptions where configured, and the
  descriptor-appropriate constraints

#### Scenario: A writer picks a select option and a date
- **WHEN** a writer opens a select field, chooses the "release" option, then opens a date field's calendar and chooses 25 September 2026
- **THEN** the select shows "release", the date control reads "Sep 25, 2026", and the next complete-draft save carries `release` and `2026-09-25`

#### Scenario: A writer sets a datetime
- **WHEN** a writer chooses 25 September 2026 and enters 14:30 in a datetime field
- **THEN** the next complete-draft save carries `2026-09-25T14:30:00.000Z` and the control states that the time is UTC

#### Scenario: A writer toggles a boolean
- **WHEN** a writer activates a boolean field's switch with the keyboard
- **THEN** the switch reports that it is on and the next complete-draft save carries `true`

#### Scenario: Client validation prevents an invalid save
- **WHEN** a writer submits a draft with a missing required value, an invalid
  select choice, a string or numeric value outside declared bounds, or another
  locally detectable descriptor violation
- **THEN** the affected control exposes an accessible error and the browser does
  not issue a draft-save request

#### Scenario: Model metadata is malformed or does not match the entry
- **WHEN** the entry route receives invalid model metadata, the model key does
  not exist, or the entry belongs to another model
- **THEN** it presents a safe error or not-found state and does not expose an
  editable form using unvalidated metadata

### Requirement: System fields have predictable collection-slug behavior
Every page and collection entry editor SHALL present title as an explicit
required system field. A global editor SHALL not render a title control,
because a global's title is its model label and is owned by the system. A
collection editor SHALL additionally present slug as an explicit system field;
a page or global editor SHALL not render a slug control. A collection writer
MAY opt into slug suggestions derived from title. While suggestion is enabled
and the slug has not been manually changed, title edits SHALL update the
suggested slug; a manual slug edit SHALL stop automatic updates until the
writer explicitly re-enables suggestions. An empty slug control SHALL mean
that the draft has no slug: a complete-draft save SHALL omit the slug, and a
collection entry without a slug SHALL read as having no unsaved changes once it
is loaded or saved.

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

#### Scenario: A global entry is edited
- **WHEN** a writer opens the `settings` global
- **THEN** the editor renders its model fields without a title or slug
  control, and a complete-draft save carries the stored title unchanged and no
  slug

#### Scenario: A collection entry without a slug is saved
- **WHEN** a writer changes the title of a new or duplicated collection entry
  that has no slug and saves
- **THEN** the complete-draft request carries no slug and the editor shows the
  saved revision without unsaved changes

### Requirement: Unpublish is confirmed with its public consequence
Choosing Unpublish SHALL open a confirmation dialog that can be cancelled. It SHALL say that the entry's public path stops working after the next site build, that the draft and its unsaved changes are kept, and that publishing again makes the current draft public. For a page it SHALL say that the page's fixed path will return 404 after the next build. For a global the dialog SHALL ask to unpublish the site content and SHALL say that pages showing it fall back to their defaults after the next site build, without naming a path. Confirming SHALL send one unpublish request with the publication the editor displays as the expected published snapshot and with a new idempotency key. A retry of the same attempt after a network failure SHALL reuse that key. On success the editor SHALL adopt the returned entry without discarding unsaved form changes, SHALL show the entry as not published, SHALL follow the queued build in the publication card as it does after a publication, and SHALL announce the result. When the publication changed or disappeared in the meantime, the dialog SHALL show the API's conflict or not-published error and SHALL offer to reload the entry.

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

## ADDED Requirements

### Requirement: The global editor presents site-wide content without a URL
The editor of a global SHALL be headed by the global's label and SHALL show
its description when configured. It SHALL show no public path, public URL
fact, "Open on site" link, title control or slug control, and its entry
actions menu SHALL offer only Revert to published and Unpublish under the same
conditions as for a page, never Duplicate or Delete. The publish confirmation
of a global SHALL ask to publish (or save and publish) the site content, SHALL
name the draft revision that becomes public or say that unsaved changes are
saved first, and SHALL state that the change affects every page that shows the
content after the next site build. Saving, publishing, the build-state
follow-up, revision-conflict recovery and the read-only viewer mode SHALL
behave as for any entry.

#### Scenario: An admin opens a published global
- **WHEN** an admin opens the published `settings` global labelled "Site
  settings" while the build site URL is configured
- **THEN** the editor is headed "Edit Site settings", its publication card
  shows status, revisions and build state but no public URL or "Open on site"
  link, and the actions menu offers no Duplicate or Delete

#### Scenario: An admin publishes a global
- **WHEN** an admin opens Publish for the `settings` global at draft revision 3
- **THEN** the confirmation asks "Publish this site content?", names draft
  revision 3, and says the change affects every page that shows it after the
  next site build

#### Scenario: An admin saves and publishes a global
- **WHEN** an admin with unsaved changes opens Save and publish for a global
- **THEN** the confirmation asks "Save and publish this site content?" and
  says the unsaved changes are saved first and then affect every page after
  the next site build

#### Scenario: A viewer opens a global
- **WHEN** a `viewer` opens the `settings` global
- **THEN** its fields are read-only and no save, publish or entry action is
  offered
