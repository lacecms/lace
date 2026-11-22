## ADDED Requirements

### Requirement: Reference controls select records by declared model

At every declared reference field, including nested model, global and block
data, the editor SHALL show the selected entry's title, model and publication
status. A writer SHALL be able to search the field's allowed models by title,
page through results, and select an existing draft-only or published entry.
Search SHALL be debounced and obsolete results SHALL NOT replace those of a
newer search. Opening or inspecting a control SHALL preserve form values and
dirty state. The editor SHALL resolve distinct selected IDs in bounded batches.
A deleted selection SHALL retain its ID, show a missing-entry label, and allow
the writer to replace or clear it. A temporary lookup failure SHALL offer
retry and SHALL NOT label an existing selection as deleted.

#### Scenario: Select a testimonial without a route

- **WHEN** a writer searches a field restricted to testimonials and selects a draft-only testimonial on the second result page
- **THEN** the control shows its title and draft status and the saved value is its ID, regardless of its lack of a public path

#### Scenario: The picker is inspected by a viewer

- **WHEN** a user with read-only permission opens a source containing reference fields
- **THEN** the selected titles and statuses are inspectable and mutation actions are unavailable

#### Scenario: A previously selected target was deleted

- **WHEN** a writer opens a draft after reviewed deletion of a selected testimonial
- **THEN** the control identifies the missing entry, retains its field position on unrelated draft saves and lets the writer repair the selection

### Requirement: Lists of entry references preserve ordered occurrences

A direct list of reference items SHALL support adding several choices in one
picker interaction, removing individual occurrences and reordering them by
pointer or keyboard. Selection SHALL preserve the order chosen by the editor
and support repeated IDs under existing list semantics. Each selected occurrence
SHALL occupy a dense list position. Changes SHALL honor the list's maximum,
the snapshot-wide budget, and the distinction between absence and an empty
list. Actions and feedback SHALL be accessible by keyboard and screen reader.

#### Scenario: Reorder and remove just one occurrence

- **WHEN** a writer selects A, B and A, moves B to the front with the keyboard, removes the first occurrence of A and saves
- **THEN** reopening the draft shows B and A, and the stored array contains exactly those two IDs in that order

#### Scenario: Cancel a multi-selection near the list limit

- **WHEN** a list has one remaining slot and the writer inspects several candidates before cancelling
- **THEN** the picker communicates the remaining capacity and the existing list and dirty state are preserved

### Requirement: Where-used navigation takes editors to verified direct occurrences

The editor SHALL list direct data-reference uses by referring entity and
field or block location, with draft uses distinguishable from delivered
published blockers. Opening a location SHALL identify its source and verify
the reference occurrence against the current draft before focusing it. The
editor SHALL open the necessary tab, group, list row or block, and SHALL
identify a conditionally hidden occurrence without changing its controller.
If an observed source changed, the editor SHALL explain a stale location or
focus a verified occurrence. For a published blocker already removed in the
draft it SHALL identify the pending publication. Navigating away from dirty
edits SHALL use normal unsaved-change protection.

#### Scenario: Direct blockers and an exact field

- **WHEN** a testimonial selects Anna in its Author field and a service page selects that testimonial
- **THEN** Anna's blockers identify the testimonial and its Author field, and activating it opens the testimonial at that field

#### Scenario: Reordered rows or a correction waiting for publication

- **WHEN** an old impact result points at the second item and the draft now holds another entry there
- **THEN** the editor never focuses that item as the observed reference, and if the published occurrence was removed from the draft it explains that publishing the correction releases the blocker

#### Scenario: Hidden field and unsaved edits

- **WHEN** a writer navigates to a draft-only occurrence under a hidden conditional group while another editor form is dirty
- **THEN** cancelling the navigation keeps the dirty form, and continuing opens the source with the occurrence identified and its controller value preserved

### Requirement: The editor explains reference conflicts and confirmation outcomes

The editor SHALL present delivered published blockers for delete and
unpublish, offer direct repair navigation, and offer no action to override
them. Before deleting a target with direct draft uses, it SHALL show those
uses and request explicit confirmation of the reviewed impact. A stale
confirmation SHALL require fresh review. Cycle and unavailable-target
diagnostics SHALL identify the initiating field or block. For a staged
reversal the editor SHALL identify the source whose saved correction must be
published first. A rejected action SHALL preserve the writer's current edits.

#### Scenario: A draft reversal has a publication prerequisite

- **WHEN** A still publishes A → B, A's saved draft has removed that reference, and a writer attempts to publish B → A first
- **THEN** the editor identifies the reference on B, identifies A as the entry to publish first, and leaves both drafts intact

#### Scenario: A new publication appears during deletion review

- **WHEN** a writer reviews draft-only uses and a source publishes that reference before the writer confirms deletion
- **THEN** deletion fails and refreshed impact shows the new published blocker with a direct link to the referring source
