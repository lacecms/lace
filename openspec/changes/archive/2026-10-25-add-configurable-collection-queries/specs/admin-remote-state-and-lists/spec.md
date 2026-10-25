## MODIFIED Requirements

### Requirement: Collection list search, status filter, and sort are URL state
The collection route SHALL keep its title/slug search term, status filter, and
sort order and canonical configured field filters in the route's URL search parameters and SHALL request entries from
the API with exactly those values. Opening or reloading a collection URL with
these parameters SHALL restore the same search box contents, status filter,
sort order, and results. Unsupported status or sort values, and search terms
that are blank or exceed the advertised runtime LIKE policy, SHALL be ignored rather than
causing an error, and the API's default sort SHALL not be written to the URL.
Search input SHALL update the URL after the user pauses typing without adding a
history entry per keystroke. The status filter SHALL show the per-status totals
the API reports for the current search. Title, publication date, and last-edit
columns SHALL be sortable from their headers, which SHALL expose the current
sort direction to assistive technology. Changing the search, status, field filters, or sort
SHALL restart pagination at the first page; pagination cursors SHALL never be
written to the URL.

Configured visible field columns SHALL expose sort direction and a filter affordance only for their enabled operations. A Sort selector SHALL expose all enabled sorts including fields absent from listFields; a Filters control SHALL expose all configured filter fields using field labels and native type-appropriate inputs. Active field filters SHALL appear as removable conditions with a clear-all action; clear-all SHALL clear q, status and field filters while retaining the active valid sort. The search hint SHALL describe additional configured fields when present. Field filters and search SHALL combine as defined by collection-query-options. Metadata loading SHALL precede model-dependent URL validation. Structurally invalid or no-longer-enabled URL conditions SHALL be removed without a page error; valid remaining conditions SHALL survive. The API SHALL still reject invalid direct requests. Empty optional filter bounds SHALL mean an omitted bound; zero and false SHALL not be dropped. Invalid drafts of a range SHALL show an inline error and SHALL not issue a query until valid. Search SHALL retain its debounce and replace-history behavior. Existing pending/error/empty-list states SHALL remain truthful, and resetting a no-match view SHALL clear field filters too. Controls SHALL work by keyboard with accessible labels, focus handling and current sort announcements. All roles SHALL see the same read controls.

The admin SHALL read listQueryLimits from content-model metadata before
runtime-dependent URL validation. It SHALL apply the advertised character
ceiling and escaped-pattern UTF-8 budget to q/contains (Node 200/null,
Cloudflare 48/50). Search hints SHALL explain the active budget and ASCII-only
case-insensitive behavior. Invalid URL q/contains conditions SHALL be dropped
individually while valid peers survive; no list request SHALL be sent with an
over-budget condition. Invalid editing drafts SHALL remain editable with a
local error and retain the last valid URL/query/results; no silent truncation
or over-budget debounced request SHALL occur. Text equality controls SHALL keep
their shared 200-code-unit limit. Policy changes SHALL enter query-cache identity
and reset pagination, without exposing cursors in URLs.

When a continuation fails with 422 VALIDATION_FAILED naming /after, the list
SHALL keep previously loaded rows visible with a keyboard-accessible Restart
list action. Activating it SHALL discard cached pages/cursors for the current
list and fetch the first page with all valid q/status/sort/field filters
retained, replacing the old page set. It SHALL NOT append restarted rows to old
pages or indefinitely retry the invalid cursor. The restarted result SHALL be
announced accessibly. Viewers, editors and administrators SHALL have the same
recovery. Other retryable read failures SHALL retain the existing retry behavior.

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


#### Scenario: Configured queries survive reload and navigation
- **WHEN** a user applies category and date filters plus a hidden-field sort and reloads or navigates Back/Forward
- **THEN** controls, active conditions, URL, API query and results agree and pagination restarts for changed conditions

#### Scenario: Stale links recover after configuration changes
- **WHEN** an old URL requests a removed filter or field sort
- **THEN** the route drops unsupported conditions after metadata loads, retains valid conditions and uses default sort if needed without a failed-list screen

#### Scenario: An impossible numeric range is editable
- **WHEN** the user enters a minimum greater than the maximum
- **THEN** the control explains the issue, keeps the draft input and does not replace the last valid results with a rejected request



#### Scenario: An edited string-sort boundary can be recovered
- **WHEN** another writer edits/deletes the boundary draft and Load more fails at /after
- **THEN** the current rows stay visible with Restart list, and keyboard activation requests the same query without after and replaces all prior pages

#### Scenario: Restart retains filter intent
- **WHEN** a viewer restarts a rejected continuation with search, status, hidden-field sort and field filters active
- **THEN** those conditions remain in controls/URL/API requests, no cursor enters the URL, the stale cursor is not retried, and the fresh results are announced

#### Scenario: Cloudflare applies a byte-aware search budget
- **WHEN** the admin loads Cloudflare metadata and a draft q/contains exceeds 50 final escaped UTF-8 bytes despite meeting the character ceiling
- **THEN** it shows a local budget error and keeps the last valid results without sending a request; a stale URL drops only that invalid condition after metadata loads

#### Scenario: Node keeps the existing search length
- **WHEN** the admin loads Node metadata and the user supplies a valid 200-code-unit q
- **THEN** the input and request retain the entire term, while lowercase/uppercase Cyrillic remain distinct
