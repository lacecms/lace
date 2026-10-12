## MODIFIED Requirements

### Requirement: Role-gated shell navigation is enforced at the route boundary
The admin shell SHALL group its navigation into Pages, Collections, Site,
Library, and Admin, in that order. Pages, Collections and Site SHALL list the
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
- **THEN** it receives the Pages, Collections, Site, and Library navigation
  groups and no Admin group, Users, or Settings navigation affordance

#### Scenario: A configuration has no globals
- **WHEN** the content-model response contains only page and collection models
- **THEN** the shell shows no Site group

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
Each page model in the Pages group and each global model in the Site group
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
- **THEN** the Site group lists "Site settings", linking to that entry's
  editor route without a count

#### Scenario: A global is not synchronized yet
- **WHEN** the entry list of the `settings` global is empty
- **THEN** its Site navigation item links to the Site section of the content
  overview

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

### Requirement: The shell header shows breadcrumbs without internal identifiers
The route header SHALL present breadcrumb navigation that locates the current
screen: the content overview, a model by its label, and an entry by its title,
or the resource screen name for Media, Builds, Users, and Settings. The editor
of a page or global singleton SHALL be located by the content overview and the
model label only. Every breadcrumb except the last SHALL be a link, and the
last SHALL be marked as the current page. A model breadcrumb SHALL use the
model's label, falling back to its configured key. While an entry title is
loading or unavailable the breadcrumb SHALL use a neutral word. Breadcrumbs
SHALL never show an entry ID or a user ID. The header SHALL remain visible at
the top of the viewport while the route content scrolls, and SHALL offer the
current screen a place for its page-level actions beside the breadcrumbs; a
screen without actions SHALL leave that place empty.

#### Scenario: A collection entry is open
- **WHEN** a user opens an entry titled "First post" in the `posts` collection
  labelled "Posts"
- **THEN** the header breadcrumbs read Content, Posts, First post, with Content
  and Posts as links and First post as the current page

#### Scenario: A page singleton is open
- **WHEN** a user opens the singleton editor of the `home` page
- **THEN** the breadcrumbs read Content and the page label, without the entry
  ID

#### Scenario: A global singleton is open
- **WHEN** a user opens the singleton editor of the `settings` global labelled
  "Site settings"
- **THEN** the breadcrumbs read Content and Site settings, with Site settings
  as the current page and no link to a model list

#### Scenario: An entry title is still loading
- **WHEN** the entry has not loaded yet
- **THEN** the last breadcrumb shows a neutral "Entry" label, not the entry ID

#### Scenario: A screen places actions in the header
- **WHEN** the entry editor is open
- **THEN** its save and publication actions appear inside the header beside the
  breadcrumbs, and they leave the header when the user navigates to a screen
  that provides no actions

### Requirement: The main editorial flow completes with the keyboard alone
An administrator SHALL be able to sign in, reach a collection from the
navigation, open an entry, add a block, save the draft, publish it through the
confirmation dialog, and open and dismiss a Users dialog using only keyboard
input. An administrator SHALL likewise be able to open a global from the Site
navigation group, edit and save its fields, publish it through the
confirmation dialog, and revert later draft changes through the entry actions
menu using only the keyboard. Every control reached on that path SHALL show a
visible focus indication, dialogs SHALL move focus into themselves when
opened, and closing a dialog SHALL return focus to the control that opened it.

#### Scenario: Keyboard-only walkthrough
- **WHEN** a keyboard-only administrator performs the main editorial flow
  without a pointing device
- **THEN** every step completes, each focused control shows a visible focus
  indication, and focus returns to each dialog's opener when it closes

#### Scenario: Keyboard-only global walkthrough
- **WHEN** a keyboard-only administrator opens "Site settings" from the Site
  group, changes the site name, saves, publishes, changes the tagline, saves
  and reverts to published
- **THEN** every step completes with visible focus, the publish confirmation
  states that the change affects every page after the next site build, and
  the form shows the published values after the revert
