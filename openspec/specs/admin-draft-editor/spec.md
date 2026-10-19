# admin-draft-editor Specification

## Purpose

Defines the first browser-admin draft editor so writers can safely edit model
fields from server-supplied metadata and save one complete optimistic draft.

## Requirements

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
- **WHEN** a writer submits a draft with an invalid
  select choice, a string or numeric value outside declared bounds, or another
  locally detectable descriptor violation
- **THEN** the affected control exposes an accessible error and the browser does
  not issue a draft-save request

#### Scenario: Model metadata is malformed or does not match the entry
- **WHEN** the entry route receives invalid model metadata, the model key does
  not exist, or the entry belongs to another model
- **THEN** it presents a safe error or not-found state and does not expose an
  editable form using unvalidated metadata

#### Scenario: Incomplete draft remains savable
- **WHEN** a writer saves an otherwise valid draft with a missing required model or block field
- **THEN** the draft save is allowed, while publication still applies the existing required-field rules and hidden-block exception

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
link marks SHALL carry href plus only optional target "_blank" and rel "nofollow", with unchecked options omitted rather than serialized as null; lists, code blocks and horizontal rules SHALL carry no attributes. Code blocks SHALL contain only unmarked text and preserve spaces, tabs and line breaks, including empty code blocks. H1–H4 SHALL remain available without rewriting existing headings. All rich-text leaves inside groups, lists and block data SHALL use this same feature set without per-field restrictions.
Invalid rich-text values SHALL expose an accessible local field error and SHALL
not cause a complete-draft request.

Each editable rich-text field SHALL show a fixed toolbar named after its field.
The toolbar SHALL offer the following controls:

- a text-style choice of Paragraph, Heading 1, Heading 2, Heading 3, and Heading 4;
- Bold, Italic, Strike, and Code toggles;
- Bulleted list, Numbered list, and Quote toggles;
- a plain Code block toggle and an Insert horizontal rule action;
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
link's URL and independent Open in a new tab and nofollow switches, prefilled from the existing link and unchecked for a new link. Applying SHALL store target "_blank" only when new-tab is checked and rel "nofollow" only when nofollow is checked; renderer-derived noopener/noreferrer SHALL NOT be stored. Editing SHALL allow either option to be cleared independently. Selection SHALL remain attached to the original text while the popover controls have focus. It SHALL accept only URLs permitted by the shared allowlist; a
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
  mark carries its URL without unchecked optional attributes, and the next Save sends a complete-draft request

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

#### Scenario: Expanded features remain editable
- **WHEN** a writer opens an existing document containing H1–H4, a horizontal rule, an empty or multiline code block and links with any of the four new-tab/nofollow combinations
- **THEN** opening preserves every feature without dirtying the draft, and the writer can create, change and remove those features through the fixed toolbar

#### Scenario: Link choices are independent
- **WHEN** a writer applies each combination of new-tab and nofollow, reopens the link and clears either switch
- **THEN** the link retains exactly the selected supported attributes after save/reload and no null or renderer-derived attributes are stored

#### Scenario: Link controls preserve the selected text
- **WHEN** a writer selects text, opens Link, focuses its URL and switch controls, then applies or removes a link
- **THEN** only the original selection or whole current link is updated and focus returns to the editor

#### Scenario: Ordinary paste remains safe
- **WHEN** a writer pastes ordinary HTML containing supported formatting alongside unsafe URLs or unsupported styles and attributes
- **THEN** accepted pasted content uses only the shared safe document format and an invalid resulting value cannot be saved

#### Scenario: Viewers inspect expanded documents
- **WHEN** a viewer opens a document containing the expanded features and selects text or uses a formatting shortcut
- **THEN** all content remains inspectable without mutation, fixed toolbar, bubble menu or editing popover

### Requirement: Generic block media fields use the existing media surface
Generic block fields SHALL render from their validated portable metadata. A model or block media field SHALL choose its stored media identifier through the shared media picker dialog, which browses active items across opaque cursor pages with the library's thumbnails, filename search, type filter, and sort, and SHALL let permitted writers upload within that dialog and choose a confirmed upload. The picker SHALL expose labelled loading, empty, no-match, upload-progress, validation-failure, and list-failure states without silently changing the draft; choosing an item SHALL change only that field's value and SHALL NOT save the draft. A field with a value SHALL show the selected item as one compact row without its own frame: a thumbnail read through the admin preview boundary, its filename with type and dimensions, a Replace action, which reopens the picker, and an actions menu whose Remove item clears the value. Replace and the menu SHALL keep accessible names that include the field label. The field SHALL resolve its value through an authorized single-item media read rather than by searching loaded list pages, SHALL label the resolving state, and SHALL NOT infer that an item is missing merely because it is outside a loaded page. When the value is pending deletion, has failed deletion, no longer exists, or cannot be read, the field SHALL show a distinct accessible state for that condition, SHALL retain the identifier in the draft until the writer replaces or removes it, and SHALL offer retry when the read failed for another reason than absence. No media field state SHALL display the raw media identifier. View-only editors SHALL see the row without Replace or the actions menu. The editor SHALL associate server validation issues at model-field, block-data, rich-text, or URL paths with the matching visible control while preserving the writer's complete local draft.

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
- **WHEN** a writer activates Replace on a selected field, chooses another item, and later chooses Remove from the field's actions menu
- **THEN** the field first shows the newly chosen item and then shows that no media is selected, focus moves to Choose media, and neither action saves the draft

#### Scenario: The selected media is one compact row
- **WHEN** an `image` block holds an active JPEG
- **THEN** the media field shows one row with the thumbnail, filename, "JPEG" with its dimensions, the alt text line, Replace and an actions menu, and no nested card frame

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
When the signed-in role is `viewer`, the entry editor SHALL present the draft without Save, the save shortcut, Publish, or the entry actions menu. It SHALL present its field, slug, title, rich-text, and block controls as non-editable, and the save-state indicator SHALL read that the entry is view only. Media fields SHALL show their selected item without Choose media, Replace, or Remove. A block card SHALL show its content fields followed by a read-only *Settings* section with the anchor, whether the block is hidden, the declared settings and the CSS classes, without tabs, Copy link, or Hide block and Show block. A hidden block SHALL still show its Hidden badge. The API SHALL remain the authorization boundary for any request made independently of the editor.

#### Scenario: A viewer opens an entry
- **WHEN** a viewer opens a loaded entry
- **THEN** the editor shows the entry's title, fields, blocks, and publication details, offers no Save, Publish, or entry actions, and does not accept edits to its controls

#### Scenario: A viewer presses the save shortcut
- **WHEN** a viewer presses the save shortcut in the editor
- **THEN** no draft-save request is sent

#### Scenario: A viewer reads a block's settings
- **WHEN** a viewer opens an entry with a hidden block that has anchor
  `pricing`
- **THEN** the card shows the Hidden badge and a read-only Settings section
  with the anchor `pricing`, and offers no tabs, Copy link, or Show block

