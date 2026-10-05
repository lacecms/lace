# admin-draft-editor Specification

## Purpose

Defines the first browser-admin draft editor so writers can safely edit model
fields from server-supplied metadata and save one complete optimistic draft.

## Requirements

### Requirement: Draft fields are rendered from validated model metadata
The authenticated entry route SHALL load the requested entry and its matching
configured model before presenting editable content. It SHALL render title, the
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
Every entry editor SHALL present title as an explicit required system field. A
collection editor SHALL additionally present slug as an explicit system field;
a page editor SHALL not render a slug control. A collection writer MAY opt into
slug suggestions derived from title. While suggestion is enabled and the slug
has not been manually changed, title edits SHALL update the suggested slug; a
manual slug edit SHALL stop automatic updates until the writer explicitly
re-enables suggestions.

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

### Requirement: Unsaved drafts are explicit and protected
The entry editor SHALL start clean from the loaded server draft, show a
distinct dirty state after an editable value differs from that draft, and SHALL
not implicitly save on typing, navigation, route reload, or unmount. Before an
in-application navigation or browser unload that would discard a dirty draft,
it SHALL require the writer to explicitly choose whether to leave. The
in-application choice SHALL be a modal alert dialog that traps focus, and
dismissing it SHALL count as choosing to stay. Choosing to stay SHALL retain the
current local values. Loading, local-validation, saving, saved, and
save-failure states SHALL be distinguishable without relying only on color.

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

### Requirement: A save replaces the complete local draft only after success
An explicit Save action SHALL submit title, any applicable slug, all current
model-field values, and the preserved ordered block list through one
complete-draft request carrying the loaded draft revision as its optimistic
precondition. The editor SHALL replace its local baseline and editable state
only with the validated entry representation returned after a successful save;
it SHALL then show the returned revision and clean state. A failed save SHALL
retain the writer's values and dirty state, present a non-sensitive failure
state, and associate server validation issues with their matching controls when
the response provides field paths.

#### Scenario: A complete draft saves successfully
- **WHEN** a writer explicitly saves valid changed title, slug, or model-field
  values with the current revision
- **THEN** exactly one complete-draft request is sent and the displayed draft
  is replaced with the validated server response and its advanced revision

#### Scenario: Server field validation rejects a submitted value
- **WHEN** the server rejects a complete-draft request with documented
  field-level validation issues
- **THEN** the editor preserves the submitted values and exposes the applicable
  field errors accessibly without treating the draft as saved

#### Scenario: Save is never automatic
- **WHEN** a writer edits one or more fields but does not invoke Save
- **THEN** the client sends no draft-save request and the server draft revision
  remains unchanged

#### Scenario: Server rejects block ordering
- **WHEN** Save returns `CONTENT_INVALID_STATE` for invalid block positions
- **THEN** the editor shows the safe server reason, the request ID when provided, and advice to retry Save or preserve recovery JSON before reloading, while retaining unsaved values, order, keys and dirty state

### Requirement: Draft blocks are authored as an ordered allowed aggregate
The authenticated entry editor SHALL expose only the configured model's allowed
registered block definitions whose portable metadata validates at the browser
boundary. A writer SHALL be able to add, insert, duplicate, remove, collapse,
and reorder blocks without mutating another block's data. The browser SHALL
assign a ULID-format stable key to every newly added, inserted, or duplicated
block, retain it through local reorders and saves, and ensure a duplicate
receives a distinct key. Keyboard and pointer reorder interactions SHALL update
one shared visible order. The editor SHALL treat the visible array as the authoritative local order.
Before each complete-draft save or recovery JSON copy it SHALL derive positive
positions in increments of 1,000 from that order without changing stable keys,
data, types, or schema versions. It SHALL replace its local list and baseline
only with the server-returned canonical positions after a successful save.

Each block SHALL render as a card whose header shows a reorder handle, an icon
for its type, its label (or a label derived from its type when none is
configured), and a one-line summary derived from its current data. The summary
SHALL use the block's first non-empty text value, otherwise the plain text of
its first non-empty rich-text value, otherwise a statement that media is
selected, otherwise a statement that the block is empty. It SHALL never show a
raw media identifier. Built-in block types SHALL have distinct icons, and any
other block type SHALL use a default icon. The header's label and summary SHALL
truncate rather than overlap its controls at any viewport width.

