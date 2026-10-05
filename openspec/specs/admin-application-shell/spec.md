# admin-application-shell Specification

## Purpose

Defines the browser-admin foundation so authenticated Lace users can navigate
an accessible, responsive shell without exposing protected content or controls
before their session and role have been resolved.

## Requirements

### Requirement: The admin application provides a coherent accessible UI system
The admin application SHALL provide Lace-owned Button, Input, Textarea, Select,
Dialog, Sheet, DropdownMenu, Popover, Tooltip, Toaster, Table, Tabs, Badge,
Skeleton, Calendar, ScrollArea, EmptyState, and ErrorState controls, styled
only through the `admin-design-system` color, typography, spacing, radius,
shadow, focus, and motion tokens using utility classes rather than hand-written
component CSS. Interactive controls SHALL have an accessible name, visible
keyboard focus indication, and contrast suitable for their state. The
application SHALL honour reduced-motion preferences and remain usable at narrow
viewport widths without requiring a horizontal page scroll.

#### Scenario: A keyboard user operates an owned control
- **WHEN** a keyboard-only user reaches an enabled owned control
- **THEN** the control exposes its accessible name, receives a visible focus
  indication drawn from the focus token, and can be operated without a pointing
  device

#### Scenario: Motion reduction is requested
- **WHEN** the browser reports a reduced-motion preference
- **THEN** the application suppresses non-essential transitions and animation

#### Scenario: The shell is viewed on a narrow screen
- **WHEN** an authenticated user opens the admin shell at a narrow viewport
- **THEN** navigation and route content remain reachable without horizontal
  page scrolling

#### Scenario: Owned controls are restyled through tokens
- **WHEN** a theme token value changes
- **THEN** every owned control using that token reflects the new value without
  a component source change

#### Scenario: A notification is raised
- **WHEN** admin code raises a notification through the Toaster
- **THEN** the notification is rendered in a polite live region and offers a
  dismiss control with an accessible name

### Requirement: Typed client routes cover the Session 11A admin surface
The admin application SHALL provide typed client routes for `/login`,
`/content`, `/content/:modelKey`, `/content/:modelKey/:entryId`, `/media`,
`/builds`, `/users`, and `/settings`. Refreshing one of these client routes
through the configured API/admin composition SHALL render the corresponding
admin client route rather than an API or health fallback response. The content
landing, and content-model routes SHALL present their Session 11B remote-state
behavior; resource screens outside Session 11B may retain their foundation
placeholders.

#### Scenario: A model-entry route is refreshed
- **WHEN** a browser refreshes `/content/posts/entry-123` through the admin
  deployment
- **THEN** the admin application renders the entry-route foundation and does
  not treat the path as an unknown API resource

#### Scenario: An invalid model key is presented
- **WHEN** a browser opens a content-model route whose parameter does not match
  the route's model-key grammar
- **THEN** the application renders its client not-found state without issuing a
  request for protected model data

### Requirement: Session guards prevent protected-content flashes
Before rendering a protected route or protected navigation affordance, the
admin application SHALL resolve the current same-origin browser session. While
that resolution is pending, it SHALL render only a neutral loading state. When
there is no valid session, it SHALL read installation setup state and redirect to
`/setup` while incomplete or `/login` while complete, retaining a safe post-login
return location; a failed state read SHALL show a retryable sanitized error
without rendering protected content; it SHALL not briefly render protected route content
or actions. An authenticated visitor to `/login` SHALL be redirected to the
safe content landing route.

#### Scenario: An anonymous visitor opens a protected entry URL
- **WHEN** a browser without a valid session opens `/content/posts/entry-123`
- **THEN** it sees no entry content or protected controls and is redirected to
  setup while installation setup is incomplete, or the login route after
  completion, with a safe return location

#### Scenario: A session is still being checked
- **WHEN** a browser opens a protected route and session resolution has not
  completed
- **THEN** it sees a neutral loading state and no protected route content or
  navigation affordance

