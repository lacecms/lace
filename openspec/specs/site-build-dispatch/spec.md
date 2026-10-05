# site-build-dispatch Specification

## Purpose

Defines durable site-build requests, observable build lifecycles, and administrator recovery of failed builds across supported runtimes.

## Requirements

### Requirement: Site-build requests coalesce before claim
The system SHALL enqueue publication, manual, and retry requests through the same durable `site.build.requested` outbox event. Requests before claim SHALL use a 5-second debounce from the most recent request and target the latest published-state version. A request after claim SHALL create or coalesce the next pending event without changing the claimed target.

#### Scenario: Rapid publications coalesce
- **WHEN** several publications commit within five seconds before a build event is claimed
- **THEN** one pending event targets the newest published-state version and becomes available five seconds after the last request

#### Scenario: Publication follows a claim
- **WHEN** a publication commits after an event is claimed
- **THEN** its version is retained in a distinct pending event and the claimed build's target remains fixed

### Requirement: Claimed builds have a durable lifecycle
The system SHALL atomically claim an event and create exactly one build row for that event with its target version, reason, requester, and request time. An expired lease SHALL recover the same build row. Builds SHALL transition through `pending`, `running`, and terminal `succeeded` or `failed` with applicable start/completion times. Accepted asynchronous triggers SHALL record a provider build ID; synchronous success SHALL complete the build; failed triggers SHALL be retried with sanitized errors and SHALL become terminal after eight total attempts. Stale lease results SHALL not change a recovered claim.

#### Scenario: Trigger accepts asynchronous work
- **WHEN** a claimed trigger accepts a build and returns a provider ID
- **THEN** the build becomes running, records the provider ID and start time, and awaits a later terminal result

#### Scenario: Trigger finishes synchronously
- **WHEN** a claimed trigger reports synchronous success
- **THEN** the build becomes succeeded with completion time and the event cannot be claimed again

#### Scenario: Trigger fails before terminal attempt
- **WHEN** a trigger fails while retry attempts remain
- **THEN** the event is rescheduled and the same build row remains pending with sanitized failure information

#### Scenario: Failure reaches attempt limit
- **WHEN** the eighth attempt fails
- **THEN** the event stops being claimable and the build becomes failed with completion time and sanitized error

### Requirement: Administrators may request and retry builds
Only an administrator SHALL be able to request a build or retry a failed build. These commands SHALL return durable queue receipt information, including the current target version and whether work coalesced. Retry SHALL use the latest published-state version and record the failed build as its source; retrying a missing or non-failed build SHALL be rejected without enqueueing work. No command SHALL expose a shell command, filesystem path, or environment override.

#### Scenario: Administrator requests a build
- **WHEN** an administrator requests a build while another unclaimed event exists
- **THEN** the request coalesces into that event and returns its current target version

#### Scenario: Administrator retries a failed build after newer publication
- **WHEN** an administrator retries a failed build after the published-state version has advanced
- **THEN** the queued target is the current version and the retry source identifies the failed build

#### Scenario: Restricted actor requests a build
- **WHEN** an editor, viewer, or anonymous caller requests or retries a build
- **THEN** authorization is denied and no event or build is changed

### Requirement: Node dispatch invokes the private fixed-command builder
The Node/VPS site-build trigger SHALL send only the build ID and target version to the private builder with the dedicated secret, map its synchronous success or sanitized failure to the existing durable build lifecycle, and treat unavailable or malformed builder responses as retryable trigger failure. It SHALL accept the existing reason-only failure response and the additive bounded optional `path` field, preserve recognized builder reasons, discard unsafe optional paths, and reject unknown reasons, extra fields, inconsistent status/summary and responses exceeding 1024 UTF-8 bytes. Cloudflare SHALL use its own trigger adapter under the same application port and diagnostic/persistence rules.

#### Scenario: Builder succeeds
- **WHEN** the builder reports success for a dispatched build
- **THEN** the dispatcher may record synchronous success for that build

#### Scenario: Builder is unavailable
- **WHEN** the builder cannot be reached or returns an invalid response
- **THEN** the dispatcher records a sanitized `trigger_unavailable` failure and leaves publication committed