### Requirement: Validation problems are shown where they occur and summarized
Every local or server validation problem SHALL be shown at its location. A
field problem SHALL be shown on its field. A block problem that belongs to no
single field SHALL be shown inside that block's card, together with a text
marker that the block has problems. Such problems include a disallowed or
unregistered type, a version that is not current, a missing, malformed, or
duplicate key, data for an undefined field, a setting the definition does not
declare, and an invalid hidden flag or settings object. A problem with the
block's anchor, class name or a declared setting SHALL be shown on that
control in the Settings tab. A problem with the block list as a whole SHALL be
shown with the block list. An existing block whose type the model no longer
allows SHALL still render as a card with a default icon, its type as label,
and its problem, so the writer can remove it. Field messages SHALL be complete
sentences that state what is wrong or what to enter. They SHALL NOT repeat
validator-internal phrasing and SHALL NOT include the rejected value.

When local validation blocks a Save, or the server rejects a save or publish
with validation issues, the editor SHALL show a validation summary above the
title and move focus to it. The summary SHALL state the number of problems to
fix. It SHALL list each problem in the editor's reading order: the title, then
each block in order (its block-level problems, its content fields, then its
anchor, declared settings and CSS classes), then the slug, then the model
fields. Each entry SHALL be a link that names the field and, for a block
field or setting, the block's label and position, and for a hidden block that
the block is hidden. Activating an entry SHALL move focus to that control, or
to the block card for a block problem, and scroll it into view; for a control
in a Settings tab it SHALL first select that tab. Because the list follows
reading order, the first block entry links to the first invalid block. A
server issue whose path does not match a visible location SHALL be listed as
text without a link. The summary SHALL replace the generic failure message for
validation rejections. It SHALL update as problems are resolved and disappear
when none remain.

A problem that only publication reports (a field required for publication or a list below minItems)
and that belongs to a block that is hidden SHALL be listed after the other
problems as not blocking publication, SHALL NOT be counted among the problems
to fix, and SHALL be shown on its control with the same note. When only such
problems remain, the summary SHALL state that the remaining problems are in
hidden blocks and do not block publishing. Every other problem in a hidden
block SHALL be counted and SHALL block Save as in a visible block.

The editor SHALL map server JSON Pointer issue paths as follows:

- `/title`, `/slug`, and `/fields/<key>` map to their controls.
- `/blocks/<index>/data/<key>` maps to that block's field.
- `/blocks/<index>/anchor` and `/blocks/<index>/className` map to that
  block's Anchor and CSS classes controls.
- `/blocks/<index>/settings/<key>` maps to that block's setting control when
  the definition declares `<key>`, and to the block otherwise.
- `/blocks/<index>/key`, `/type`, `/schemaVersion`, `/hidden`, and
  `/settings`, as well as `/blocks/<index>` and `/blocks/<index>/data`, map to
  that block.
- `/blocks` maps to the block list.

Pointers through composite fields SHALL traverse declared group keys and
in-range list indices to the exact leaf or container control. Unknown children
and out-of-range indices SHALL remain unlinked summary text. A deeper pointer
inside a scalar field or setting, such as a rich-text document, SHALL map to
that field or setting. Activation SHALL reveal every containing disclosure and
the block's appropriate tab before focus. Mapping SHALL preserve the writer's
complete local draft and dirty state.

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

#### Scenario: A summary link opens the Settings tab
- **WHEN** a writer activates the summary entry for a block's anchor while that
  block's Content tab is selected
- **THEN** the Settings tab is selected and the Anchor input receives focus

#### Scenario: Server issues map to the same locations
- **WHEN** the server rejects a save with issues at
  `/blocks/0/data/body/content/0`, `/blocks/1/anchor` and `/fields/summary`
- **THEN** the first block's Body field, the second block's Anchor input and
  the Summary field show the rejection, the summary lists all three with links,
  and the local values remain unchanged and dirty

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

#### Scenario: Hiding a block makes its publication problems non-blocking
- **WHEN** a publish is rejected because a required field of the second block
  is empty, and the writer then hides that block
- **THEN** the summary lists that problem as being in a hidden block that does
  not block publishing, no longer counts it, and Save and publish is not
  blocked by it

#### Scenario: A draft problem in a hidden block still blocks Save
- **WHEN** a writer saves a draft whose hidden block has a text field above its
  maximum length
- **THEN** no draft-save request is sent and the summary counts the problem and
  names the block as hidden

#### Scenario: Fixing problems clears the summary
- **WHEN** a writer corrects every listed problem and saves again
- **THEN** the summary disappears and exactly one complete-draft request is
  sent

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

### Requirement: Selected media shows its alt text
A model or block media field holding a resolved item SHALL show the item's alt
text next to its filename, truncated to one line with the full text available,
or state that the item has no alt text. The alt text SHALL reflect the latest
loaded item, so a metadata change saved in the media library is shown without
reloading the editor.

#### Scenario: A selected image with alt text
- **WHEN** a block media field holds an active item whose alt text is
  "Red bicycle"
- **THEN** the selected media card shows the filename and "Red bicycle"

#### Scenario: A selected image without alt text
- **WHEN** a media field holds an active item without alt text
- **THEN** the selected media card states that the item has no alt text

### Requirement: Block alt text inherits the media alt text
A block whose definition has exactly one media field and a text field keyed
`alt` SHALL treat that `alt` field as an override of the selected media item's
alt text. While the block's media field holds a resolved item with alt text,
the `alt` field SHALL show "Uses media alt: " followed by that text as its
placeholder and SHALL expose the same text as part of its accessible
description. When the media field holds a resolved item without alt text and
the block's `alt` field is empty, the editor SHALL show a warning associated
with the `alt` field that the image has no alt text and will be presented as
decorative, unless alt text is added to the block or the media item. The
warning SHALL NOT block saving or publishing and SHALL disappear as soon as
either alt text is present. While the media item is loading, unreadable, or not
selected, the field SHALL show neither the placeholder nor the warning. Blocks
without that shape, and view-only editors, SHALL NOT show the warning.

#### Scenario: The media alt is inherited
- **WHEN** a writer chooses an item with alt text "Red bicycle" for an `image`
  block whose alt field is empty
- **THEN** the alt field's placeholder reads "Uses media alt: Red bicycle" and
  no warning is shown

#### Scenario: Both alt texts are missing
- **WHEN** an `image` block's alt field is empty and its media item has no alt
  text
- **THEN** a missing-alt warning is shown for the alt field, and the draft can
  still be saved and published

#### Scenario: Typing block alt text clears the warning
- **WHEN** the missing-alt warning is shown and the writer types alt text into
  the block's alt field
- **THEN** the warning disappears and the block's alt text is saved with the
  draft

#### Scenario: Media alt saved elsewhere is picked up
- **WHEN** the missing-alt warning is shown and the media item's alt text is
  then saved in the media library during the same session
- **THEN** the warning disappears and the placeholder shows the new media alt
  text

#### Scenario: Other blocks are unaffected
- **WHEN** a `hero` block holds media without alt text
- **THEN** no missing-alt warning is shown for the hero block

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

### Requirement: The editor edits the SEO group of SEO-enabled entries
The editor of a page or collection entry whose model enables SEO SHALL show an
*SEO* card in the right-hand column after the *Fields* card. The card SHALL
hold, in this order, an "SEO title" input, an "SEO description" text area, an
"SEO image" media control using the existing media picker, a "Canonical URL"
input, a "Hide from search engines" switch and a search-result preview. The
editor of a model without SEO, including every global, SHALL show no SEO card.