### Requirement: Role-gated shell navigation is enforced at the route boundary
The admin shell SHALL group its navigation into Pages, Collections, Library,
and Admin. Pages and Collections SHALL list the configured page and collection
models from the authenticated content-model response. Library SHALL present
Media and Builds navigation to every authenticated Lace role. Admin SHALL
present Users and Settings navigation only to an `admin` session, and the Admin
group SHALL be omitted entirely for other roles. A non-admin who opens `/users`
or `/settings` directly SHALL receive an access-denied route state without the
route's protected content or controls. Hiding navigation SHALL be treated only
as a user interface affordance and SHALL not change the API's authorization
authority.

#### Scenario: An editor views the shell
- **WHEN** a session with the `editor` role opens the content landing route
- **THEN** it receives the Pages, Collections, and Library navigation groups
  and no Admin group, Users, or Settings navigation affordance

#### Scenario: A viewer opens an administrator route directly
- **WHEN** a session with the `viewer` role opens `/users`
- **THEN** it receives an access-denied state and no user-management controls

#### Scenario: An administrator opens an administrator route
- **WHEN** a session with the `admin` role opens `/settings`
- **THEN** it receives the settings-route foundation within the shared shell
  and the Admin navigation group with Users and Settings

### Requirement: Admin entry redirects to the content home
The admin application SHALL redirect the `/admin/` entry path to `/admin/content` and apply the usual session guard before showing protected content.

#### Scenario: Anonymous visitor opens admin entry
- **WHEN** an unauthenticated visitor opens `/admin/`
- **THEN** the visitor reaches setup while installation setup is incomplete, or
  sign-in after completion, with a safe return location and sees no protected
  content

#### Scenario: Authenticated visitor opens admin entry
- **WHEN** an authenticated visitor opens `/admin/`
- **THEN** the visitor reaches the content landing screen

#### Scenario: A completed installation opens setup directly
- **WHEN** an anonymous visitor opens `/admin/setup` after installation completion
- **THEN** the visitor reaches sign-in with no setup form and no registration action

#### Scenario: Setup state cannot be read
- **WHEN** an anonymous entry or setup navigation cannot read installation state
- **THEN** a sanitized retryable error appears without setup fields or protected content

### Requirement: Admin shell exposes logout
The authenticated shell SHALL expose a user menu that shows the signed-in
user's display name and role and offers a keyboard-operable log out action.
The display name SHALL come from the same-origin session response (the user's
name, otherwise their email); when neither is available the menu SHALL show a
neutral label and SHALL never show the user's internal identifier. Successful
logout SHALL invalidate the browser session and clear protected cached state;
a failed logout SHALL show an error and leave the user signed in.

#### Scenario: Administrator logs out
- **WHEN** an administrator opens the user menu, activates log out, and the
  auth endpoint confirms success
- **THEN** the shell clears protected state and navigates to sign-in

#### Scenario: The user menu identifies the signed-in user
- **WHEN** a session whose response names the user "Ada Editor" with the
  `editor` role opens any protected route
- **THEN** the user menu shows "Ada Editor" and "Editor" and does not show the
  user's internal identifier

#### Scenario: The session response carries no name
- **WHEN** the session response has neither a name nor an email
- **THEN** the user menu shows a neutral signed-in label instead of an
  identifier

#### Scenario: Logout fails
- **WHEN** the auth endpoint rejects the logout request
- **THEN** the shell shows the error and keeps the protected route rendered

### Requirement: Shell navigation reflects configured content
Each page model in the Pages group SHALL link directly to its singleton entry
editor when the singleton exists, and SHALL otherwise link to the content
overview where synchronization guidance is shown. Each collection model in the
Collections group SHALL link to its entry list and SHALL show the collection's
total entry count once it is known. Navigation items SHALL use the model's
label, falling back to its key, SHALL carry an icon that is hidden from
assistive technology, and SHALL mark the item matching the current location as
the current page. A failed count or singleton lookup SHALL not hide the
navigation item or block the route content. Creating, deleting, saving, or
publishing an entry SHALL refresh the affected counts and page links.

