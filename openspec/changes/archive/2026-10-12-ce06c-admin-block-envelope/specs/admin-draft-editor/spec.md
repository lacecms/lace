## ADDED Requirements

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

## MODIFIED Requirements

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

A problem that only publication reports (a field required for publication)
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

A deeper pointer below a field or setting, such as a path into a rich-text
document, SHALL map to that field or setting. Mapping SHALL preserve the
writer's complete local draft and dirty state.

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

## REMOVED Requirements

### Requirement: The editor preserves block envelopes it does not edit
**Reason**: The editor now edits block envelopes; preservation of loaded values
through draft operations moves to "Block envelopes survive draft operations",
and envelope issue mapping moves into "Validation problems are shown where
they occur and summarized".
**Migration**: No data or API migration. The behavior is kept by the new
requirement; envelope issues now map to Settings controls instead of the
block card.
