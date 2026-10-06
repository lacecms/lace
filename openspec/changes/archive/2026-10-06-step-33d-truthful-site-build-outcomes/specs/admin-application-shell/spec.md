## ADDED Requirements

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

## MODIFIED Requirements

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
