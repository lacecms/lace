## MODIFIED Requirements

### Requirement: Builds route supports inspection and recovery
The `/builds` screen SHALL load persisted history, show status and target version for each build, and expose a detail view with build ID, provider ID, timestamps, requester, request reason, and sanitized failure information. For a failed build or a pending build awaiting retry with an error, the detail view SHALL show a fixed reason-specific explanation, the validated source-relative entry path when supplied, and a concrete correction/next action. `source_symlink` SHALL tell the operator to replace the included link with regular source without following it; `source_unreadable` SHALL name restoring builder read/traverse access; `source_missing` SHALL name restoring the required entry; `source_special_file` SHALL name replacing the entry with a regular file/directory. Other closed codes SHALL have stage-appropriate guidance, with generic provider guidance reserved for unknown failures. The view SHALL render path text without interpreting it as markup or a navigable URL and SHALL NOT invent a path from current site identity. It SHALL use the shared admin loading, empty, error, and session recovery states. An administrator SHALL be able to request a build and retry a failed build; other roles SHALL see read-only information.

#### Scenario: Failed build
- **WHEN** an administrator views a failed build
- **THEN** the screen presents its specific sanitized explanation, correction, safe path when available, build ID and a retry action whose receipt refreshes history

#### Scenario: Restricted role
- **WHEN** an editor or viewer opens `/builds`
- **THEN** persisted builds and diagnostic/correction text remain visible but request and retry controls are absent

#### Scenario: Empty history
- **WHEN** no build has been claimed yet
- **THEN** the screen shows an actionable empty state for administrators and a read-only empty state for other roles

#### Scenario: Pending failure remains actionable
- **WHEN** a source failure is waiting for automatic retry
- **THEN** its detail view presents the reason, correction and correlation ID without adding a failed-build retry action or claiming publication success

#### Scenario: Corrected source publishes successfully
- **WHEN** an administrator corrects the named entry, retries the failed build and selects the resulting successful record
- **THEN** the view shows success without stale diagnostic text while the previous failed record remains inspectable