A card SHALL offer a collapse toggle that exposes its expanded state; a
collapsed card SHALL keep its header, including the summary, and hide only its
fields. A card whose data has a validation error SHALL stay expanded so the
error remains visible. Each card SHALL offer an actions menu with Move up, Move
down, Duplicate, and Remove; Move up SHALL be unavailable for the first block
and Move down for the last. The editor SHALL highlight exactly one active
block: the block that focus or a pointer last entered, or the block most
recently added, inserted, or duplicated. A newly added, inserted, or duplicated
block SHALL be expanded and receive focus.

Removing a block SHALL leave a notice at its former place that names the
removed block and offers Undo and Dismiss, and focus SHALL move to Undo. Undo
SHALL restore the removed block with the same key and data at the same position,
or at the end when fewer blocks remain. The notice SHALL disappear when the
writer dismisses it or performs another add, insert, duplicate, remove, move, or
reorder action, after which the removal is final.

The editor SHALL offer an insert control between every pair of adjacent blocks
and an Add block control after the list. Each SHALL open an Add block menu that
lists only the model's allowed blocks with their icon, label, and configured
description, offers a text filter over label, type, and description with a
distinct no-match state, and inserts the chosen block at the control's position
from the block definition's default data. When the model allows no blocks, the
editor SHALL state that and offer no Add block control. Every block action SHALL
be operable by keyboard, and reorder announcements for assistive technology
SHALL name the moved block by its label and position rather than by its key.

#### Scenario: A writer adds and duplicates an allowed block
- **WHEN** a writer chooses an allowed block type from the Add block menu and
  then duplicates that block
- **THEN** the editor renders two independently editable blocks of that type
  with distinct ULID-format keys, focuses and highlights the duplicate, and does
  not offer a block type outside the model's allowed definitions

#### Scenario: A writer reorders and collapses blocks
- **WHEN** a writer uses a keyboard or pointer reorder control or the Move up
  and Move down actions, and collapses a block while editing an entry with
  several blocks
- **THEN** the visible order and next complete-draft save reflect the reordered
  sequence while collapse changes only presentation and not the block data

#### Scenario: A save returns canonical block positions
- **WHEN** a writer saves an ordered locally edited block list and the server
  accepts the complete draft
- **THEN** the editor becomes clean only after replacing its block list with the
  returned snapshot, including the server's canonical positions

#### Scenario: A collapsed block stays recognizable
- **WHEN** a writer collapses a block whose data has a heading or text value
- **THEN** the card still shows the block's icon, label, and a summary with that
  value, and its toggle reports that it is collapsed

#### Scenario: A writer inserts a block between two blocks
- **WHEN** a writer opens the insert control between the first and second
  blocks, filters the menu by part of a block's description, and chooses that
  block
- **THEN** the new block appears second with the definition's default data, and
  the next complete-draft save contains the blocks in that order

#### Scenario: The Add block menu has no match
- **WHEN** a writer types a filter that matches no allowed block's label, type,
  or description
- **THEN** the menu states that no block matches and offers no block to insert

#### Scenario: A writer undoes a block removal
- **WHEN** a writer removes the second of three blocks and then chooses Undo
- **THEN** the block returns second with its original key and data, and the next
  complete-draft save contains all three blocks

#### Scenario: A later block action finalizes a removal
- **WHEN** a writer removes a block and then adds another block
- **THEN** the removal notice disappears and no Undo remains for the removed
  block

#### Scenario: A block with an error stays expanded
- **WHEN** the server rejects a field of a collapsed block
- **THEN** the block renders expanded and shows the error on its field

#### Scenario: Structural operations preserve saved and published order
- **WHEN** a writer performs pointer or keyboard reordering, middle insertion or duplication, removal, or removal followed by Undo, then saves, reloads, and publishes
- **THEN** the saved draft, published export, and Astro output retain the displayed sequence and the surviving blocks retain their stable keys and data

