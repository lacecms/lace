# admin-remote-state-and-lists Specification

## Purpose

Defines how the Lace browser admin consumes authenticated remote state so users
can establish a session, navigate configured models, and manage collection
entries with clear recovery behavior.

## Requirements

### Requirement: Content landing explains empty and unsynchronized models
The content landing route SHALL show a distinct empty state when the authenticated model list succeeds with no configured models, with guidance to define a model in code and run local synchronization. When a configured page has no singleton entry, it SHALL explain the likely pending synchronization and give the local command. API failures SHALL remain visible as errors rather than appearing as an empty configuration. Where the API does not expose persisted identity for a collection, the UI SHALL not claim synchronization is complete from an empty entry list alone.

#### Scenario: No configured models
- **WHEN** the content-model API succeeds with an empty list
- **THEN** the landing route shows a no-models explanation and local setup guidance

#### Scenario: Page has no synchronized singleton
- **WHEN** the model API contains a page but its entry list is empty
- **THEN** the landing route explains that local synchronization may be pending and shows `pnpm content:sync`

#### Scenario: Model API fails
- **WHEN** loading models fails
- **THEN** the landing route shows the API error and does not present the no-models state

### Requirement: The admin client validates credentialed API exchanges
The admin application SHALL send same-origin credentials for its authentication
and `/api/v1/admin/*` requests, validate successful API payloads against the
shared contracts, and map unsuccessful responses to one consistent user-facing
error representation. For API failures, the technical error details SHALL
include the response request ID when the API supplies one; it SHALL not expose
credentials, stack traces, or unvalidated response bodies.

#### Scenario: A validated list response is received
- **WHEN** the authenticated admin application receives a successful content
  model or entry-list response
- **THEN** it uses the shared runtime contract before presenting the response
  data

#### Scenario: An API error has a request ID
- **WHEN** an admin API request fails and its response supplies a request ID
- **THEN** the visible error state provides that ID in technical details without
  exposing credential or server-internal data

### Requirement: Authentication state recovers safely
The admin application SHALL provide accessible email/password sign-in and
sign-out actions. It SHALL preserve only a safe same-origin return location
after sign-in. When a protected remote request establishes that the browser
session is missing or expired, the application SHALL clear stale authenticated
state and redirect to login without rendering protected content or actions.

#### Scenario: A user signs in from a protected return location
- **WHEN** an unauthenticated user signs in successfully after opening a safe
  protected admin location
- **THEN** the application refreshes session state and redirects to that
  location

#### Scenario: A session expires during a protected request
- **WHEN** a protected admin request indicates that its browser session is no
  longer valid
- **THEN** the application clears authenticated remote state and redirects to
  login without retaining protected content or controls

### Requirement: Model navigation and collection lists reflect configured remote state
The authenticated content landing route SHALL load configured content models.
For every page model it SHALL provide a link to that model's singleton editor
route. For every collection model it SHALL provide a link to a model route that
loads its entries through the API's opaque cursor pagination and presents an
accessible next-page action when another cursor exists, together with how many
of the matching entries are shown. Collection entry lists SHALL provide
distinct loading, empty, no-match, error, and populated states: an empty
collection SHALL explain that no entries exist (with a create action only for
roles that may create), a search or status filter that matches nothing SHALL
say so and offer to clear the filters, and a failed list request SHALL show the
error with a retry action. A failed next-page request SHALL keep the already
loaded entries visible. While a changed search, filter, or sort is loading, the
previously shown entries MAY remain visible but SHALL be marked busy.

#### Scenario: Configured page and collection models are loaded
- **WHEN** an authenticated user opens the content landing route
- **THEN** each page model links directly to its singleton editor route and each
  collection model links to its entry-list route

#### Scenario: A collection has another page of entries
- **WHEN** a collection entry-list response includes a next cursor
- **THEN** the user can request the next page without decoding or modifying the
  cursor, and the list states how many of the matching entries are shown

#### Scenario: A collection contains no entries
- **WHEN** a collection entry-list response without search or status filter
  contains no items
- **THEN** the model route presents an explicit empty state rather than an empty
  table or a loading indicator

#### Scenario: A filter matches nothing
- **WHEN** a collection has entries but the active search or status filter
  matches none of them
- **THEN** the model route states that no entries match and offers a control
  that clears the search and status filter

#### Scenario: The entry list fails to load
- **WHEN** the first entry-list request for a collection fails
- **THEN** the model route shows the error with its technical details and a
  retry action that repeats the request

#### Scenario: The next page fails to load
- **WHEN** a next-page request fails after the first page was shown
- **THEN** the loaded entries stay visible together with the error

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