#### Scenario: A collection count is shown
- **WHEN** the entry-list totals for the `posts` collection report 12 entries
- **THEN** the Posts navigation item links to `/content/posts` and shows 12,
  and its accessible name states the entry count

#### Scenario: A page opens its singleton editor
- **WHEN** the `home` page model has a synchronized singleton entry
- **THEN** its Pages navigation item links to that entry's editor route

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
or the resource screen name for Media, Builds, Users, and Settings. Every
breadcrumb except the last SHALL be a link, and the last SHALL be marked as the
current page. A model breadcrumb SHALL use the model's label, falling back to
its configured key. While an entry title is loading or unavailable the
breadcrumb SHALL use a neutral word. Breadcrumbs SHALL never show an entry ID
or a user ID. The header SHALL remain visible at the top of the viewport while
the route content scrolls, and SHALL offer the current screen a place for its
page-level actions beside the breadcrumbs; a screen without actions SHALL leave
that place empty.

#### Scenario: A collection entry is open
- **WHEN** a user opens an entry titled "First post" in the `posts` collection
  labelled "Posts"
- **THEN** the header breadcrumbs read Content, Posts, First post, with Content
  and Posts as links and First post as the current page

#### Scenario: A page singleton is open
- **WHEN** a user opens the singleton editor of the `home` page
- **THEN** the breadcrumbs read Content and the page label, without the entry
  ID

#### Scenario: An entry title is still loading
- **WHEN** the entry has not loaded yet
- **THEN** the last breadcrumb shows a neutral "Entry" label, not the entry ID

#### Scenario: A screen places actions in the header
- **WHEN** the entry editor is open
- **THEN** its save and publication actions appear inside the header beside the
  breadcrumbs, and they leave the header when the user navigates to a screen
  that provides no actions

### Requirement: Narrow screens open navigation in a focus-safe sheet
Below the medium breakpoint the shell SHALL hide the persistent sidebar and
provide an "Open navigation" header control that opens the same navigation in
a modal sheet from the leading edge. The sheet SHALL trap focus while open,
close on Escape, on its close control, or when a navigation item is activated,
and SHALL return focus to the opening control when it closes. The shell SHALL
provide a skip link to the main content as the first focusable element, and
the keyboard order SHALL follow skip link, navigation, header, then route
content.

#### Scenario: A narrow-screen user opens and dismisses navigation
- **WHEN** a keyboard user at a narrow viewport activates "Open navigation" and
  then presses Escape
- **THEN** the navigation sheet opens with focus inside it and, on close, focus
  returns to "Open navigation"

#### Scenario: A narrow-screen user navigates from the sheet
- **WHEN** a user activates the Media item in the open sheet
- **THEN** the sheet closes and the Media route renders

#### Scenario: A keyboard user skips navigation
- **WHEN** a keyboard user presses Tab once on a protected route and activates
  the skip link
- **THEN** focus moves to the main route content

### Requirement: The sign-in screen is a focused, accessible card
The `/login` route SHALL render a centered sign-in card, outside the
authenticated shell, with the Lace name, a "Sign in" heading, labelled email
and password fields, and a submit button. The email field SHALL receive focus
when the screen opens. The password field SHALL offer a keyboard-operable
toggle whose accessible name and pressed state describe whether the password
is visible. While a sign-in request is pending the submit button SHALL be
disabled and announce "Signing in…". A rejected sign-in SHALL show the
sanitized error inside the card as an alert, keep the entered email, and
issue no navigation. A successful sign-in SHALL continue to the safe return
location, or to `/content` when none was requested.

#### Scenario: Visitor opens sign-in
- **WHEN** an anonymous visitor opens `/login`
- **THEN** the sign-in card is shown with focus in the email field and no protected navigation

#### Scenario: Password visibility is toggled
- **WHEN** the visitor activates the password visibility toggle
- **THEN** the password is shown as text and the toggle reports itself pressed with a name that offers to hide it