The SEO values SHALL be part of the draft form: changing one SHALL mark the
draft unsaved, and loading, saving, publishing, discarding unsaved changes,
reverting to published and adopting a reloaded server draft SHALL reset them
to the loaded values. "Copy my JSON" SHALL include them. For an SEO-enabled
model, every draft save SHALL carry a complete `seo` object with `title`,
`description`, `image`, `canonical` and `noindex`, where blank or
whitespace-only text and a removed image are sent as `null` and `noindex` is a
boolean. A save of an entry whose model has no SEO SHALL carry no `seo` key.
Viewers SHALL see the SEO values and the preview read-only, with the SEO image
shown without picker actions.

#### Scenario: Edit and save SEO values
- **WHEN** an editor opens the post "Hello" of an SEO-enabled collection, types
  "Hello from Lace" as the SEO title, checks "Hide from search engines" and
  saves
- **THEN** the draft is marked unsaved before the save, and the save request
  carries `seo` `{title: "Hello from Lace", description: null, image: null,
  canonical: null, noindex: true}`

#### Scenario: Clearing a stored value
- **WHEN** an editor clears the stored SEO description "Old text" and saves
- **THEN** the save request carries `seo.description` `null` and the reloaded
  draft has no SEO description

#### Scenario: Choose an SEO image
- **WHEN** an editor chooses an image through the SEO image control and saves
- **THEN** the card shows the selected image with its filename and alt text,
  and the save request carries its media ID as `seo.image`

#### Scenario: Revert restores SEO values
- **WHEN** an editor changes the SEO title of a published entry and reverts to
  the published version
- **THEN** the SEO title input shows the published SEO title again and the
  draft is not marked unsaved

#### Scenario: Model without SEO
- **WHEN** an editor opens and saves an entry of a model without SEO
- **THEN** no SEO card is shown and the save request has no `seo` key

#### Scenario: A viewer opens an SEO-enabled entry
- **WHEN** a `viewer` opens an entry with a stored SEO title and image
- **THEN** the SEO card shows the title, the image without Choose media,
  Replace or Remove, and the preview, and none of its controls accept edits

### Requirement: SEO text shows its length against recommendations
The SEO title and SEO description SHALL each show a visible character count of
the trimmed text in code points against a recommended length of 60 for the
title and 160 for the description, as part of the control's accessible
description. When the count exceeds the recommended length, a warning
associated with the control SHALL say that search results may shorten the
text. The warning SHALL NOT block saving or publishing and SHALL disappear
when the count is back within the recommendation. Neither the count nor the
warning SHALL be announced on every keystroke.

#### Scenario: Title within the recommendation
- **WHEN** an editor types a 45-character SEO title
- **THEN** the title shows "45 / 60" and no length warning

#### Scenario: Long description warns without blocking
- **WHEN** an editor types a 180-character SEO description and saves
- **THEN** the description shows "180 / 160" with a warning that search results
  may shorten it, and the save request is sent

#### Scenario: Shortening removes the warning
- **WHEN** an editor shortens a 70-character SEO title to 58 characters
- **THEN** the length warning disappears

### Requirement: SEO validation problems are shown on the SEO controls
The editor SHALL validate SEO values locally before saving, with the same
rules as the API: SEO title at most 200 and SEO description at most 500 code
points after trimming, both single-line plain text, and a non-blank canonical
URL that is an absolute `http` or `https` URL without credentials or fragment
of at most 2,048 characters. A violation SHALL block the save and SHALL be
shown on its control as a sentence that does not repeat the value. Server
issues whose paths are `/seo/title`, `/seo/description`, `/seo/image`,
`/seo/canonical` or `/seo/noindex` SHALL be shown on the matching control.
SEO problems SHALL appear in the validation summary after the model fields,
in card order, and activating one SHALL move focus to its control. A server
issue at `/seo` itself SHALL be listed in the summary as text.

#### Scenario: Relative canonical URL
- **WHEN** an editor enters `/posts/hello` as the canonical URL and saves
- **THEN** no save request is sent, the canonical URL control says to enter an
  absolute URL starting with `https://` or `http://`, and the summary links
  "Canonical URL" to it

#### Scenario: Line break in the description
- **WHEN** an editor enters a description containing a line break and saves
- **THEN** no save request is sent and the description control says to use a
  single line

#### Scenario: Server rejects the SEO image
- **WHEN** a save is rejected with an issue at `/seo/image`
- **THEN** the SEO image control shows the problem and the summary links
  "SEO image" to it

#### Scenario: SEO no longer enabled on the server
- **WHEN** a save is rejected with `seo_not_allowed` at `/seo`
- **THEN** the summary lists the problem as text without a link

### Requirement: Inherited SEO values are shown as placeholders
While an SEO value is empty, its control SHALL show what the site will use
instead, following the fallback chain of ADR 0011, and SHALL expose the same
text as part of its accessible description:
- SEO title: "Uses entry title: " followed by the current entry title formatted
  with the site title template, or "Uses entry title" while the entry title is
  empty.
- SEO description: "Uses {field label}: " followed by the text of the model's
  mapped description field when it has text, otherwise "Uses site
  description: " followed by the site default description when it has text;
  otherwise no placeholder.
- SEO image: a line "Uses the image from {field label}" when the model's
  mapped image field holds media, otherwise "Uses the site image" when the
  site default image is set, otherwise "No image is shared".
- Canonical URL: "Uses this page's URL: " followed by the page's absolute URL
  when the build site URL is configured and the entry has a path, otherwise
  "Uses this page's URL".

Inherited values SHALL reflect unsaved form values of the entry, and SHALL
read site defaults from the published entry of the global that declares
`seoDefaults`. When no global declares `seoDefaults`, it is not published, or
it cannot be read, the editor SHALL behave as if there were no site defaults
and SHALL NOT block editing. A stored SEO value SHALL replace its placeholder.

#### Scenario: Title from the entry title and template
- **WHEN** the published defaults global has site name "Lace" and no title
  template, and an editor opens the post "Hello" with no SEO title
- **THEN** the SEO title placeholder reads "Uses entry title: Hello | Lace"

#### Scenario: Description from the mapped field
- **WHEN** the model maps its description to the field "Excerpt" holding
  "A short intro" and the SEO description is empty
- **THEN** the SEO description placeholder reads "Uses Excerpt: A short intro"

#### Scenario: Description from the site default
- **WHEN** the mapped description field is empty and the published site
  default description is "Notes on Lace"
- **THEN** the SEO description placeholder reads "Uses site description:
  Notes on Lace"

#### Scenario: Unsaved edits update the placeholder
- **WHEN** an editor types "New intro" into the mapped Excerpt field without
  saving
- **THEN** the SEO description placeholder reads "Uses Excerpt: New intro"

#### Scenario: Defaults global not published
- **WHEN** the global declaring `seoDefaults` has only a draft and the post
  "Hello" has no SEO title
- **THEN** the SEO title placeholder reads "Uses entry title: Hello"

### Requirement: The SEO card previews the search result
The SEO card SHALL show a search-result preview labelled as such, computed from
the current form values and the published site defaults with the same rules
as the site's SEO resolver: the title is the SEO title, otherwise the entry
title formatted with the title template (a template applies only when it
contains `%s`; otherwise `{title} | {site name}`, or the bare title without a
site name); the URL is the canonical URL, otherwise the build site URL plus
the entry's path, otherwise the path alone, and is omitted for a collection
entry without a slug; the description is the first text of the SEO
description, the mapped field and the site default, otherwise a note that
search engines choose their own snippet. When "Hide from search engines" is
checked, the preview SHALL say that the page is hidden from search results.
The preview SHALL NOT be a live region.

