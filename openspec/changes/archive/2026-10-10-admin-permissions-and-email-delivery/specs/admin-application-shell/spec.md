## MODIFIED Requirements

### Requirement: Role-gated shell navigation is enforced at the route boundary
The admin shell SHALL group its navigation into Pages, Collections, Library,
and Admin. Pages and Collections SHALL list the configured page and collection
models from the authenticated content-model response. Library SHALL present
Media and Builds navigation to every authenticated session holding
`content:read`. Admin SHALL present Users navigation only to a session holding
`users:manage` and Settings navigation only to a session holding
`settings:manage`, and the Admin group SHALL be omitted entirely when it would
be empty. A session without the route's permission that opens `/users` or
`/settings` directly SHALL receive an access-denied route state without the
route's protected content or controls. Navigation and route decisions SHALL
use the permission list from the validated session summary, never the role
name. Hiding navigation SHALL be treated only as a user interface affordance
and SHALL not change the API's authorization authority.

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

#### Scenario: A session holds only one administrative permission
- **WHEN** a session summary grants `settings:manage` but not `users:manage`
- **THEN** the Admin group shows Settings without Users, and `/users` renders
  the access-denied state

## ADDED Requirements

### Requirement: Admin authorization affordances derive from session permissions
The admin application SHALL load the signed-in user's identity, role and
permission list from the validated authenticated session-summary contract, and
SHALL treat a missing, malformed or unauthenticated summary as no session. Every
authorization-dependent affordance SHALL be decided by one shared permission
check against that list:

- entry editing, saving and creation require `content:write`;
- publication requires `content:publish`;
- media upload, deletion and selection into editable fields require `media:write`;
- build request and retry require `settings:manage`;
- Users requires `users:manage`, and Settings requires `settings:manage`.

The role SHALL be used only for presentation, such as the user-menu label and
user-list badges. Admin source SHALL NOT compare the signed-in session's role
with role names to decide access, and an automated repository check SHALL fail
when it does. For the existing `admin`, `editor` and `viewer` roles, every
screen SHALL expose the same affordances as before this requirement.

#### Scenario: Viewer opens an entry
- **WHEN** a session without `content:write` opens an entry
- **THEN** the editor is read-only and offers no Save, Publish or block-editing
  controls

#### Scenario: Editor opens a draft
- **WHEN** a session with `content:write` but without `content:publish` opens a
  saved draft
- **THEN** it can edit and save but is offered no Publish action

#### Scenario: Role comparison is introduced in admin source
- **WHEN** admin source outside presentation helpers compares the session role
  with `"admin"`, `"editor"` or `"viewer"` to gate behavior
- **THEN** the repository's automated admin policy check fails

#### Scenario: Session summary is malformed
- **WHEN** the session-summary response fails contract validation
- **THEN** the admin treats the visitor as signed out and renders no protected
  content