### Requirement: Rich text is edited only through the shared safe document subset
The editor SHALL provide rich-text controls for model rich-text fields and
rich-text block fields that create and edit the shared structured document
format. It SHALL enable only the shared allowed nodes, marks, heading levels,
and link URL forms, and SHALL not enable raw HTML input, HTML nodes, arbitrary
attributes, inline event handlers, styles, or unsafe link schemes. Every
document the editor produces, whether through the toolbar, a keyboard
shortcut, an input rule, or paste, SHALL pass the shared rich-text validation;
link marks SHALL carry only their URL and lists SHALL carry no attributes.
Invalid rich-text values SHALL expose an accessible local field error and SHALL
not cause a complete-draft request.

Each editable rich-text field SHALL show a fixed toolbar named after its field.
The toolbar SHALL offer the following controls:

- a text-style choice of Paragraph, Heading 1, Heading 2, and Heading 3;
- Bold, Italic, Strike, and Code toggles;
- Bulleted list, Numbered list, and Quote toggles;
- a Link control.

Each toggle SHALL expose whether its format is active at the current
selection, and the text-style choice SHALL show the current block's style. The
toolbar SHALL be a single tab stop whose controls are reached with the arrow,
Home, and End keys. Each control whose action has a keyboard shortcut SHALL
name it visibly on hover or focus and programmatically. The editor SHALL
support these shortcuts: undo and redo; the bold, italic, strike, and code
marks; the lists, quote, heading, and paragraph styles; `Shift+Enter` for a
line break; `⌘K`/`Ctrl+K` to open the link control; and `Alt+F10` to move focus
from the text to the toolbar. Escape SHALL return focus from the toolbar to the
text.

The Link control SHALL open a labelled URL input prefilled with the current
link's URL. It SHALL accept only URLs permitted by the shared allowlist; a
rejected URL SHALL leave the document unchanged and show an accessible error
that states the permitted forms. Applying a URL SHALL link the selection, or
the whole existing link when the cursor is inside one, or insert the URL as
linked text when nothing is selected. A Remove link action SHALL remove the
link. Closing the control SHALL return focus to the text without changing the
document.

An empty editable rich-text field SHALL show a placeholder that is also exposed
to assistive technology, and an empty heading SHALL show its heading level as
a placeholder. A read-only rich-text field SHALL show no toolbar and no
placeholder.

#### Scenario: A writer formats safe rich text
- **WHEN** a writer applies an allowed mark, heading, list, quote, hard break,
  or allowed link to rich text
- **THEN** the editor stores the corresponding structured document in the draft
  field without serializing raw HTML

#### Scenario: Unsafe rich text is prevented locally
- **WHEN** a rich-text value contains an unsupported structure or an unsafe link
  URL before Save
- **THEN** the affected control exposes an accessible validation error and the
  browser sends no draft-save request

#### Scenario: A link and a numbered list stay valid
- **WHEN** a writer links selected text to `https://example.com` and turns a
  paragraph into a numbered list
- **THEN** the stored document passes the shared rich-text validation, the link
  mark carries only its URL, and the next Save sends a complete-draft request

#### Scenario: An unsafe link is refused in the link control
- **WHEN** a writer enters `javascript:alert(1)` in the link control and applies
  it
- **THEN** the control shows an error naming the permitted URL forms, the
  document is unchanged, and the field shows no validation error

#### Scenario: The toolbar reflects the selection
- **WHEN** a writer places the cursor inside bold text in a Heading 2
- **THEN** the Bold toggle reports that it is pressed and the text-style
  control shows Heading 2

#### Scenario: A writer formats with the keyboard only
- **WHEN** a writer presses `Alt+F10` in the text, moves to Italic with the
  arrow keys, activates it, and presses Escape
- **THEN** italic is toggled at the selection and focus returns to the text

#### Scenario: A writer opens the link control with the keyboard
- **WHEN** a writer selects text and presses `⌘K` or `Ctrl+K`
- **THEN** the link control opens with focus in its URL input

#### Scenario: An empty field shows its placeholder
- **WHEN** an editable rich-text field has no text
- **THEN** it shows a placeholder that is exposed as the control's accessible
  placeholder, and a viewer sees neither the placeholder nor the toolbar

