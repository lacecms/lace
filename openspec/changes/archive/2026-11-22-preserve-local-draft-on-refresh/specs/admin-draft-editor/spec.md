## ADDED Requirements

### Requirement: Background reads preserve the open draft's editing baseline

The editor SHALL use the revision from which the open form was initialized or last adopted as the optimistic precondition for saving its local values. When a validated background read returns a newer draft for the same entry, a clean editor SHALL adopt its values and revision. If the writer has unsaved changes, including unfinished input held by a field control, the editor SHALL retain the complete local form, its baseline revision, validation state and unsaved status, and expose revision-conflict recovery. A background read SHALL NOT trigger a save, publish, partial merge or reset of dirty controls. These rules SHALL apply before and after a successful local save.

#### Scenario: A second writer saves before the first writer's first save

- **WHEN** two writers open revision 4, the first changes the title, the second saves a different title and model field as revision 5, and returning focus to the first editor refetches revision 5
- **THEN** the first editor still shows its local title and original field, revision 4 and unsaved status, with conflict recovery available before Save
- **AND** leaving still prompts to discard changes, and choosing to stay preserves the form
- **AND** an explicit Save of valid local values sends revision 4 as its precondition and a conflict response keeps those values editable

#### Scenario: Unfinished block input is the only local change

- **WHEN** a writer clears a numeric list item inside a block, its stored numeric value is still present, and a background read returns a newer revision
- **THEN** the input stays empty in the same block and list position, the editor still indicates unsaved changes, and conflict recovery is available
- **AND** Save still identifies the unfinished field and sends no write until the input is valid

#### Scenario: A clean editor adopts a newer revision

- **WHEN** an editor with no local changes receives a newer revision of its entry, including after a successful local save
- **THEN** the editor shows the refreshed draft values and revision together, stays clean and shows no conflict
- **AND** a subsequent valid edit saves against that refreshed revision
- **AND** a read-only viewer sees the refreshed values with the usual view-only controls

#### Scenario: A delayed or repeated read arrives

- **WHEN** an editor has unsaved changes based on revision 5 and receives a read at revision 5 or below
- **THEN** the values and baseline stay intact and the read creates no conflict
- **AND** if a newer draft has already triggered recovery, the delayed read does not clear it
