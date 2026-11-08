# admin-draft-editor-blocks Specification

## Purpose
Defines block authoring in the admin draft editor: the ordered block aggregate, block cards, the Settings tab, hidden blocks and the block palette.

## Requirements

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
SHALL use the block's first non-empty top-level text value, otherwise the plain
text of its first non-empty top-level rich-text value, otherwise its first
non-empty top-level URL or select value, otherwise the summary of its first
non-empty composite field in rendered field order, otherwise a statement that
media is selected when a top-level media field or media inside a group holds a
value, otherwise a statement that the block is empty. A list with at least one
item SHALL summarize as its label (the configured label or one derived from its
key), its item count in parentheses, and, when any item has a primary summary
line, a colon followed by those items' primary lines in order, separated by
commas. A group SHALL summarize as its primary summary line. Item and group
primary lines SHALL follow the collapsed-item summary order. Lists without
items, and groups without a primary line, SHALL be skipped. The summary SHALL
be derived only from schema metadata and the block's values, SHALL contain no
per-block presentation rules, SHALL be truncated to one line, and SHALL never
show a raw media identifier or raw rich-text JSON. Built-in block types SHALL have distinct icons, and any
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

#### Scenario: A collapsed list block summarizes its items
- **WHEN** a Navigation block has no name and its Links list holds items
  labelled "Blog" and "About"
- **THEN** the card summary reads "Links (2): Blog, About" instead of a
  statement that the block is empty

#### Scenario: A list of media items is counted
- **WHEN** a Gallery block has no title and its Images list holds three items
  with media and no caption
- **THEN** the card summary reads "Images (3)" and shows no media identifier

#### Scenario: Top-level text still wins over a list
- **WHEN** a Gallery block has the title "Team" and three images
- **THEN** the card summary reads "Team"

#### Scenario: An empty list leaves the block empty
- **WHEN** a Gallery block has no title and its Images list holds no items
- **THEN** the card summary states that the block is empty

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

### Requirement: Hero and CTA are trailing palette entries
The Add block menu SHALL stably partition allowed definitions into all other
types in their existing relative order, followed by Hero and then CTA when
allowed. Filtering and keyboard navigation SHALL use that order. Saved block
order, server registry identity, configuration hashes and custom block types
SHALL NOT change solely because of palette ordering.

#### Scenario: Mixed custom and built-in definitions
- **WHEN** allowed types are `cta`, `custom`, `hero`, `image`, `link`
- **THEN** the menu shows `custom`, `image`, `link`, `hero`, `cta` while existing entry blocks retain their order
