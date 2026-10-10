# admin-introductory-tour Specification

## Purpose

Defines an optional browser-admin introduction that teaches workflows available
to the current user and remembers dismissal without interfering with editing.

## Requirements

### Requirement: First authenticated use offers an optional introduction
The authenticated admin SHALL offer Start tour and Skip in a non-modal welcome
panel when the current installation/user/tour-version scope has no completed or
dismissed record. It SHALL NOT offer or render the tour before session resolution
or on anonymous setup/sign-in screens. The offer SHALL NOT steal keyboard focus,
block navigation, or require completion before ordinary work. Starting the tour
SHALL open its first step; Skip SHALL dismiss the offer.

#### Scenario: New user opens the admin
- **WHEN** a resolved authenticated user opens a protected route without a saved tour record
- **THEN** Start tour and Skip are available while the route remains usable and initial focus is not moved by the offer

#### Scenario: Anonymous or unresolved session
- **WHEN** a visitor is anonymous or the session guard is still pending
- **THEN** no introduction offer, tour content, or replay control is rendered

#### Scenario: User continues working
- **WHEN** a user ignores the introduction offer and edits or navigates
- **THEN** the normal workflow remains available without completing the tour

### Requirement: Tour content matches navigation and effective role permissions
Tour steps SHALL use the current shell navigation and the resolved session
permissions, never the role name. Pages and Collections SHALL be included only
when their respective navigation groups exist. Content guidance SHALL explain
saved drafts and published content. Guidance for sessions with `content:write`
SHALL describe editing and saving, guidance for sessions with
`content:publish` SHALL describe publication, and guidance for sessions without
`content:write` SHALL describe read-only inspection. Media SHALL describe
browse/preview for every session and upload/reuse in editable fields only for
sessions with `media:write`. Builds SHALL describe history/status for every
session and request/retry only for sessions with `settings:manage`. Users SHALL
appear only for sessions with `users:manage`. Settings, including build-token
creation, once-only plaintext display, and published-export read scope, SHALL
appear only for sessions with `settings:manage`. Guidance SHALL NOT instruct a
user to perform an unavailable action or present inaccessible route links.
Existing API authorization SHALL remain authoritative and the tour SHALL issue
no mutation requests.

#### Scenario: Administrator starts a tour with both model kinds
- **WHEN** an admin starts the tour with Pages and Collections navigation available
- **THEN** it explains those groups, draft/save/publication, Media, Builds with request/retry, Users, and Settings with build-token creation

#### Scenario: Editor starts a tour
- **WHEN** an editor starts the tour
- **THEN** it explains draft editing/saving, media browsing/upload/reuse, and build inspection without publication, build request/retry, Users, Settings, or token-creation instructions

#### Scenario: Viewer starts a tour
- **WHEN** a viewer starts the tour
- **THEN** it describes read-only content, media preview, and build inspection without instructions to save, publish, upload, select media into editable fields, request/retry builds, manage users/settings, or create tokens

### Requirement: Introductory controls preserve the current work
The tour SHALL provide Back and Next between steps, Finish on the last step,
and Skip or Close throughout, including Escape dismissal. It SHALL expose a
named current step and position, prevent movement beyond the sequence bounds,
and remember Finish as completed and Skip/Close/Escape as dismissed. Every
authenticated role SHALL have a keyboard-operable Introduction action in the
account menu that replays from the first step even after completion/dismissal.
Starting, progressing, closing, or replaying SHALL NOT navigate away, change URL
search state, submit a form, or change an unsaved draft.

#### Scenario: User goes back and finishes
- **WHEN** a user advances, goes Back, then reaches the last step and activates Finish
- **THEN** the sequence follows its bounds, the tour closes, and completion is recorded

#### Scenario: User dismisses and replays
- **WHEN** a user dismisses with Escape and later activates Introduction in the account menu
- **THEN** the dialog reopens on its first available step despite the saved dismissal

#### Scenario: Tour opens over an unsaved draft
- **WHEN** an editor replays the tour while editing an unsaved entry
- **THEN** the URL and draft remain unchanged after Next, Back, and Close, and no save, publish, or other mutation request is sent

### Requirement: Completion is isolated by installation and user with graceful storage fallback
Completion/dismissal SHALL be browser-local, scoped to the installation's origin
and admin base path, authenticated user ID, and explicit tour version. It SHALL
persist across reload/sign-out/sign-in for that scope when local storage works,
without syncing to another browser/device. Role changes SHALL NOT erase the
record; replay SHALL use current permissions. Only a small versioned completion/
dismissal marker SHALL be stored, without credentials, tokens, emails, or content.
Missing, malformed, or unsupported records SHALL be treated as unseen. If storage
access fails, in-memory dismissal/completion SHALL suppress repeat offers for
that scope during the current document lifetime, including shell remounts;
reload MAY offer again, and manual replay SHALL remain available. No storage
failure SHALL block editorial work. Independent tabs SHALL write whole records
without requiring shared step progress or synchronous dialog closure.

#### Scenario: Returning user signs in
- **WHEN** a user returns to the same origin/base path/version after completing or dismissing the tour with working storage
- **THEN** the welcome offer stays hidden and manual replay remains available