#### Scenario: Sign-in is rejected
- **WHEN** the authentication boundary rejects the submitted credentials
- **THEN** the card shows the error as an alert, keeps the entered email, and the visitor stays on `/login`

#### Scenario: Sign-in succeeds with a return location
- **WHEN** a visitor redirected from `/content/posts` signs in successfully
- **THEN** the admin navigates to `/content/posts`

### Requirement: Unknown admin paths render a not-found route in the shell
Any admin path that matches no admin route SHALL be handled by a protected
catch-all route. For an authenticated visitor it SHALL render, inside the
shell with its navigation, a "Page not found" state with a "Page not found"
breadcrumb and a link back to Content, and SHALL issue no protected resource
request for the unknown path. An anonymous visitor SHALL instead be redirected
to setup while installation setup is incomplete, or to sign-in after completion,
with the unknown path as the safe return location. Malformed model
keys SHALL continue to render the client not-found state without requesting
protected model data.

#### Scenario: Signed-in user opens an unknown path
- **WHEN** an authenticated editor opens `/admin/does-not-exist`
- **THEN** the shell renders with its navigation, the breadcrumb reads "Page not found", the main content shows "Page not found" with a link to Content

#### Scenario: Anonymous visitor opens an unknown path
- **WHEN** a browser without a valid session opens `/admin/does-not-exist`
- **THEN** it is redirected to setup while incomplete, or to sign-in after completion,
  with `/does-not-exist` as the return location and sees no protected content

### Requirement: Screen states are consistent and retryable
Every admin screen SHALL present loading as a named busy status with
placeholder lines, empty results as an empty state with a title, a
description, and, where the user can act, a primary action, and failures as
an alert with a sanitized description and optional request ID. Every error
state for a failed remote read that can be repeated SHALL offer a "Try again"
action that repeats the read. The access-denied state SHALL name the missing
permission and link back to Content. Empty, not-found, and access-denied
states SHALL use a decorative icon hidden from assistive technology.

#### Scenario: A remote read fails
- **WHEN** the users, token, settings-status, collection-entry, or media-list read fails for a reason other than an expired session
- **THEN** the screen shows an alert with a Try again action, and activating it repeats that read

#### Scenario: Access is denied
- **WHEN** a viewer opens `/settings`
- **THEN** the access-denied state explains that their role lacks permission and links to Content

### Requirement: Every admin route passes automated accessibility checks
The browser test suite SHALL run an automated accessibility audit using the
WCAG 2.0, 2.1, and 2.2 level A and AA rules against every admin route once it
has finished loading: setup, sign-in, the content home, a collection list, the entry
editor for a page and for a collection entry, the media library, Builds,
Users, Settings, the access-denied state, and the not-found route. It SHALL
also audit the main dialogs while they are open: the add-block menu, the media
picker, the publication confirmation, the create-user dialog, and the
build-token dialog including its once-shown token step. Any violation SHALL
fail the suite and report the rule and the affected elements. No rule SHALL be
disabled globally; a rule MAY be excluded only for a named third-party element
with a recorded reason.

#### Scenario: A route is audited
- **WHEN** the accessibility suite opens an admin route and its loading state
  has resolved
- **THEN** the audit reports no WCAG A or AA violation for that route

#### Scenario: A dialog is audited
- **WHEN** the suite opens one of the main dialogs
- **THEN** the audit of the page with the dialog open reports no WCAG A or AA
  violation

#### Scenario: A violation is introduced
- **WHEN** an admin route renders a control without an accessible name or text
  below the required contrast
- **THEN** the accessibility suite fails and names the rule and the element

### Requirement: The main editorial flow completes with the keyboard alone
An administrator SHALL be able to sign in, reach a collection from the
navigation, open an entry, add a block, save the draft, publish it through the
confirmation dialog, and open and dismiss a Users dialog using only keyboard
input. Every control reached on that path SHALL show a visible focus
indication, dialogs SHALL move focus into themselves when opened, and closing a
dialog SHALL return focus to the control that opened it.