### Requirement: Generic block media fields use the existing media surface
Generic block fields SHALL render from their validated portable metadata. A model or block media field SHALL choose its stored media identifier through the shared media picker dialog, which browses active items across opaque cursor pages with the library's thumbnails, filename search, type filter, and sort, and SHALL let permitted writers upload within that dialog and choose a confirmed upload. The picker SHALL expose labelled loading, empty, no-match, upload-progress, validation-failure, and list-failure states without silently changing the draft; choosing an item SHALL change only that field's value and SHALL NOT save the draft. A field with a value SHALL show the selected item as a thumbnail read through the admin preview boundary together with its filename and offer Replace, which reopens the picker, and Remove, which clears the value. The field SHALL resolve its value through an authorized single-item media read rather than by searching loaded list pages, SHALL label the resolving state, and SHALL NOT infer that an item is missing merely because it is outside a loaded page. When the value is pending deletion, has failed deletion, no longer exists, or cannot be read, the field SHALL show a distinct accessible state for that condition, SHALL retain the identifier in the draft until the writer replaces or removes it, and SHALL offer retry when the read failed for another reason than absence. No media field state SHALL display the raw media identifier. The editor SHALL associate server validation issues at model-field, block-data, rich-text, or URL paths with the matching visible control while preserving the writer's complete local draft.

#### Scenario: A writer selects media for a block
- **WHEN** the media list loads and a writer opens the picker for a block media field and activates an active item's tile
- **THEN** the dialog closes, the block field shows that item's thumbnail and filename, and the next complete-draft save includes that media identifier

#### Scenario: A writer reuses media from a later page
- **WHEN** the desired active media item is beyond the first list page of the picker
- **THEN** the writer can request subsequent pages and choose it without leaving the editor or changing other draft values

#### Scenario: A writer searches the picker
- **WHEN** a writer types "hero" into the picker's search and selects the PNG filter
- **THEN** the picker requests media with that search and type, shows only the matching active items, and the editor route's URL does not change

#### Scenario: A writer uploads from the picker
- **WHEN** a permitted writer uploads a valid image from a field or block picker
- **THEN** the confirmed active item becomes choosable in that picker and its identifier enters the draft only when the writer chooses it

#### Scenario: Several files are uploaded from the picker with mixed results
- **WHEN** a writer uploads a valid PNG and a file the server rejects from a block picker
- **THEN** the PNG is reported as uploaded and can be chosen, the rejected file is reported with the server's error and a retry action, and the draft is unchanged until a choice is made

#### Scenario: A writer replaces and removes a selection
- **WHEN** a writer activates Replace on a selected field, chooses another item, and later activates Remove
- **THEN** the field first shows the newly chosen item and then shows that no media is selected, and neither action saves the draft

#### Scenario: A current selection no longer exists
- **WHEN** a saved media identifier's single-item read reports that the item was not found
- **THEN** the editor retains the identifier, states that the selected media no longer exists without showing the identifier, and allows explicit replacement or removal without silently mutating the draft

#### Scenario: A current selection is pending deletion
- **WHEN** a saved media identifier resolves to an item whose status is `deleting` or `delete_failed`
- **THEN** the field shows the item's filename with an accessible unavailable state for that status and offers Replace and Remove

#### Scenario: A current selection is inaccessible
- **WHEN** a saved media identifier's single-item read fails for a reason other than absence
- **THEN** the editor retains the identifier, presents an accessible could-not-load message with a retry action, and allows explicit replacement or removal

#### Scenario: Block validation fails on save
- **WHEN** the server rejects a block data field, rich-text value, or URL with a documented JSON Pointer issue
- **THEN** the editor preserves the local ordered block list and attaches an accessible error to the corresponding model or block field

