# admin-draft-editor Specification

## Purpose

Defines the core of the browser-admin draft editor: its layout, read-only
viewing, validation summary, the global editor, unsaved-draft protection and
saving one complete optimistic draft. Fields, media and list items, blocks and
publication are specified by the `admin-draft-editor-*` capabilities.

## Requirements

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

### Requirement: The start-aligned editor layout keeps actions and entry details at hand
The entry editor SHALL place its save-state indicator, its single Save action, for administrators its Publish (or Save and publish) action, and its entry actions menu when one is offered in the shell header beside the breadcrumbs, so they stay visible while the editor scrolls. The save-state indicator SHALL distinguish unsaved changes, saving, a failed save with local changes kept, the saved revision, and view-only access in text. Save SHALL be available through the platform save shortcut (`⌘S` on Apple platforms, `Ctrl+S` elsewhere), which the Save control SHALL advertise visibly and programmatically. While the editor is mounted, the shortcut SHALL NOT open the browser's page-save behavior. The shortcut SHALL submit exactly like the Save control and SHALL do nothing when the draft is clean, a save is in progress, or the user cannot save. The title SHALL be presented as a prominent input with an accessible "Title" label. At wide viewports the editor SHALL show the title and blocks in a main column and the publication details and entry fields (collection slug and model fields) in a right-hand column, and SHALL stay aligned to the start of content areas wider than its maximum width. When the model allows no block types and the entry holds no blocks, the editor SHALL show no Blocks section and SHALL show the entry fields in the main column after the title, leaving the publication details (and the SEO card, when enabled) in the right-hand column. At narrow viewports the right-hand column SHALL follow the main column in reading and keyboard order. The editor SHALL show the entry-wide list budget ("List items: n / 500") only while the entry uses at least 400 list elements, and SHALL always show the budget problem when the entry exceeds the budget. The editor SHALL keep one page-level heading for assistive technology that names the entry being edited without repeating the breadcrumbs visibly.

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

#### Scenario: A global without blocks uses the main column
- **WHEN** an admin opens the `settings` global, whose model allows no blocks, at a wide viewport
- **THEN** no Blocks section or "does not allow blocks" text is shown, the global's fields appear in the main column below its label, and the publication details appear in the right-hand column

#### Scenario: A model without block types keeps orphaned blocks visible
- **WHEN** an entry holds a block although its model now allows no block types
- **THEN** the Blocks section is shown with the block and its problem, and the entry fields stay in the right-hand column

#### Scenario: The list budget appears near the limit
- **WHEN** a writer edits an entry using 12 list elements and then adds items until it uses 400
- **THEN** no list budget line is shown at 12 elements and "List items: 400 / 500" is shown at 400

#### Scenario: The editor stays left-aligned on a wide screen
- **WHEN** an entry is opened in a content area wider than the editor's maximum width
- **THEN** the editor starts at the content area's left padding and the remaining space is on its right

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
