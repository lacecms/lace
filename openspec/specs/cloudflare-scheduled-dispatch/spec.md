# cloudflare-scheduled-dispatch Specification

## Purpose
Defines how the Cloudflare Worker recovers and dispatches durable outbox work
after request invocations end, using leased events, a scheduled trigger, and
best-effort post-commit dispatch within D1 query budgets.

## Requirements

### Requirement: Scheduled recovery dispatches leased outbox work
The Worker SHALL declare a scheduled trigger that runs at least every minute.
Each scheduled invocation SHALL claim available or lease-expired
`site.build.requested` and `media.delete.requested` events through the same
60-second exclusive leases, retry policy, terminal handling, and sanitized
logging as Node dispatch. A failure in one dispatcher SHALL be logged without
preventing the other from running in the same invocation.

#### Scenario: Worker ended before dispatch
- **WHEN** a publication commits and its request invocation ends without
  dispatching the build event
- **THEN** a later scheduled invocation claims the event after its debounce and
  records the build outcome

#### Scenario: A dispatching invocation is terminated
- **WHEN** an invocation holding an event lease terminates before completing it
- **THEN** a scheduled invocation after lease expiry reclaims and completes the
  event without duplicating its durable completion

#### Scenario: One dispatcher fails
- **WHEN** site-build dispatch throws during a scheduled invocation
- **THEN** media-deletion dispatch still runs and the failure is logged without
  secrets

### Requirement: Post-commit dispatch is best-effort only
After a successful publication, entry deletion, media deletion or deletion
retry, or build request or retry, the Worker SHALL register a best-effort
`waitUntil` dispatch pass that may reduce latency. That pass SHALL swallow and
log its own failures, SHALL NOT change the already-committed response, and
SHALL NOT be the only recovery path: an event it fails to process remains
recoverable by scheduled dispatch.

#### Scenario: waitUntil dispatch fails
- **WHEN** the post-commit dispatch pass throws or exhausts its query budget
- **THEN** the client response is unchanged and the event is processed by a
  later scheduled invocation

### Requirement: Dispatch invocations respect the D1 query budget
A scheduled invocation SHALL bound the number of events it claims so that its
total D1 queries, including claims, completions, and failures, stay within the
free-plan limit of 50 queries per invocation.

#### Scenario: Many events are pending
- **WHEN** more media-deletion events are available than one invocation may
  process
- **THEN** the invocation processes a bounded subset within 50 D1 queries and
  leaves the rest available for the next scheduled run

### Requirement: Scheduled runs check due tracked deployments
Each scheduled invocation SHALL, after site-build dispatch and isolated from the other dispatchers, claim at most 5 due tracked builds through a 60-second check lease and check each once. Post-commit passes SHALL NOT poll the provider. A failure while tracking SHALL be logged without secrets and SHALL NOT prevent media-deletion dispatch. Claims, check records and completions SHALL keep the whole scheduled invocation within 50 D1 queries. A Worker restart or terminated invocation SHALL lose no tracking state: a claimed but unfinished check becomes due again after its lease.

#### Scenario: Many tracked builds are due
- **WHEN** more than 5 tracked builds are due in one scheduled run
- **THEN** at most 5 are checked, the rest stay due for later runs, and the run stays within 50 D1 queries

#### Scenario: Restart during tracking
- **WHEN** an invocation claims a tracked build check and terminates before recording it
- **THEN** a scheduled run of a newly composed Worker after the 60-second lease checks the same deployment and records its outcome

#### Scenario: Tracking throws
- **WHEN** the tracker fails during a scheduled run
- **THEN** media deletion still runs and the log names only the tracking component and a closed reason