#### Scenario: Preview with a custom template
- **WHEN** the site title template is "%s — Lace Notes", the site URL is
  `https://example.com/` and the post "Hello" at `/posts/hello` has no SEO
  title or canonical URL
- **THEN** the preview shows the title "Hello — Lace Notes" and the URL
  `https://example.com/posts/hello`

#### Scenario: Preview follows typing
- **WHEN** an editor types "Custom title" into the SEO title
- **THEN** the preview title reads "Custom title"

#### Scenario: Hidden entry
- **WHEN** an editor checks "Hide from search engines"
- **THEN** the preview says the page is hidden from search results

### Requirement: The site defaults global names the defaults it provides
In the editor of the global that declares `seoDefaults`, each mapped field
SHALL show, to writers and viewers and as part of its accessible description,
which site default it provides: the site name used in search and social
titles, the title template (with `%s` standing for the entry title), the
default description, or the default sharing image. Other fields and other
globals SHALL show no such text.

#### Scenario: Settings global with site defaults
- **WHEN** an admin opens the `settings` global whose `seoDefaults` map
  `siteName` and `tagline` as site name and description
- **THEN** the "Site name" field says it is the site name used in search and
  social titles, and the "Tagline" field says it is the default description
  for search and social previews

#### Scenario: Viewer sees the defaults text
- **WHEN** a `viewer` opens the same global
- **THEN** both fields show the same site-default text while read-only

### Requirement: Block cards separate content and settings
For writers, an expanded block card SHALL present a *Content* tab with the
block's fields and a *Settings* tab with the block's envelope controls. The
Content tab SHALL be selected when a card first renders. Both panels SHALL stay
mounted while hidden, so switching tabs or collapsing the card never resets
rich-text, media or field state. The tabs SHALL follow the tabs keyboard
pattern: the tab list is one tab stop, Left and Right arrows move between and
select the tabs, and Home and End select the first and last tab. The selected
tab SHALL be kept per block across reorders and saves while the editor is
mounted. A tab whose panel contains a control with a validation problem SHALL
show a problem marker that is part of the tab's accessible name.

#### Scenario: A writer switches tabs with the keyboard
- **WHEN** a writer moves focus to a block's Content tab and presses the Right
  arrow
- **THEN** the Settings tab is selected and focused, its panel is shown, and
  the content fields keep their values

#### Scenario: A settings problem marks its tab
- **WHEN** a block's anchor has a validation problem while its Content tab is
  selected
- **THEN** the Settings tab's name states that it has problems

### Requirement: The Settings tab edits the block envelope
The Settings tab SHALL show, in this order: an *Anchor* input, a *Hide on
site* switch, one control for each setting the block definition declares, and
a *CSS classes* input. Each control SHALL change only that value of that block
and mark the draft unsaved.

The Anchor input SHALL show a `#` prefix outside the value and SHALL validate
as the writer types: an anchor SHALL start with a lowercase letter and use only
lowercase letters, digits and hyphens, up to 64 characters, and SHALL NOT equal
another block's anchor in the entry, hidden blocks included. The messages SHALL
be complete sentences that do not repeat the value. An empty Anchor input
means the block has no anchor. The input SHALL offer *Copy link* while the
anchor is valid and unique. Copy link SHALL copy the entry's site URL followed
by `#` and the anchor when the build site URL and the entry's public path are
known, and otherwise `#` and the anchor, and SHALL announce that the link was
copied or that copying failed.

The Hide on site switch SHALL state that a hidden block stays in the draft and
the publication but is not shown on the site. Declared settings SHALL use the
same controls, labels, descriptions and messages as fields of the same type.
The CSS classes input SHALL accept 1 to 16 class names separated by spaces, at
most 256 characters, using the shared class-name rule, and an empty input means
the block has no class name.

#### Scenario: A writer sets an anchor and copies its link
- **WHEN** a writer types `pricing` into a collection entry's block Anchor
  input while the build site URL is `https://example.com/` and the entry's path
  is `/posts/first`, and activates Copy link
- **THEN** `https://example.com/posts/first#pricing` is copied, the copy is
  announced, and the next save carries anchor `pricing` for that block

#### Scenario: An invalid anchor is reported as typed
- **WHEN** a writer types `Pricing Table` into the Anchor input
- **THEN** the input shows a sentence describing the anchor format, Copy link
  is not offered, and Save is blocked with the problem in the summary

#### Scenario: A repeated anchor is reported
- **WHEN** a writer types an anchor that a hidden block of the same entry
  already uses
- **THEN** the input states that another block in this entry uses this anchor
  and Save is blocked

#### Scenario: A writer edits a declared setting and classes
- **WHEN** a writer changes a declared `align` select setting to `center` and
  enters ` wide  md:w-1/2 ` as CSS classes, then saves
- **THEN** the save request carries settings with `align: "center"` and class
  name `wide md:w-1/2` for that block

#### Scenario: Clearing the anchor removes it
- **WHEN** a writer clears the Anchor input of a block with anchor `pricing`
  and saves
- **THEN** the save request carries that block without an anchor

### Requirement: Hidden blocks are visible as hidden in the editor
A hidden block's card SHALL be visibly muted without lowering text contrast
below the accessibility rules, and SHALL show a *Hidden* badge that is part of
the card's accessible name. The card menu SHALL offer *Hide block* for a
visible block and *Show block* for a hidden block; choosing it SHALL change
the block's hidden flag, mark the draft unsaved, and announce the change. The
card header SHALL show the block's anchor as `#anchor` beside the summary
whenever the block has an anchor, collapsed or expanded.

#### Scenario: A writer hides a block from the card menu
- **WHEN** a writer opens a visible block's menu and chooses Hide block
- **THEN** the card shows the Hidden badge, the Hide on site switch is on, the
  change is announced, and the next save carries `hidden: true` for that block

#### Scenario: A writer shows a hidden block
- **WHEN** a writer chooses Show block on a hidden block
- **THEN** the Hidden badge disappears and the next save carries
  `hidden: false` for that block

#### Scenario: A collapsed card shows its anchor
- **WHEN** a writer collapses a block with anchor `pricing`
- **THEN** the card header still shows `#pricing`

### Requirement: Block envelopes survive draft operations
The editor SHALL keep every block's anchor, class name, hidden flag and
settings through edits, reordering, collapse, tab changes, discard, conflict
reload and saves, and SHALL send the current values with every save, leaving
out a blank anchor, a blank class name and cleared setting values. A block
added in the editor SHALL start visible, without an anchor or class name, with
the default of every setting its definition declares. Duplicating a block
SHALL copy its class name, hidden flag and settings and SHALL leave out its
anchor, so the copy never repeats an anchor. Undoing a removal SHALL restore the
block with its envelope. A block whose type the model no longer allows SHALL
keep its envelope unchanged.

#### Scenario: Saving keeps envelopes set through the API
- **WHEN** an editor loads a draft whose block has anchor `pricing`,
  `hidden: true` and settings `{align: "center"}`, edits a field of that block
  and saves
- **THEN** the save request carries the same anchor, hidden flag and settings
  for the block

