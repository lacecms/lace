## MODIFIED Requirements

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
