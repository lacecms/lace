## ADDED Requirements

### Requirement: Site-build statuses state only what is proven
Every site build SHALL have exactly one of seven statuses: `pending` (queued, debounced, waiting for a retry, or not yet claimed), `running` (Lace is executing the build or tracking an accepted provider deployment), `accepted` (a provider accepted the request and its outcome is not tracked), `succeeded` (publication proven: the self-hosted release switched or a tracked provider deploy stage succeeded), `failed` (proven failure: attempts exhausted, builder failure, or tracked provider build/deploy failure), `cancelled` (the provider cancelled or skipped the deployment), or `unknown` (tracking stopped without proof). `accepted`, `succeeded`, `failed`, `cancelled`, and `unknown` SHALL be terminal. A successful provider response without a tracked deployment SHALL NOT become `succeeded`. The site's current version SHALL be the highest target version among `succeeded` builds; no other status SHALL advance it. A late provider result SHALL NOT change a terminal build, including `unknown`.

#### Scenario: Hook acceptance is not publication
- **WHEN** a deploy hook accepts a build with or without a provider deployment ID and no tracking is configured
- **THEN** the build becomes terminal `accepted`, keeps any provider ID, and does not change the site's current version

#### Scenario: Current version follows proven publications only
- **WHEN** history contains `succeeded` target 3, `accepted` target 5, and `unknown` target 6
- **THEN** the site's current version is 3

#### Scenario: Late result after unknown
- **WHEN** a provider result arrives for a tracked build already recorded as `unknown`
- **THEN** the build remains `unknown` and its completion time and diagnostics are unchanged

### Requirement: Tracked provider deployments end in an exact proven outcome
When a trigger reports a provider deployment that the runtime will track, the build SHALL stay `running` with that provider ID after its outbox event is completed, and SHALL leave tracking only through a completion naming the same build and provider ID. Completion SHALL record `succeeded`, `failed`, `cancelled`, or `unknown` with a completion time, SHALL be idempotent for the same outcome, SHALL reject a different outcome for an already terminal build, and SHALL never change another build or a build still owned by a dispatcher claim. Without tracking, acceptance SHALL be recorded as `accepted` instead.

#### Scenario: Tracked deployment succeeds
- **WHEN** a tracked build with provider ID `dep-1` is completed as `succeeded` for `dep-1`
- **THEN** it becomes `succeeded` with a completion time and a repeated identical completion changes nothing

#### Scenario: Result names another deployment
- **WHEN** a completion for build A names provider ID `dep-2` while A tracks `dep-1`
- **THEN** it is rejected and neither A nor any build tracking `dep-2` changes

#### Scenario: Conflicting completion
- **WHEN** a tracked build already completed as `succeeded` receives `failed`
- **THEN** the completion is rejected and the build stays `succeeded`

## MODIFIED Requirements

### Requirement: Claimed builds have a durable lifecycle
The system SHALL atomically claim an event and create or recover exactly one build row for that event with its target version, reason, requester, and request time, and SHALL mark it `running` with its start time at claim on every runtime. An expired lease SHALL recover the same build row through a guarded `running → running` claim, or a `pending → running` claim after a retryable failure, so no row stays orphaned. Builds SHALL transition `pending → running` at claim; `running → pending` with a sanitized error for a retryable failure; `running → succeeded` for proven synchronous success; `running → failed` for terminal failure; `running → accepted` for untracked provider acceptance; and, for a tracked provider deployment, stay `running` until it ends in `succeeded`, `failed`, `cancelled`, or `unknown`. Failed triggers SHALL be retried with sanitized errors and SHALL become terminal after eight total attempts. Stale lease results SHALL not change a recovered claim. Coalescing, debounce, retry schedule, lease duration and renewal SHALL remain unchanged.

#### Scenario: Claim starts the build
- **WHEN** a dispatcher claims an available build event on Node SQLite or D1
- **THEN** its build row is `running` with a start time before the trigger is invoked

#### Scenario: Terminated build is reclaimed
- **WHEN** the process running a claimed build terminates and its lease expires
- **THEN** a later claim recovers the same `running` row through a guarded update, keeps the original start time, and the stale claim can no longer record a result

#### Scenario: Trigger accepts untracked work
- **WHEN** a claimed trigger reports provider acceptance, with or without a provider ID, without tracking
- **THEN** the build becomes terminal `accepted` with completion time and any provider ID, and its event cannot be claimed again

#### Scenario: Trigger accepts asynchronous work
- **WHEN** a claimed trigger reports a provider deployment ID that the runtime tracks
- **THEN** the build stays `running` with that provider ID, its event is completed, and it is not claimed again by build dispatch

#### Scenario: Trigger finishes synchronously
- **WHEN** a claimed trigger reports synchronous proven success
- **THEN** the build becomes succeeded with completion time and the event cannot be claimed again

#### Scenario: Trigger fails before terminal attempt
- **WHEN** a trigger fails while retry attempts remain
- **THEN** the event is rescheduled and the same build row returns to `pending` with sanitized failure information

#### Scenario: Failure reaches attempt limit
- **WHEN** the eighth attempt fails
- **THEN** the event stops being claimable and the build becomes failed with completion time and sanitized error

### Requirement: Administrators may request and retry builds
Only an administrator SHALL be able to request a build or retry a build. Retry SHALL be accepted only from the terminal statuses `failed`, `cancelled`, `unknown`, and `accepted`. These commands SHALL return durable queue receipt information, including the current target version and whether work coalesced. Retry SHALL use the latest published-state version and record the retried build as its source; retrying a missing, `pending`, `running`, or `succeeded` build SHALL be rejected without enqueueing work. No command SHALL expose a shell command, filesystem path, or environment override.

#### Scenario: Administrator requests a build
- **WHEN** an administrator requests a build while another unclaimed event exists
- **THEN** the request coalesces into that event and returns its current target version

#### Scenario: Administrator retries a failed build after newer publication
- **WHEN** an administrator retries a failed build after the published-state version has advanced
- **THEN** the queued target is the current version and the retry source identifies the failed build

#### Scenario: Administrator retries an accepted, cancelled, or unknown build
- **WHEN** an administrator retries a build whose status is `accepted`, `cancelled`, or `unknown`
- **THEN** a new build request is queued with that build as its source and the original row is unchanged

#### Scenario: Retry of a non-retryable build
- **WHEN** an administrator retries a `pending`, `running`, `succeeded`, or missing build
- **THEN** the request is rejected and no event or build is changed

#### Scenario: Restricted actor requests a build
- **WHEN** an editor, viewer, or anonymous caller requests or retries a build
- **THEN** authorization is denied and no event or build is changed

### Requirement: Authenticated actors can inspect build history
Authenticated admin, editor, and viewer actors SHALL be able to read bounded newest-first site-build history and individual build detail. Each record SHALL include reason, one of the seven statuses, target version, requester, request/start/completion times when applicable, provider ID when applicable, and only sanitized error text. Read operations SHALL not change build state. Only administrators SHALL retain request and retry permissions.

#### Scenario: Builds exist
- **WHEN** an authenticated actor requests build history or a known build detail
- **THEN** the response contains persisted lifecycle data in newest-first history order and does not expose secrets or raw command output

#### Scenario: Unknown build
- **WHEN** an authenticated actor requests a missing build ID
- **THEN** the service returns not found without changing the queue

#### Scenario: Anonymous reader
- **WHEN** an unauthenticated caller requests build history
- **THEN** access is denied