#### Scenario: Old builder response
- **WHEN** a builder returns its valid existing `source_invalid`, `install_failed`, `build_failed` or `version_changed` response without `path`
- **THEN** the specific reason is preserved and no path is inferred

### Requirement: Long synchronous builds retain their claim
While the Node/VPS builder call is in progress, the dispatcher SHALL renew its existing 60-second lease before expiry. Renewal SHALL be conditional on the same claim still owning the event; a lost claim SHALL not be revived or allowed to record a stale result.

#### Scenario: Build exceeds one lease interval
- **WHEN** a builder call lasts longer than 60 seconds and lease renewals succeed
- **THEN** its synchronous result can still be recorded against the original build row

#### Scenario: Claim is lost
- **WHEN** a renewal finds the event claimed by another worker or already completed
- **THEN** the stale dispatcher cannot mark that build as succeeded

### Requirement: Authenticated actors can inspect build history
Authenticated admin, editor, and viewer actors SHALL be able to read bounded newest-first site-build history and individual build detail. Each record SHALL include reason, status, target version, requester, request/start/completion times when applicable, provider ID when applicable, and only sanitized error text. Read operations SHALL not change build state. Only administrators SHALL retain request and retry permissions.

#### Scenario: Builds exist
- **WHEN** an authenticated actor requests build history or a known build detail
- **THEN** the response contains persisted lifecycle data in newest-first history order and does not expose secrets or raw command output

#### Scenario: Unknown build
- **WHEN** an authenticated actor requests a missing build ID
- **THEN** the service returns not found without changing the queue

#### Scenario: Anonymous reader
- **WHEN** an unauthenticated caller requests build history
- **THEN** access is denied

### Requirement: Known build failures retain bounded diagnostics across persistence
The closed site-build failure vocabulary SHALL be `source_invalid`, `source_symlink`, `source_unreadable`, `source_missing`, `source_special_file`, `install_failed`, `build_failed`, `version_changed`, `trigger_unavailable`, `build_timeout`, `invalid_build_event`, and `provider_failed`. Known reasons SHALL be preserved through trigger, dispatch, durable build failure and authenticated history/detail. Unknown reasons SHALL become `provider_failed`, with no associated path. Optional source paths SHALL be validated against the builder diagnostic contract at each trust boundary and SHALL be absent for non-source reasons. Invalid optional paths SHALL be discarded while preserving a recognized reason. SQLite and D1 SHALL preserve identical diagnostics and SHALL continue reading legacy reason-only errors; malformed stored diagnostics SHALL safely fall back without revealing their original contents. Outbox failure text and structured logs SHALL contain the closed reason and build/event correlation only, never raw responses, errors or subprocess output.

#### Scenario: Recognized builder failure survives dispatch
- **WHEN** a builder fails with `source_symlink` and path `src/components/linked.astro`
- **THEN** dispatch persists that reason and path in the same claimed failure update and both history and detail return them instead of `provider_failed`

#### Scenario: Failure awaits retry or exhausts attempts
- **WHEN** a recognized source failure occurs before the attempt limit or on the eighth attempt
- **THEN** the same diagnostics are readable respectively on the existing pending build or terminal failed build, preserving the current retry schedule

#### Scenario: Old or malformed stored error
- **WHEN** either runtime reads a legacy `install_failed` error or malformed/unknown structured error
- **THEN** the legacy row returns `install_failed` without a path and the malformed/unknown row returns only `provider_failed`

#### Scenario: Path attempts to leak a configured location
- **WHEN** a trigger or stored diagnostic supplies a recognized source reason and an absolute, escaping, excluded or overlong path
- **THEN** the recognized reason remains available but no path or raw value reaches persistence output or authenticated DTOs

#### Scenario: Claim ownership changes
- **WHEN** a stale dispatcher tries to record a result after its claim is recovered
- **THEN** it changes neither the recovered lifecycle nor its diagnostics

#### Scenario: Retry succeeds
- **WHEN** corrected source builds successfully on the retained claim or a new administrator retry
- **THEN** success carries no stale failure diagnostic and the original failed row remains unchanged when a new retry row was created