#### Scenario: Another user or installation is opened
- **WHEN** a different user signs in, or the user opens a different origin or admin base path
- **THEN** the prior scope's marker does not suppress that scope's first-use offer

#### Scenario: Storage is denied
- **WHEN** storage reads or writes throw and the user dismisses the offer or finishes the tour
- **THEN** no error blocks the route, the offer remains suppressed across route/shell remounts for the current document, and Introduction still replays the tour

#### Scenario: Record is invalid or reset
- **WHEN** the record is malformed, unsupported, removed, or belongs to a different tour version
- **THEN** the current scope is treated as unseen without crashing or granting permissions

#### Scenario: Two tabs finish independently
- **WHEN** one tab completes while another tab dismisses the same versioned tour
- **THEN** the final stored whole record suppresses subsequent first-use offers and neither tab changes protected data

### Requirement: Tour remains coherent during model and identity changes
Pending or failed model reads SHALL NOT manufacture Pages/Collections steps or
block the tour's common role-appropriate steps or editorial work. Empty models
SHALL leave the content overview guidance available without model-group steps.
The active sequence SHALL respond to resolved model/role changes, preserve its
current step by stable identity when it remains available, and select a valid
remaining step when it disappears. A resolved role downgrade SHALL immediately
remove privileged text and controls. A user identity change SHALL reset transient
progress and load the new user's scope; sign-out or session loss SHALL remove
the tour with the protected shell without recording completion for another user.

#### Scenario: Models load slowly or fail
- **WHEN** model navigation is pending or unavailable when the tour starts
- **THEN** common Content, Media, and Builds guidance remains usable with the role's allowed admin guidance and no invented model-group steps

#### Scenario: No models are configured
- **WHEN** the successful model read contains no models
- **THEN** Content explains the empty overview without directing the user to a nonexistent page or collection

#### Scenario: Models become available
- **WHEN** a model read resolves while the tour is on Media
- **THEN** actual navigation groups enter the sequence, Media remains the current step, and the reported position/total are updated

#### Scenario: Administrator becomes a viewer
- **WHEN** the resolved current session changes from admin to viewer while Settings is the active step
- **THEN** admin-only steps and writer instructions disappear immediately and the dialog selects a valid read-only step

#### Scenario: Account changes or signs out
- **WHEN** the current resolved user changes or the protected shell is removed for session loss
- **THEN** previous transient tour state is discarded and no previous user's progress is applied to the new user

### Requirement: Tour is accessible across screen sizes
The tour SHALL use a labelled dialog with keyboard-operable controls, visible
focus, focus containment, Escape dismissal, and an announced step heading and
position. Opening SHALL move focus into the dialog; closing a replay SHALL
return focus to its still-visible account-menu trigger, or the narrow-screen
navigation opener when its sheet has closed; closing a first-use tour SHALL
return focus to Start tour if present, otherwise a meaningful shell control.
Mobile replay SHALL close the navigation sheet before opening the tour. At
375px width the offer and every step SHALL fit without horizontal scrolling,
with long text scrollable and controls reachable. Nonessential motion SHALL
respect reduced-motion preference. The welcome panel and tour SHALL pass the
existing WCAG 2.0/2.1/2.2 A/AA axe rules without global rule exclusions.

#### Scenario: Keyboard-only replay
- **WHEN** a keyboard user opens Introduction, advances, goes Back, and presses Escape
- **THEN** focus stays visibly inside the open dialog, step changes are announced, and closing returns focus to the appropriate visible shell trigger

#### Scenario: Narrow-screen replay
- **WHEN** a user at 375px width starts Introduction from the navigation sheet
- **THEN** the sheet closes before the tour takes focus and all tour text and controls remain reachable without horizontal overflow

#### Scenario: Reduced motion and accessibility audit
- **WHEN** the welcome panel and open tour are audited with reduced motion enabled
- **THEN** nonessential motion is suppressed and no applicable WCAG A/AA violation is reported

### Requirement: Publication guidance distinguishes content state from served-site updates
Guidance SHALL explain that saving changes a draft, publication makes a snapshot
available to published-content consumers, and the served site's update depends
on its rendering/build setup. It SHALL explain recorded build statuses without
claiming publication guarantees immediate site refresh or successful deployment,
and its status wording SHALL match the shared build status map: only
`succeeded` proves publication, `accepted` means a provider accepted the request
without tracked outcome, and `cancelled`, `unknown`, and `failed` can be
retried by an administrator. It SHALL use Step 29's verified mode guidance:
Astro dev shows published changes to existing pages on reload and needs a
restart for new or renamed URLs, a manual static site needs a fresh build and
deployment, and automatic builds serve content after a succeeded build. It
SHALL NOT prescribe restarting Astro development after every publication and
SHALL NOT offer build-source selection.

#### Scenario: Publication is explained before mode verification
- **WHEN** an admin reaches publication or Builds guidance and Admin cannot know which site mode the operator uses
- **THEN** guidance distinguishes publishing from site updating, summarizes the verified dev, manual static and automatic build behavior, and suggests inspecting build status without promising immediate deployment

#### Scenario: Tour describes acceptance truthfully
- **WHEN** any role reaches the Builds tour step
- **THEN** it names the seven statuses consistently with the status popovers and states that acceptance by a provider does not prove the site was published
