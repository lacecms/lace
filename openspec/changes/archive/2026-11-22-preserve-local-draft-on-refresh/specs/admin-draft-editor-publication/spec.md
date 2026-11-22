## MODIFIED Requirements

### Requirement: Revision-conflict recovery preserves local authoring
When a complete-draft save or publish receives `CONTENT_REVISION_CONFLICT`, or
when a background read detects a newer revision while the open draft has unsaved
changes, the editor SHALL retain all current local form values and dirty state and SHALL
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

#### Scenario: A background read reveals the conflict before any write

- **WHEN** a newer draft arrives while the local form has unsaved changes
- **THEN** an accessible alert explains that the draft changed elsewhere, and offers Reload server draft and Copy my JSON without requiring an attempted save
- **AND** copying includes the local draft's content and block order, excludes editor-only transient state and leaves unfinished controls intact

#### Scenario: Explicit reload fails and the writer retries

- **WHEN** a writer selects Reload server draft and the read fails with a recoverable error
- **THEN** the editor shows the failure, retains local input, the baseline revision and the recovery actions, and allows retry
- **AND** when a retry returns a validated current draft for the same entry, the editor adopts its values and revision, clears unfinished input and the alert, and shows a clean form without sending a write

#### Scenario: Save and publish encounters a conflict already detected by a read

- **WHEN** an authorized writer confirms Save and publish with valid local edits based on revision 4 after a refresh has reported revision 5
- **THEN** the save uses revision 4, and a revision conflict preserves the local form and sends no publish request