### Requirement: The editor makes publication and draft concurrency explicit
The authenticated entry editor SHALL display, in plain language, the entry's
derived status (draft, published, or published with later changes), the live
revision and when it was published or that the entry is not published, the
current draft revision, the display name of the draft's last editor, and the
draft's update time. It SHALL also display the resolved canonical public path
when the model and draft make one available, and the latest build state known
to the editor. Times SHALL be shown relative to now with the absolute local time
available on demand. Publication details SHALL NOT display raw user or entry
identifiers or ISO timestamps. When no publish attempt was made in the editor,
the build state SHALL say that no build was requested from the editor, with a
link to the Builds screen. After a publish queued a build for a published
version, the editor SHALL follow persisted build history and describe the
build covering that version (target version greater than or equal to it) as
waiting to be recorded, pending, running, succeeded or failed, preferring a
succeeded, then active, then failed covering build, and SHALL stop refreshing
once the state is terminal. A failed state SHALL say the previous release stays
served and link to Builds. When build history cannot be loaded the editor SHALL
keep the dispatch result and the Builds link rather than guess. When the
current configured build site identity is known, the build state SHALL name its
label. The editor SHALL display the distinct result of the most recent publish
attempt, including that publication succeeded while its build is pending,
unavailable, rejected, or not dispatched; it SHALL not represent a dispatch
result or a recorded build outcome as confirmed availability in Astro dev, a
manual static deployment or a provider deployment.
Only an `admin` role SHALL be offered publication. Before an admin publishes,
the editor SHALL require explicit confirmation that names the draft revision
that will become live and can be cancelled. It SHALL then submit the current
draft revision with a non-empty idempotency key. The browser SHALL retain that
key while retrying the same pending/failed network publish attempt and SHALL
replace it only after the attempt reaches a terminal server response or the
user starts a new confirmed publish attempt.

#### Scenario: An admin reviews publication state
- **WHEN** an admin opens a loaded entry with a collection slug and a current
  published snapshot
- **THEN** the editor shows its derived status, the live and draft revisions,
  the last editor's display name with a relative time, the resolved canonical
  public path, and a build state that does not claim a pending build has
  succeeded, without showing a user ID or an ISO timestamp

#### Scenario: No build was requested from the editor
- **WHEN** a user opens an entry and has not published it from this editor
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

### Requirement: The editor layout keeps actions and entry details at hand
The entry editor SHALL place its save-state indicator, its single Save action, and, for administrators, its Publish action in the shell header beside the breadcrumbs, so they stay visible while the editor scrolls. The save-state indicator SHALL distinguish unsaved changes, saving, a failed save with local changes kept, the saved revision, and view-only access in text. Save SHALL be available through the platform save shortcut (`⌘S` on Apple platforms, `Ctrl+S` elsewhere), which the Save control SHALL advertise visibly and programmatically. While the editor is mounted, the shortcut SHALL NOT open the browser's page-save behavior. The shortcut SHALL submit exactly like the Save control and SHALL do nothing when the draft is clean, a save is in progress, or the user cannot save. The title SHALL be presented as a prominent input with an accessible "Title" label. At wide viewports the editor SHALL show the title and blocks in a main column and the publication details and entry fields (collection slug and model fields) in a right-hand column. At narrow viewports that column SHALL follow the blocks in reading and keyboard order.

#### Scenario: A writer saves with the keyboard
- **WHEN** a writer changes the title and presses `Ctrl+S` (or `⌘S` on an Apple platform)
- **THEN** exactly one complete-draft request is sent, the browser does not open its save-page dialog, and the indicator changes from unsaved changes to saving to the saved revision

#### Scenario: The shortcut is pressed on a clean draft
- **WHEN** a writer presses the save shortcut without having changed the loaded draft
- **THEN** no draft-save request is sent and the browser's page-save behavior is still suppressed

#### Scenario: Header actions stay visible
- **WHEN** a writer scrolls a long entry
- **THEN** the breadcrumbs, the save-state indicator, Save, and (for admins) Publish remain visible in the header

#### Scenario: Entry fields sit in the right-hand column
- **WHEN** a collection entry with model fields is opened at a wide viewport
- **THEN** the title and blocks appear in the main column and the publication details, slug, and model fields appear in the right-hand column

#### Scenario: The entry column stacks on a narrow screen
- **WHEN** a collection entry with model fields is opened at a 375px-wide viewport
- **THEN** the publication details and entry fields appear below the last block, keyboard focus reaches them after the block controls, and the page does not scroll horizontally

### Requirement: Viewers see the editor read-only
When the signed-in role is `viewer`, the entry editor SHALL present the draft without Save, the save shortcut, or Publish. It SHALL present its field, slug, title, rich-text, and block controls as non-editable, and the save-state indicator SHALL read that the entry is view only. Media fields SHALL show their selected item without Choose media, Replace, or Remove. The API SHALL remain the authorization boundary for any request made independently of the editor.