#### Scenario: A new block takes declared setting defaults
- **WHEN** an editor adds a block whose definition declares `align` with
  default `left`
- **THEN** the new block is visible with settings `{align: "left"}` and no
  anchor

#### Scenario: Duplicating a block drops its anchor
- **WHEN** an editor duplicates a block with anchor `pricing` and class name
  `wide`
- **THEN** the copy carries class name `wide` and no anchor, and the draft
  saves without an anchor conflict

#### Scenario: A loaded envelope is not an unsaved change
- **WHEN** an editor opens a draft whose blocks have no anchor and no class
  name, and switches a block to its Settings tab without editing
- **THEN** the draft is not marked unsaved

### Requirement: Composite fields support recursive generic authoring
The editor SHALL render groups as labelled fieldsets with descriptions and
nested controls and lists as labelled ordered repeatable items in every model
kind and block data. A group that is not a list item SHALL be a disclosure
whose toggle is a chevron icon button with an accessible name naming the
action and the group, consistent with block cards. A group used as a list
item SHALL render its fields directly inside the item's row, without its own
frame, legend or toggle. Every list and group label SHALL come from its
descriptor label or humanized key, never from per-block presentation code.
Scalar, media and rich-text leaves SHALL use the existing
controls and authorization rules. Group absence SHALL be distinguishable from
present `{}`, and list absence from present `[]`. Opening or collapsing a
field SHALL NOT materialize data, apply defaults or dirty the form. Writers
SHALL be able to create an absent group/list, clear a named field to absence,
and retain explicit empty objects/arrays. Defaults SHALL follow the shared
recursive contract. Clearing an item leaf SHALL NOT create a null/undefined
list slot: scalar items are removed through Remove. An incomplete group item
SHALL remain a valid draft starting point.

#### Scenario: Nested controls across content kinds
- **WHEN** a writer opens model or block fields containing a group with a nested list of groups and media/rich-text leaves
- **THEN** every value has a labelled editable control using the existing picker and safe rich-text toolbar

#### Scenario: Absence and explicit emptiness
- **WHEN** a writer creates an absent optional group, leaves it empty, creates an empty list and saves
- **THEN** the payload contains explicit {} and [], subject to declared child defaults, without synthesizing unrelated optional containers

#### Scenario: Clear a field with a default
- **WHEN** a writer clears a named nested field and saves
- **THEN** the field is omitted from the payload and the confirmed normalized response applies its declared default exactly as the shared validation contract requires

#### Scenario: Read-only inspection
- **WHEN** a viewer opens composite data
- **THEN** every nested value is inspectable and disclosures are operable, while editing, picker/upload, Add, Remove, Duplicate and reorder actions are unavailable

#### Scenario: Group disclosure uses a chevron
- **WHEN** a writer views a standalone optional group named "Contact"
- **THEN** its toggle is an icon-only chevron button named "Collapse Contact" while open and "Expand Contact" while closed, with no visible "Collapse" text

#### Scenario: A list item group has no nested frame
- **WHEN** a writer opens a gallery item
- **THEN** the item's media, alt, caption and link controls appear directly in the opened row, with no inner group legend or second toggle

### Requirement: List operations preserve item content and editing identity
Writers SHALL be able to Add, Remove, Duplicate, Move up/down and reorder by
pointer or keyboard drag within each list, including scalar lists. Add SHALL
use a detached declared item default, otherwise a draft-valid group with child
defaults or a draft-valid scalar starting value. When a scalar has no valid
empty starting value, Add SHALL request a value and commit only when valid;
cancel SHALL leave the list unchanged. Duplicate SHALL insert an independent
deep copy immediately after the source. Remove SHALL affect only its item.
Move boundary actions SHALL be disabled; cancelled drag SHALL preserve order.
Actions SHALL name the list, item and position accessibly and announce results.
Focus after insertion SHALL reach the new item, after removal the next item,
then the previous item, then Add for an empty list; move focus SHALL follow
the item. Nested lists SHALL reorder only within their own list.

A list SHALL render its items as rows in one bordered container separated by
dividers, without a separate frame per item. Each row SHALL show a drag
handle and an item actions menu. The menu SHALL contain Move up, Move down,
Duplicate and Remove, keeping those actions' accessible names, disabled
states and limit explanations. Moves through the menu SHALL keep focus on the
moved item's row. A scalar item row SHALL show its control inline between the
handle and the menu. A group item row SHALL be collapsible with a chevron
toggle. Group items SHALL start collapsed when the editor loads or reloads a
draft. An item created by Add or Duplicate SHALL start open and receive focus
on its first control. Revealing a validation problem SHALL open the item.
Each item's open state SHALL be independent of other items and SHALL follow
its editing identity. A collapsed row SHALL show its summary, item counts
where applicable and problem indicator. An open row's header SHALL name the
item with its one-based position and keep the handle, toggle and menu.

Summaries SHALL follow the collapsed-item summary and preview requirement,
SHALL collapse whitespace, truncate long text and never expose media IDs or
raw rich-text JSON. Accessible names SHALL include current one-based position
to disambiguate identical items. Moves and collapse SHALL preserve local
values, field errors, media state and rich-text editor state/selection where
applicable. UI item identity and open state SHALL be independent of values
and array positions, detached on Duplicate, and excluded from saves, copied
JSON, dirty comparison and public responses.

#### Scenario: Duplicate then edit nested content
- **WHEN** a writer duplicates a group with a nested link list and changes the duplicate's URL
- **THEN** the original stays unchanged, the duplicate follows it and saved JSON contains ordinary arrays/objects without UI IDs

#### Scenario: Equal scalar values have distinct editing identities
- **WHEN** a writer reorders two equal scalar items and then removes one
- **THEN** only the selected item's editing state is removed and the remaining item retains its state

#### Scenario: Move and collapse a rich-text item
- **WHEN** an item with edited rich text, media selection and a field error moves and is collapsed then reopened
- **THEN** those values, selection where applicable and error remain associated with that item

#### Scenario: Scalar insertion requires a value
- **WHEN** a number list has no item default and min 10, and a writer chooses Add
- **THEN** the editor requests a valid number before insertion, and cancellation leaves the array unchanged

#### Scenario: Nested keyboard reordering
- **WHEN** a keyboard user reorders a child-list item and cancels a second drag
- **THEN** only the child list changes, the second drag leaves its order intact, focus is visible and positions are announced without internal IDs

#### Scenario: Group items load collapsed
- **WHEN** a writer opens an entry whose gallery holds three items
- **THEN** all three items show as collapsed rows with summaries, and opening one leaves the others collapsed

#### Scenario: Actions live in the item menu
- **WHEN** a writer opens the actions menu of the first of three items
- **THEN** the menu offers Move up (disabled), Move down, Duplicate and Remove with accessible names that include the list label and position, and no Up, Down, Duplicate or Remove text buttons are shown on the row

#### Scenario: Added item opens with focus
- **WHEN** a writer activates Add on a list of collapsed group items
- **THEN** the new item is appended open, its first control receives focus and the existing items stay collapsed

#### Scenario: Open state is not content
- **WHEN** a writer opens and collapses items of a saved draft without editing values
- **THEN** the draft stays clean and saved or copied JSON contains no open-state data