#### Scenario: Keyboard-only walkthrough
- **WHEN** a keyboard-only administrator performs the main editorial flow
  without a pointing device
- **THEN** every step completes, each focused control shows a visible focus
  indication, and focus returns to each dialog's opener when it closes

### Requirement: Builds route supports inspection and recovery
The `/builds` screen SHALL load persisted history, show status and target version for each build, and expose a detail view with build ID, provider ID, timestamps, requester, request reason, and sanitized failure information. For a failed build or a pending build awaiting retry with an error, the detail view SHALL show a fixed reason-specific explanation, the validated source-relative entry path when supplied, and a concrete correction/next action. `source_symlink` SHALL tell the operator to replace the included link with regular source without following it; `source_unreadable` SHALL name restoring builder read/traverse access; `source_missing` SHALL name restoring the required entry; `source_special_file` SHALL name replacing the entry with a regular file/directory. Other closed codes SHALL have stage-appropriate guidance, with generic provider guidance reserved for unknown failures. The view SHALL render path text without interpreting it as markup or a navigable URL and SHALL NOT invent a path from current site identity. It SHALL use the shared admin loading, empty, error, and session recovery states. An administrator SHALL be able to request a build and retry a build whose status is `failed`, `cancelled`, `unknown`, or `accepted`; other roles SHALL see read-only information.

#### Scenario: Failed build
- **WHEN** an administrator views a failed build
- **THEN** the screen presents its specific sanitized explanation, correction, safe path when available, build ID and a retry action whose receipt refreshes history

#### Scenario: Accepted build can be retried
- **WHEN** an administrator views an `accepted`, `cancelled`, or `unknown` build
- **THEN** the screen offers the retry action, and it is absent for `pending`, `running`, and `succeeded` builds

#### Scenario: Restricted role
- **WHEN** an editor or viewer opens `/builds`
- **THEN** persisted builds and diagnostic/correction text remain visible but request and retry controls are absent

#### Scenario: Empty history
- **WHEN** no build has been claimed yet
- **THEN** the screen shows an actionable empty state for administrators and a read-only empty state for other roles

#### Scenario: Pending failure remains actionable
- **WHEN** a source failure is waiting for automatic retry
- **THEN** its detail view presents the reason, correction and correlation ID without adding a retry action or claiming publication success

#### Scenario: Corrected source publishes successfully
- **WHEN** an administrator corrects the named entry, retries the failed build and selects the resulting successful record
- **THEN** the view shows success without stale diagnostic text while the previous failed record remains inspectable

### Requirement: Build statuses explain what they prove
Builds history, Builds detail, and the entry publication details SHALL show, next to every displayed build status, an info button that opens the design-system popover, not a hover-only tooltip. The popover SHALL state what the status means, what it proves about the public site, and the next action, using one shared status description map for all seven statuses. The button SHALL have an accessible name containing the status, SHALL open and close with pointer, touch, Enter, Space, and Escape, SHALL return focus to the button on close, and SHALL keep content reachable at 375px width without horizontal page scrolling. The build-specific safe failure reason and correction SHALL remain visible beside the status rather than inside the popover only. No description SHALL claim the site was deployed from `pending`, `running`, `accepted`, `cancelled`, `unknown`, or `failed`; only `succeeded` SHALL say the build proved publication.

#### Scenario: Keyboard user inspects an accepted build
- **WHEN** a user tabs to the info button beside an `accepted` status and presses Enter
- **THEN** a popover explains the provider accepted the request, that Lace has not confirmed the public site changed, and to check the provider or retry, and Escape returns focus to the button

#### Scenario: Every status has a description
- **WHEN** Builds displays builds in each of the seven statuses
- **THEN** each status shows its own info button and popover text from the shared map, and an automated accessibility audit with an open popover reports no WCAG A/AA violation

#### Scenario: Narrow screen
- **WHEN** a user opens a status popover on a 375px wide screen
- **THEN** the popover content is fully visible and the page does not scroll horizontally