#### Scenario: A viewer opens an entry
- **WHEN** a viewer opens a loaded entry
- **THEN** the editor shows the entry's title, fields, blocks, and publication details, offers no Save or Publish action, and does not accept edits to its controls

#### Scenario: A viewer presses the save shortcut
- **WHEN** a viewer presses the save shortcut in the editor
- **THEN** no draft-save request is sent

### Requirement: Validation problems are shown where they occur and summarized
Every local or server validation problem SHALL be shown at its location. A
field problem SHALL be shown on its field. A block problem that belongs to no
single field SHALL be shown inside that block's card, together with a text
marker that the block has problems. Such problems include a disallowed or
unregistered type, a version that is not current, a missing, malformed, or
duplicate key, and data for an undefined field. A problem with the block list
as a whole SHALL be shown with the block list. An existing block whose type the
model no longer allows SHALL still render as a card with a default icon, its
type as label, and its problem, so the writer can remove it. Field messages
SHALL be complete sentences that state what is wrong or what to enter. They
SHALL NOT repeat validator-internal phrasing and SHALL NOT include the
rejected value.

When local validation blocks a Save, or the server rejects a save or publish
with validation issues, the editor SHALL show a validation summary above the
title and move focus to it. The summary SHALL state the number of problems. It
SHALL list each problem in the editor's reading order: the title, then each
block in order, then the slug, then the model fields. Each entry SHALL be a
link that names the field and, for a block field, the block's label and
position. Activating an entry SHALL move focus to that control, or to the
block card for a block problem, and scroll it into view. Because the list
follows reading order, the first block entry links to the first invalid
block. A server issue whose path does not match a visible location SHALL be
listed as text without a link. The summary SHALL replace the generic failure
message for validation rejections. It SHALL update as problems are resolved
and disappear when none remain.

The editor SHALL map server JSON Pointer issue paths as follows:

- `/title`, `/slug`, and `/fields/<key>` map to their controls.
- `/blocks/<index>/data/<key>` maps to that block's field.
- `/blocks/<index>/key`, `/type`, and `/schemaVersion`, as well as
  `/blocks/<index>` and `/blocks/<index>/data`, map to that block.
- `/blocks` maps to the block list.

A deeper pointer below a field, such as a path into a rich-text document,
SHALL map to that field. Mapping SHALL preserve the writer's complete local
draft and dirty state.

#### Scenario: Local validation blocks a save
- **WHEN** a writer saves a draft whose second block has a text field below its
  minimum length and whose model field has an unsafe URL
- **THEN** no draft-save request is sent, focus moves to a summary stating two
  problems, the first entry names the block's label, its position 2, and the
  field, and each field shows a complete-sentence message

#### Scenario: A summary link reaches the first invalid block
- **WHEN** a writer activates the summary entry for a field in a collapsed block
- **THEN** the block is expanded, the field's control receives focus, and it is
  scrolled into view

#### Scenario: Server issues map to the same locations
- **WHEN** the server rejects a save with issues at
  `/blocks/0/data/body/content/0` and `/fields/summary`
- **THEN** the first block's Body field and the Summary field show the
  rejection, the summary lists both with links, and the local values remain
  unchanged and dirty

#### Scenario: A server issue has no visible location
- **WHEN** the server rejects a save with an issue at a path the editor cannot
  map
- **THEN** the summary lists that issue's message as text without a link and
  no field is marked invalid

#### Scenario: A block of a disallowed type is loaded
- **WHEN** a writer opens an entry containing a block whose type the model no
  longer allows
- **THEN** the block renders as a card marked as having problems, states that
  its type is not allowed, and can be removed, after which Save is no longer
  blocked by it

#### Scenario: A publish is rejected with validation issues
- **WHEN** an admin publishes a draft and the server rejects it because a
  required model field is missing for publication
- **THEN** that field shows that it is required to publish and the summary
  links to it

#### Scenario: Fixing problems clears the summary
- **WHEN** a writer corrects every listed problem and saves again
- **THEN** the summary disappears and exactly one complete-draft request is
  sent
