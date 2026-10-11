## MODIFIED Requirements

### Requirement: Collection-entry mutations expose permission-aware affordances
The admin application SHALL expose collection-entry creation, duplication and
deletion only where the resolved permissions and the entry's state permit the
action, while treating that visibility as a convenience rather than
authorization. It SHALL submit create, duplicate and delete requests through
the authenticated API and, after a successful mutation, refresh the affected
model and entry-list state. The create action SHALL open a dialog that names
the collection, requires a non-blank title before submission, can be cancelled
without creating anything, and starts empty each time it is opened. After a
successful creation the application SHALL open the new entry in the editor.

Each entry row SHALL offer, to users with `content:write`, a menu button named
"Actions for" the entry's title, reachable and operable by keyboard. The menu
SHALL offer Open, which opens the entry in the editor; Duplicate, which sends
one duplicate request guarded by the row's draft revision and then opens the
copy in the editor; and Delete, when the entry is a draft or the user also has
`content:publish`. Users without `content:write` SHALL see no row menu and
SHALL open entries through the title link. Delete SHALL require explicit
confirmation in a dialog that names the entry and can be cancelled; for a
published entry the dialog SHALL say that the page disappears from the site
after the next build and SHALL enable deletion only after the saved title is
typed exactly. A failed create, duplicate or delete SHALL keep its dialog open
with the error, or for Duplicate announce the error, and SHALL not change the
list. After a successful deletion, focus SHALL move to the collection heading.
After a dialog opened from the row menu is cancelled, focus SHALL return to that
row's menu button.

#### Scenario: A viewer opens a collection list
- **WHEN** a `viewer` opens a collection model route
- **THEN** it can inspect, search, filter, and sort the entry list but is not
  offered create controls or row action menus

#### Scenario: An editor creates an entry
- **WHEN** an `editor` completes the create-entry action for a collection
- **THEN** the application creates the entry through the API, refreshes the
  collection list, and opens the new entry in the editor

#### Scenario: A blank title cannot be submitted
- **WHEN** an editor opens the create-entry dialog and the title is empty or
  whitespace
- **THEN** the create action is unavailable and no request is sent

#### Scenario: An editor opens the row menu of a published entry
- **WHEN** an `editor` opens the row actions menu of a published entry
- **THEN** the menu offers Open and Duplicate but not Delete

#### Scenario: A writer duplicates from the list
- **WHEN** a writer chooses Duplicate in the row actions menu for "First post"
- **THEN** one duplicate request is sent and the editor opens "First post
  (copy)"

#### Scenario: A permitted user deletes an entry
- **WHEN** a permitted user chooses Delete in the row actions menu for the
  draft-only entry "First post" and confirms the deletion
- **THEN** the application sends the delete request without asking for the
  title, refreshes affected collection state only after the API confirms
  success, and moves focus to the collection heading

#### Scenario: An admin deletes a published entry from the list
- **WHEN** an admin chooses Delete for the published entry "First post"
- **THEN** the confirmation says the page disappears from the site after the
  next build and enables deletion only after "First post" is typed

#### Scenario: A user cancels deletion
- **WHEN** a permitted user opens the delete confirmation and cancels it
- **THEN** no delete request is sent, the entry remains listed, and focus
  returns to the row's actions menu button

#### Scenario: Deletion fails
- **WHEN** the API rejects a confirmed deletion
- **THEN** the dialog stays open with the error and the entry remains listed