### Requirement: Content landing summarizes pages and collections
The content landing route SHALL present configured pages and collections as
separate groups. Each page SHALL show its label, public path, the singleton's
derived status (draft, published, or changed), its relative last-edit time,
and the last editor's display name, and SHALL open the singleton editor. Each
collection SHALL show its label, route pattern, total entry count, and the
counts of published, changed, and draft entries from the API's per-status
totals, and SHALL open the collection's entry list. The overview SHALL never
show an entry ID or user ID. A failed summary request for one model SHALL show
that model's error in place without hiding the other models, and the existing
no-models, missing-singleton, and API-error states SHALL be preserved.

#### Scenario: A published page with later edits
- **WHEN** the `home` page singleton has status `changed`, was updated two
  hours ago by "Ada Editor"
- **THEN** the Home page card shows a Changed status, "2 hours ago", and "Ada
  Editor", and links to the singleton editor

#### Scenario: A collection with mixed statuses
- **WHEN** the `posts` totals report 5 entries with 3 published, 1 changed, and
  1 draft
- **THEN** the Posts card shows 5 entries with 3 published, 1 changed, and
  1 draft, and links to `/content/posts`

#### Scenario: One model summary fails
- **WHEN** the entry-list request for `posts` fails while `home` succeeds
- **THEN** the Posts card shows the error and the Home card still renders

#### Scenario: A viewer opens the overview
- **WHEN** a `viewer` session opens the content landing route
- **THEN** it sees the same summaries as an editor and no create or delete
  actions

### Requirement: Collection lists present entry state without internal identifiers
Each collection entry row SHALL show the entry title as a link to its editor,
the entry slug (or a neutral note when it has none), the derived status (draft,
published, or changed), a value for each of the model's configured list fields
in configuration order, the publication date for published or changed entries,
and the relative last-edit time with the last editor's display name, with the
absolute time available to assistive technology and on hover. List-field
column headers SHALL use the field label, falling back to its key. List-field
values SHALL be formatted by field type: booleans as yes or no, numbers with
locale grouping, dates and datetimes as readable dates, select values by their
option, and missing values as a neutral dash. No list surface SHALL show an
entry ID or a user ID. Viewers, editors, and administrators SHALL see the same
row data.

#### Scenario: A changed entry with list fields
- **WHEN** the `posts` model declares list fields `category` (select, label
  "Category") and `featured` (boolean) and an entry titled "Launch" with slug
  `launch` has status `changed`, `category` "news", `featured` true, was
  published on 2026-09-20 and last edited two hours ago by "Ada Editor"
- **THEN** its row shows "Launch" linking to the entry editor, `launch`, a
  Changed status, "news" under "Category", "Yes" under "featured", the
  publication date, "2 hours ago", and "Ada Editor"

#### Scenario: A draft entry without optional values
- **WHEN** a draft entry has no slug, no value for a list field, and no
  publication
- **THEN** its row shows a neutral no-slug note and a dash for the missing list
  value and for the publication date

#### Scenario: Identifiers stay hidden
- **WHEN** any role views a collection list
- **THEN** no cell, header, or control label contains the entry ID or the
  editor's user ID

### Requirement: Collection list search, status filter, and sort are URL state
The collection route SHALL keep its title/slug search term, status filter, and
sort order in the route's URL search parameters and SHALL request entries from
the API with exactly those values. Opening or reloading a collection URL with
these parameters SHALL restore the same search box contents, status filter,
sort order, and results. Unsupported status or sort values, and search terms
that are blank or longer than the API accepts, SHALL be ignored rather than
causing an error, and the API's default sort SHALL not be written to the URL.
Search input SHALL update the URL after the user pauses typing without adding a
history entry per keystroke. The status filter SHALL show the per-status totals
the API reports for the current search. Title, publication date, and last-edit
columns SHALL be sortable from their headers, which SHALL expose the current
sort direction to assistive technology. Changing the search, status, or sort
SHALL restart pagination at the first page; pagination cursors SHALL never be
written to the URL.

#### Scenario: A filtered list survives a reload
- **WHEN** an editor searches for "launch", selects the Changed filter, sorts
  by title, and reloads the page
- **THEN** the URL carries `q=launch`, `status=changed`, and `sort=title`, and
  after the reload the search box, filter, and title sort are restored and the
  API is queried with the same values

#### Scenario: Unsupported parameters are ignored
- **WHEN** a user opens `/content/posts?status=archived&sort=author`
- **THEN** the list loads unfiltered with the default sort and no error

#### Scenario: Status totals follow the search
- **WHEN** the API reports totals of 4 entries (1 draft, 2 published, 1
  changed) for the search "launch"
- **THEN** the status filter shows All 4, Draft 1, Published 2, and Changed 1

#### Scenario: Sorting from a column header
- **WHEN** a user activates the Title column header on a list sorted by the
  default order
- **THEN** the list is requested sorted by title ascending, the Title header
  reports ascending order, and activating it again requests descending order

#### Scenario: Changing a filter restarts pagination
- **WHEN** a user has loaded a second page and then changes the status filter
- **THEN** the list is requested without a cursor and shows the first page of
  the new filter