### Requirement: Composite editing explains normalized list budgets
Each list SHALL show a header with its label, its count and effective maximum
in the form "<count> / <maximum>", an Add action and a list actions menu
containing Clear when clearing is offered. The list SHALL have no frame or
toggle of its own. The publication minimum SHALL be part of the list's
accessible description and SHALL be visible while the list has fewer items
than the minimum or a problem, and always in view-only mode; otherwise it SHALL
be visually hidden. Its visibility SHALL NOT depend on focus. The editor SHALL show entry-wide usage against 500 elements, counting
normalized defaults and all nested list lengths across model fields and block
data including hidden blocks. Growing actions, including Add, Duplicate and
container creation, SHALL preflight the prospective normalized snapshot and
be disabled with an accessible explanation when a list maximum or aggregate
budget would be exceeded. Block Add/Duplicate and nested default
materialization SHALL obey the same budget gate. Removal, collapse and moves
SHALL remain possible to recover. Required/minimum issues SHALL be labelled
as publication-only and SHALL NOT prevent saving otherwise-valid drafts;
maxima, wrong present values and payload-size failures SHALL block draft save.
The server SHALL remain authoritative for validation and authorization.

#### Scenario: Nested duplication exhausts the entry budget
- **WHEN** current usage is 490 and duplicating an item would add one outer item and ten inner items
- **THEN** Duplicate is unavailable with a limit explanation and the draft remains unchanged

#### Scenario: Exact budget and list boundaries
- **WHEN** a prospective edit results in exactly 500 total elements and no list exceeds its maximum, or results in 501 or a list above its maximum
- **THEN** the first is allowed and the latter actions are prevented, including contributions from hidden blocks and defaults

#### Scenario: Publication-only minimum
- **WHEN** an incomplete group or list below minItems is saved
- **THEN** Save succeeds if all present values are valid, and publication guidance distinguishes the missing required/minimum values from draft-blocking errors

#### Scenario: Header comes from the schema
- **WHEN** a gallery holds 3 of at most 50 images and a navigation submenu holds 1 of at most 20 links
- **THEN** the headers read "Images" with "3 / 50" and "Submenu links" with "1 / 20", each with its own Add and actions menu

#### Scenario: Minimum shown while unmet
- **WHEN** a gallery with a publication minimum of 1 is empty and later receives one item
- **THEN** the minimum guidance is visible while the list is empty and is visually hidden but still associated once the minimum is met

### Requirement: Recursive validation reaches exact visible controls
Local and server validation SHALL preserve exact group-key/list-index paths
and show errors at the matching scalar or container control. Rich-text-internal
paths SHALL target their enclosing rich-text field. Summary entries SHALL
follow existing editor reading order with nested descriptor order and list
position order, use readable labels/one-based positions and distinguish
publication-only problems. Activating a nested problem SHALL select the
relevant block tab, reveal the block and every containing disclosure, then
focus and scroll to the exact control; a container problem SHALL focus its
labelled container. Hidden-block required/minimum publication issues SHALL
remain non-blocking as in the accepted hidden-block contract. Unresolvable
paths SHALL remain summary text without a guessed leaf target. After structural
edits, local issues SHALL be recomputed and server issues for surviving items
SHALL follow their UI identity; removed-item issues SHALL disappear. Old
asynchronous responses SHALL NOT attach indexed issues to different items.

#### Scenario: Reveal a nested invalid URL
- **WHEN** the server reports /blocks/0/data/links/2/url and its block and item are collapsed
- **THEN** activating the summary opens Content, the block and all containing disclosures and focuses item 3's URL with its accessible error

#### Scenario: Container and unknown paths
- **WHEN** validation reports list_too_short at /fields/links and another issue under an unknown child
- **THEN** the list issue targets the list container and the unknown issue stays visible without a misleading focus link

#### Scenario: Errors follow surviving items
- **WHEN** an item with a server error moves from position 3 to position 1 and another item is removed
- **THEN** its error remains on that same item at position 1 and errors belonging to the removed item disappear

### Requirement: Composite authoring preserves draft lifecycle recovery
Initialization, scalar edits, save normalization, dirty comparison, discard,
reload, unsaved-navigation guards, save shortcuts, revert, block duplication
and entry lifecycle actions SHALL retain complete recursive values and order,
including {} and []. Local clear sentinels SHALL be removed only from named
fields and never used to filter or shift list indices. View-only disclosures
and summaries SHALL NOT create unsaved changes. A revision conflict or failed
save/publish SHALL preserve the complete local draft; Copy my JSON SHALL
contain content only with no transient item identities. Save success SHALL
use the returned normalized draft as baseline. Pending mutations SHALL prevent
structural edits or reconcile response paths to the exact submitted item
identities, so indexed server errors cannot refer to a changed array.

#### Scenario: Conflict after nested edits
- **WHEN** a writer edits and reorders nested data and Save receives a revision conflict
- **THEN** local content and order remain available, Copy my JSON includes every nested value and no UI IDs, and explicit reload adopts the server draft

#### Scenario: Save and discard remain predictable
- **WHEN** a writer saves nested edits, edits them again and discards
- **THEN** the confirmed normalized draft is restored, explicit empty containers survive and the form is clean

### Requirement: Selection formatting complements the fixed rich-text toolbar
An editable rich-text field SHALL offer a compact selection bubble menu for Bold, Italic, Strike, inline Code and Link when nonempty text is selected in the focused visible editor. Its toggles SHALL reflect the selection and operate on it without losing the selection when controls take focus. Code-block content SHALL NOT offer unsupported marks or links. Every action SHALL remain available through the fixed toolbar and keyboard; the bubble SHALL NOT steal focus on appearance. Its controls SHALL have accessible names, visible focus and keyboard operation, and Escape SHALL dismiss it and return focus to the text. It SHALL disappear for a collapsed selection, hidden editor, focus outside its editor/controls or read-only field. Opening Link SHALL preserve the selection until application or dismissal.

#### Scenario: Selected text can be formatted
- **WHEN** a writer selects ordinary text and activates Bold or Link in its bubble menu
- **THEN** the action applies to that selection, reports its active state where applicable, and the fixed toolbar remains available

#### Scenario: Bubble appearance does not interrupt typing
- **WHEN** a writer selects text using the keyboard and then collapses the selection or leaves the editor
- **THEN** the bubble appears without moving focus and disappears after selection collapse or focus departure

#### Scenario: Code blocks keep plain text
- **WHEN** a writer selects code-block text
- **THEN** controls cannot insert marks or links into that plain-text code block

### Requirement: Expanded rich text survives authoring and publication
Expanded rich-text content SHALL survive undo/redo, save/reload, list moves, group/list disclosures and block Content/Settings tabs while retaining existing editing identity and selection where applicable. Saving SHALL retain the complete document; a subsequent draft edit SHALL NOT change the published snapshot until publication. Published content SHALL render through the common Astro renderer with escaped code and exact whitespace, H4, horizontal rules and independent link options; new-tab links SHALL receive renderer-derived noopener noreferrer, merged with nofollow when requested. Existing H1–H3 and href-only documents SHALL remain editable without silent loss. Failed saves/publication or revision conflicts SHALL retain local expanded content under the existing recovery rules. Node and Cloudflare SHALL use the same document contract.

#### Scenario: Nested editor state survives movement
- **WHEN** a writer edits expanded rich text in a nested list item, moves it, closes and opens its disclosures and switches its block tabs
- **THEN** content, undo history and selection where applicable remain associated with that item and the saved/reloaded document preserves all features

