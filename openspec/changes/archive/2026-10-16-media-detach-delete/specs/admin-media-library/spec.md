## MODIFIED Requirements

### Requirement: Media deletion remains confirmed and recoverable
The library SHALL offer a writer deletion of an active item from its details panel only after an explicit confirmation dialog, and a retry action for an item in `delete_failed`. It SHALL label `deleting` as pending asynchronous removal, not completed deletion. When the item's usage count is zero, the confirmation SHALL request an ordinary deletion. When the usage count is greater than zero, the panel SHALL decide from the loaded usage: while usage is loading or has failed to load, deletion SHALL be unavailable; when any listed location is used by a published version, or when the usage list is truncated, deletion SHALL be unavailable and the panel SHALL explain that the published versions must stop using the item first, naming each entry whose published version uses it and, for an entry whose draft no longer uses the item, saying that publishing or unpublishing that entry releases the item; when every using entry is listed and uses the item only in its draft, and the writer may also edit content, the panel SHALL offer deletion through a confirmation that names each entry whose draft will lose the item, states that the item is removed from those drafts and not from any published version, warns that a required field may then block publication and that someone editing one of those entries will have to reload, and requests deletion with draft detaching. After an accepted detaching deletion the library SHALL refresh the affected entries' remote state. It SHALL update the visible state only from validated API results, preserve the item and show a non-sensitive error when a request fails, and explain a rejected deletion of referenced media without suggesting the reference was removed; a rejection after some drafts were detached SHALL say that some drafts may already have changed. These controls SHALL be keyboard operable and SHALL return focus predictably when the confirmation closes; API authorization and reference checks remain authoritative.

#### Scenario: An unreferenced item is queued for deletion
- **WHEN** a permitted writer confirms deletion and the API accepts the request
- **THEN** the item is shown as deleting until subsequent remote state confirms its removal

#### Scenario: Deletion is cancelled
- **WHEN** a writer opens the deletion confirmation and cancels it
- **THEN** no deletion request is sent and focus returns to the delete action

#### Scenario: A referenced item cannot be deleted
- **WHEN** the API refuses deletion because content references the item
- **THEN** the item remains in the library and the writer sees the failure without a success claim

#### Scenario: A used item offers guidance instead of deletion
- **WHEN** a writer opens the details of an item whose usage count is 2 and one listed entry's published version uses it
- **THEN** the delete action is unavailable and the panel names that entry as needing its published version to stop using the item first

#### Scenario: A published-only usage explains that publishing releases it
- **WHEN** the only listed entry uses the item in its published version but no longer in its draft
- **THEN** the panel says that publishing or unpublishing that entry releases the item, with a link to the entry

#### Scenario: Draft-only usage is deleted after confirmation
- **WHEN** an editor opens an item used only in the drafts of "Hello" and "About", confirms the dialog that names both entries, and the API accepts the request
- **THEN** the request asks for draft detaching, the item is shown as deleting, and the entries' cached state is refreshed

#### Scenario: Truncated usage cannot be detached
- **WHEN** the item's usage count is 60 and the panel lists 50 entries
- **THEN** the delete action is unavailable and the panel says that more entries use the item than can be changed at once

#### Scenario: A failed deletion is retried
- **WHEN** a permitted writer retries a `delete_failed` item and the API accepts the request
- **THEN** the item returns to a pending deletion state without claiming the object has already been removed
