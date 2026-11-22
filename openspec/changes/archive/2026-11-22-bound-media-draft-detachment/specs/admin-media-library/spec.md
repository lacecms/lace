## MODIFIED Requirements

### Requirement: Media deletion remains confirmed and recoverable
The media details panel SHALL offer deletion of an active item to a permitted writer after explicit confirmation. An unused item takes the ordinary deletion path. The panel SHALL label `deleting` as pending asynchronous removal and offer retry for `delete_failed`.

For a used item the panel SHALL wait for complete usage information. While usage loads, on a read error, or when the list is truncated, deletion SHALL be unavailable. For truncation the panel SHALL explain the 50-entry limit. For published usage it SHALL disable deletion, name each listed entry whose published version uses the item and explain that the published use must be released. For a published-only use it SHALL link to the entry and explain that publishing the edited draft or unpublishing the entry releases that use.

For complete, draft-only usage the panel SHALL also require content editing permission. Its confirmation SHALL name each affected entry, explain that only those drafts lose the media, and warn that a missing required field can block publication and an open editor will need to reload.

After confirmation, the library SHALL compare the admitted IDs with the displayed set, send matching entry steps sequentially at their admitted revisions, then finish. A different set SHALL require fresh review before editing. The library SHALL show the number of acknowledged steps out of the confirmed total and offer continuation when the same account returns to the item on the same browser and installation. It SHALL replay an interrupted step with its original revision and stop on conflict or loss of permission.

The library SHALL refresh affected entries, lists and usage after success or possible partial progress. Only a validated final receipt SHALL cause the library to announce that this request queued deletion. On rejection it SHALL preserve the item, show a non-sensitive reason, and explain that some drafts may already have changed if a step was attempted. Controls SHALL support keyboard operation and restore focus predictably when confirmation closes. The API remains authoritative for permission and reference checks.

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

#### Scenario: Closing the tab between steps
- **WHEN** an editor confirms 50 drafts, closes the tab after several saves and returns to the item
- **THEN** the editor can continue the original set, a lost acknowledgment causes no second revision increment, and the library shows pending deletion only after the final receipt

#### Scenario: A newly using entry needs fresh review
- **WHEN** the dialog named two entries and admission returns a different set
- **THEN** the library refreshes usage for confirmation and sends no entry step

#### Scenario: An interrupted operation cannot resume under another account
- **WHEN** a different editor signs in on a browser with a saved detach plan
- **THEN** that account cannot resume the first editor's confirmation