#### Scenario: Published output matches the editor
- **WHEN** an admin publishes a document with H4, rules, code containing angle brackets and multiple lines and all four link option combinations, and Astro builds from the published export
- **THEN** output contains the matching safe elements, escaped code with exact whitespace and the corresponding target/rel attributes

#### Scenario: Draft changes remain isolated
- **WHEN** a writer changes expanded rich text after publication or receives a failed save or revision conflict
- **THEN** public content remains the last published snapshot and complete local edits remain available for recovery

### Requirement: Configured placeholders guide empty controls
Editable text, textarea, URL, number, select and rich-text controls SHALL show configured placeholders when empty at every supported model and block data/settings depth, including scalar list items. An explicit inherited SEO/media placeholder SHALL take precedence; inherited explanations and configured descriptions SHALL remain available. Omitted placeholders SHALL retain existing control fallback behavior; an empty configured string SHALL suppress a generic fallback. Rich-text placeholders SHALL be exposed through aria-placeholder and SHALL NOT appear for viewers. Placeholders SHALL NOT replace labels, become content, dirty the draft or change defaults. Metadata updates SHALL NOT reset rich-text history, selection or form values.

#### Scenario: Nested and scalar-item prompts
- **WHEN** a writer opens empty nested text, select and rich-text fields and scalar list items with configured placeholders
- **THEN** each appropriate control shows its configured prompt without creating values or unsaved changes

#### Scenario: Inherited guidance wins
- **WHEN** a field has a configured generic placeholder and an existing inherited media or SEO explanation
- **THEN** inherited guidance remains the effective prompt and its accessible explanation is preserved

#### Scenario: Rich-text metadata updates
- **WHEN** a configured rich-text placeholder changes while the draft has content and undo history
- **THEN** content, selection and undo history are retained without generating a content edit

### Requirement: Required and constraint guidance is consistent and accessible
Every applicable descriptor control SHALL show a visible required marker and explain required-for-publication semantics when required. Scalar labels and composite legends SHALL retain accessible names; controls SHALL expose required state through role-supported accessibility attributes or associated explanatory text without native required validation blocking draft saves. Guidance SHALL include configured descriptions and declared text length, numeric and list bounds with accurate draft/publication semantics. The required-for-publication explanation SHALL always be associated with its control and SHALL be available as the tooltip of the visible required marker; it SHALL be visible text only while the field has a problem and always in view-only mode, and otherwise SHALL be visually hidden. No guidance or counter SHALL appear, disappear or move on focus or blur, so focusing a control never shifts the layout under the pointer. List-maximum guidance SHALL always be associated and SHALL be visible as the list header's count and maximum. Configured descriptions, declared text-length and numeric guidance and errors SHALL remain visible. All associated description IDs SHALL resolve to existing elements, coexist with errors and inherited annotations, and remain readable in viewer mode. Guidance SHALL NOT materialize absent containers, change validation rules or introduce viewer mutation actions.

#### Scenario: Required nested group and leaves
- **WHEN** a model or block has a required group with required text, select, boolean, media and rich-text leaves
- **THEN** its legend and applicable control labels expose required guidance and associated descriptions while an otherwise valid incomplete draft remains savable

#### Scenario: List minima differ from hard maxima
- **WHEN** a list declares minItems 2 and maxItems 5
- **THEN** guidance explains the minimum applies to publication and the maximum to drafts as well, without changing existing list operations or budgets

#### Scenario: Read-only and errors coexist
- **WHEN** a viewer inspects nested fields with required state, constraints, configured descriptions and errors
- **THEN** guidance and errors remain associated with the controls, disclosures remain usable and mutation actions are absent

#### Scenario: Required explanation stays out of the layout
- **WHEN** a writer views and then focuses the empty required media field of an `image` block and activates Replace
- **THEN** "Required for publication only." is the required marker's tooltip and part of the field's accessible description but is not visible text, the layout does not change on focus, and the picker opens

#### Scenario: Required explanation is shown with a problem and to viewers
- **WHEN** publication validation reports the required media missing, or a viewer opens the block
- **THEN** "Required for publication only." is visible text with the field

### Requirement: Ordinary text counters distinguish declared hard limits from SEO advice
Text and textarea controls SHALL show a visible current count, including zero for an absent value, measured using raw UTF-16 length, associated with the control. The count SHALL be shown right-aligned in the field's label row rather than on a line of its own and SHALL be visible regardless of focus. When minLength or maxLength is declared, the counter and associated constraint guidance SHALL identify the declared bounds as validation limits. Unbounded fields SHALL show a count without inventing a limit. Counts SHALL be available in read-only inspection and absent from per-keystroke live announcements. Counter rendering SHALL NOT truncate input, block typing or replace existing save/publication validation. SEO counters SHALL explicitly identify 60/160 as recommendations, retain trimmed code-point counting, explain their separate existing hard limits and remain visible.

#### Scenario: Declared maximum and failed save
- **WHEN** a writer enters an ordinary text value longer than maxLength
- **THEN** the counter reflects its full raw length, guidance identifies the hard maximum and existing validation rejects saving without truncating the author's input

#### Scenario: Optional absent field with minimum
- **WHEN** an optional text field with minLength is absent
- **THEN** its count is zero and its minimum guidance does not claim that absence prevents saving or publication

#### Scenario: Counter after list moves and viewer inspection
- **WHEN** text items are moved or duplicated in a nested list and the saved entry is later viewed read-only
- **THEN** each visible count belongs to its current value and declared bounds and no counter announces every keystroke

#### Scenario: SEO advice remains advisory
- **WHEN** SEO title text exceeds 60 code points but remains within its hard limit
- **THEN** the counter labels 60 as recommended, shows the advisory warning and permits saving

#### Scenario: Counter sits in the label row
- **WHEN** a writer views an empty unbounded caption field, types "Hi" and moves focus away
- **THEN** "0 characters" and then "2 characters" are visible on the field's label row throughout, the field occupies no extra line for it, and the control's accessible description includes the count

### Requirement: Visual layouts preserve recursive form state and error access
The admin SHALL render declared sections with accessible headings and tabs with labelled tablists/panels in metadata order. The first tab SHALL initially be selected; Left/Right, Home and End SHALL select and focus tabs with the standard tabs keyboard behavior. Narrow viewports SHALL retain access to all tab controls and fields without page-level horizontal overflow. Unlisted fields SHALL follow the layout in declaration order. Each form owner and list item SHALL own independent navigation state. Model layouts SHALL affect only model fields, block data layouts only the Content panel, and settings layouts only declared settings inside the existing Settings panel; SEO and system/envelope controls SHALL retain their established behavior.

Hidden panels SHALL remain mounted, non-focusable and absent from the accessibility tree. Navigation SHALL preserve rich-text documents and editing identity, media selections, list item identity, local/transient values and validation errors. Navigating an absent group SHALL NOT create data or mark a draft dirty. Viewers SHALL be able to navigate layouts/disclosures but SHALL have no mutation affordances. Lifecycle requests SHALL retain existing editing locks.

