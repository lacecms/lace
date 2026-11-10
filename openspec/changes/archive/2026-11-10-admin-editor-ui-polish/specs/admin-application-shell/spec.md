## MODIFIED Requirements

### Requirement: Role-gated shell navigation is enforced at the route boundary
The admin shell SHALL group its navigation into Pages, Collections, Globals,
Library, and Admin, in that order. Pages, Collections and Globals SHALL list the
configured page, collection and global models from the authenticated
content-model response, and a group without models SHALL be omitted. Library
SHALL present Media and Builds navigation to every authenticated session
holding `content:read`. Admin SHALL present Users navigation only to a session
holding `users:manage` and Settings navigation only to a session holding
`settings:manage`, and the Admin group SHALL be omitted entirely when it would
be empty. A session without the route's permission that opens `/users` or
`/settings` directly SHALL receive an access-denied route state without the
route's protected content or controls. Navigation and route decisions SHALL
use the permission list from the validated session summary, never the role
name. Hiding navigation SHALL be treated only as a user interface affordance
and SHALL not change the API's authorization authority.

#### Scenario: An editor views the shell
- **WHEN** a session with the `editor` role opens the content landing route
  of a configuration with pages, collections and globals
- **THEN** it receives the Pages, Collections, Globals, and Library navigation
  groups and no Admin group, Users, or Settings navigation affordance

#### Scenario: A configuration has no globals
- **WHEN** the content-model response contains only page and collection models
- **THEN** the shell shows no Globals group

#### Scenario: A viewer opens an administrator route directly
- **WHEN** a session with the `viewer` role opens `/users`
- **THEN** it receives an access-denied state and no user-management controls

#### Scenario: An administrator opens an administrator route
- **WHEN** a session with the `admin` role opens `/settings`
- **THEN** it receives the settings-route foundation within the shared shell
  and the Admin navigation group with Users and Settings

#### Scenario: A session holds only one administrative permission
- **WHEN** a session summary grants `settings:manage` but not `users:manage`
- **THEN** the Admin group shows Settings without Users, and `/users` renders
  the access-denied state

### Requirement: Shell navigation reflects configured content
Each page model in the Pages group and each global model in the Globals group
SHALL link directly to its singleton entry editor when the singleton exists,
and SHALL otherwise link to the content overview section of its kind, where
synchronization guidance is shown. Each collection model in the Collections
group SHALL link to its entry list and SHALL show the collection's total entry
count once it is known. Navigation items SHALL use the model's label, falling
back to its key, SHALL carry an icon that is hidden from assistive technology,
and SHALL mark the item matching the current location as the current page. A
failed count or singleton lookup SHALL not hide the navigation item or block
the route content. Creating, deleting, saving, or publishing an entry SHALL
refresh the affected counts and singleton links.

#### Scenario: A collection count is shown
- **WHEN** the entry-list totals for the `posts` collection report 12 entries
- **THEN** the Posts navigation item links to `/content/posts` and shows 12,
  and its accessible name states the entry count

#### Scenario: A page opens its singleton editor
- **WHEN** the `home` page model has a synchronized singleton entry
- **THEN** its Pages navigation item links to that entry's editor route

#### Scenario: A global opens its singleton editor
- **WHEN** the `settings` global model labelled "Site settings" has a
  synchronized singleton entry
- **THEN** the Globals group lists "Site settings", linking to that entry's
  editor route without a count

#### Scenario: A global is not synchronized yet
- **WHEN** the entry list of the `settings` global is empty
- **THEN** its Globals navigation item links to the Globals section (`#globals`)
  of the content overview

#### Scenario: The current location is marked
- **WHEN** a user is on `/content/posts/entry-1`
- **THEN** the Posts navigation item is marked as the current location

#### Scenario: A count request fails
- **WHEN** the entry-list request for a collection fails
- **THEN** its navigation item remains available without a count and the route
  content still renders

#### Scenario: A created entry updates the count
- **WHEN** an editor creates an entry in `posts`
- **THEN** the Posts navigation count is refreshed from the API