Tabs and sections containing descendant problems SHALL display accessible problem indicators under the existing publication/hidden-block rules. Validation-summary activation SHALL select every containing tab, open ancestor block/group/list disclosures and focus the exact leaf/container in the rendered visual order. Save/discard/revert, conflict retention and list/block moves SHALL preserve values and map errors to the current correct item; presentation state SHALL never be submitted or included in dirty comparison/conflict JSON.

#### Scenario: Navigate and save a nested rich-text form
- **WHEN** a writer edits rich text and media in a list-item tab, switches tabs, moves the item and saves
- **THEN** current values and editing identity remain intact and the saved JSON uses the original paths

#### Scenario: Reveal a nested hidden error
- **WHEN** a summary entry targets a field inside an inactive tab of a collapsed item in an inactive block panel
- **THEN** all containing panels/disclosures open and the exact control receives focus with its error visible

#### Scenario: Navigate an unset group as a viewer
- **WHEN** a viewer navigates configured layouts around an absent group using keyboard controls
- **THEN** navigation works, values remain absent, no dirty change occurs and no mutation affordance appears

#### Scenario: Recover after save failure or revision conflict
- **WHEN** a layout-organized draft save fails or conflicts after editing nested fields
- **THEN** local values remain available in every panel and existing discard/reload/conflict recovery works without serializing navigation state

#### Scenario: Narrow-screen keyboard navigation
- **WHEN** an author visits every tab using arrows, Home and End at a narrow viewport
- **THEN** each selected tab is visible, its panel is keyboard accessible and no control is unreachable through overflow

### Requirement: Collection creation starts with an automatic editable slug
The collection Create entry dialog SHALL expose Slug and an initially enabled Suggest from title control. While enabled, title changes SHALL update the slug. Any manual slug change, including clearing it, SHALL disable automatic updates until explicitly re-enabled. Closing/cancelling or successfully completing creation SHALL reset dialog values and suggestion mode. Creation SHALL submit the displayed nonempty slug in the existing create request and omit an empty slug. The suggestion SHALL apply NFKD normalization, remove characters other than ASCII letters/digits, whitespace, underscore and hyphen, lowercase, trim, collapse whitespace/underscore/hyphen runs to one hyphen, trim boundary hyphens, truncate to the existing maximum slug length, and remove a resulting trailing hyphen. It SHALL NOT transliterate scripts, fabricate a fallback slug or promise uniqueness. Empty or wholly non-Latin titles SHALL yield an empty suggestion with guidance to enter a slug manually; an empty slug SHALL NOT prevent a valid draft creation.

On success the created entry SHALL open with its persisted slug and no unsaved changes. Subsequent title edits SHALL NOT change that persisted slug automatically. Ordinary loads, refreshes, duplicated entries and entries without slugs SHALL NOT imply new-creation suggestion mode. The existing entry-editor opt-in suggestion behavior SHALL remain available and use the same normalizer. Creation errors SHALL retain title/slug and manual/automatic mode. Route validation and conflicts SHALL remain server-authoritative and use normal accessible error feedback without auto-appending suffixes. Pages/globals and viewers SHALL acquire no creation/slug affordances.

#### Scenario: Follow a new title then stop on manual input
- **WHEN** a writer enters `Café & News` in the creation dialog then manually changes `cafe-news` to `updates` and edits the title again
- **THEN** `updates` stays unchanged until suggestions are explicitly re-enabled

#### Scenario: Non-Latin or empty title
- **WHEN** the title is empty or `Новости`
- **THEN** the suggested slug is empty, manual-entry guidance is visible, and the existing nonempty-title requirement alone determines whether draft creation can proceed

#### Scenario: Truncation leaves a valid boundary
- **WHEN** a long normalized suggestion has a hyphen at the truncation boundary
- **THEN** its trailing hyphen is removed and its nonempty result obeys the existing slug grammar and length limit

#### Scenario: Preserve the created and existing slug
- **WHEN** creation succeeds with `cafe-news` and the author edits the title in the editor or reloads the entry
- **THEN** the slug stays `cafe-news` and no automatic update runs unless the author explicitly opts in

#### Scenario: Preserve a slugless duplicate
- **WHEN** an author opens a duplicated collection entry with no slug and edits its title
- **THEN** its slug stays absent unless suggestions are explicitly enabled

#### Scenario: Creation failure retains author input
- **WHEN** the server rejects creation or a route conflict is reported by the existing lifecycle boundary
- **THEN** normal error feedback is accessible, local values and suggestion mode remain intact, and no alternate slug is generated

### Requirement: Collapsed list items summarize with field previews
A collapsed group item SHALL show a primary summary line and, when available,
a muted secondary line, a leading preview and advisory indicators. The
primary line SHALL use the existing summary order: nonblank `itemLabel` text,
then the first useful text/textarea, rich-text plain text, URL or select
value. A field type SHALL be able to provide a preview. The row SHALL take its preview from
the first direct child leaf of the item, in rendered field order, whose type
provides a preview and whose value is present. When no text summary exists,
the preview's title SHALL be the primary line; otherwise the preview's title
SHALL be the secondary line. When the preview's title is the primary line,
its detail SHALL be the secondary line. Without a preview, the secondary line
SHALL be the next useful text, URL or select value from a different field.
When a media value exists but no preview is available or the media item is
unresolved, the existing generic media-selected label SHALL remain the
fallback, and Empty item SHALL remain the last fallback. Summaries and
previews SHALL derive only from schema metadata, the item's values and
resolved media metadata. They SHALL contain no per-block presentation rules,
SHALL NOT expose media IDs or raw rich-text JSON and SHALL NOT dirty the draft.

A media leaf SHALL provide a preview: the media thumbnail read through the
admin preview boundary as the leading visual, the filename as title, and type
and dimensions as detail. When the media leaf's item group has exactly one
media field and a text field keyed `alt`, that `alt` is blank, and the
resolved media item has no alt text, the preview SHALL add an advisory "No
alt" indicator. The indicator SHALL NOT block saving or publishing.
Unresolvable, missing or pending-deletion media SHALL show a neutral
placeholder visual and an accessible state instead of the thumbnail.

#### Scenario: Gallery item with caption
- **WHEN** a gallery item holds media `photo.jpeg` with alt text and the
  caption "Blue portrait"
- **THEN** its collapsed row shows the thumbnail, "Blue portrait" as primary
  line and `photo.jpeg` as secondary line, with no "No alt" indicator

#### Scenario: Gallery item without caption or alt text
- **WHEN** a gallery item holds media `(3).jpeg`, a 675×1200 JPEG without alt
  text, and has blank caption and alt
- **THEN** its collapsed row shows the thumbnail, `(3).jpeg` as primary line,
  "JPEG · 675×1200" as secondary line and a "No alt" indicator, and the
  draft can be saved and published

#### Scenario: Item alt text removes the indicator
- **WHEN** the writer opens that item, types alt text and collapses it again
- **THEN** the "No alt" indicator is gone and the draft becomes dirty only
  through the typed alt text

#### Scenario: Items without previewable leaves
- **WHEN** a navigation link item has label "Blog" and URL `/blog`
- **THEN** its collapsed row shows "Blog" as primary line, `/blog` as
  secondary line, its one-based position as leading visual and no thumbnail

#### Scenario: Missing media in a gallery item
- **WHEN** a gallery item's media read reports that the item no longer exists
- **THEN** the row shows a placeholder visual with an accessible missing-media
  state and the generic media-selected label, without the media identifier
