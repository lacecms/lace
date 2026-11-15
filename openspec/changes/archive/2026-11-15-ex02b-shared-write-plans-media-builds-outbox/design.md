## Context

EX2A's ordered plans carry admission, statement order, result slots, affected
row counts and outbox markers. Node executes them in an immediate SQLite
transaction. D1 compiles them to one guarded atomic batch. The media,
site-build and dispatcher adapters still assemble their own mutations. The
shared entry plans also use a build enqueue fragment that constructs JSON
in SQL.

## Goals / Non-Goals

Define each migrated mutation in `@lacecms/db`, with identical admission and
result handling for the two adapters. Keep the SQL plans independent of
drivers, clocks, ID generators, request registration, object storage and
provider calls. The [proposal](proposal.md) defines the session boundaries.

## Decisions

### Shared execution and receipts

Place builders beside the existing `db` media, build and outbox SQL. Expose
the required builders through the package entry and have platform repositories
supply IDs, timestamps and any candidate rows. Reuse the EX2A plan shape and
executor code. Map affected rows and typed guard outcomes to the existing
port results and portable errors. Retain existing checkpoint names where
contract fixtures inject failures. Require rollback for unexpected statement,
count or commit failures. Prove exact counts with the admitted predicates
and uniqueness constraints where possible, and assert them before commit
where they cannot be proved.

Claim operations have independent guards per candidate within one atomic
unit. Keep Node's candidate read inside the write transaction and D1's
bounded candidate read before the batch. In D1, use each candidate's
conditional lease update as its admission and gate dependent writes on that
event and the new lease ID. Decode lease results from affected rows. An outer
token plus a token per candidate would consume the existing D1 batch budget.
Keep claims in available-time then ID order and preserve the caps of 10 build
leases and 20 generic dispatcher leases per call. Share provider-check guards
and result handling with their existing due-check order and limit.

Only an affected, committed insert or coalesce is marked as new outbox work.
Keep Worker request-local registration at the existing post-commit boundary,
with one `waitUntil` pass per request. Leasing, renewal, completion,
rescheduling, replay and guard misses produce no enqueue receipt. Node
keeps polling and scheduled Worker dispatch keeps recovering unfinished work.

### Build payload construction and coalescing

Serialize the request fields once in JavaScript in `db`, including the
nullable snapshot ID and any explicit retry source. The shared enqueue
statements bind that JSON and fill only the values that depend on the state
inside the atomic write. Use SQLite JSON field updates for `targetVersion`
and for an inherited `retryOfBuildId` when the request supplied no explicit
source and the coalesced row has a retry source. Omit the optional retry
field when there is no source. The target is the singleton version after the
optional bump, or the current version (zero for a missing singleton) for a
manual request or retry. The receipt reads the event ID, coalesced outcome
and version from the same atomic unit.

Reuse the existing pending-row predicate and partial unique index. Insert a
new event or update the eligible pending event's payload and availability,
preserving its ID and attempts. Keep the five-second debounce from the
current request and explicit retry-source precedence. If a claim wins the
race, the enqueue targets the next pending event and the claimed payload
stays fixed. A claimant must still match its observed payload and current
eligibility to acquire the lease. An application-side read of the version
and retry lineage before the D1 batch would require guarding and retrying the
whole command on unrelated writes. Binding the two database-derived values
inside the shared SQL preserves the single-batch behavior and its budget.

Migrate both the EX2A entry fragment and the remaining runtime enqueue
helpers to this group. Append the group to the existing final configuration
sync transaction or batch for public changes, with its existing freshness
guard and `configuration_sync` reason. Leave sync operation planning and
the resumable batch boundaries to EX2C. Remove the `json_patch` build payload
path when its callers use the common group.

### Media and dispatch transitions

- Media creation writes the metadata row, content hash and normalized tags
  together. The application retains object upload and compensation on
  metadata failure. Metadata edits guard active status and `updated_at`.
  Replace tags under that guard and evaluate current published usage in the
  same atomic unit. A descriptive edit affecting public output increments
  the version and queues `media_metadata`. Tags-only edits and edits of
  unused media return the media without a target version.
- A deletion request or explicit retry checks the required media state and
  indexed absence of references. It sets `deleting` and inserts its own
  `media.delete.requested` event with the existing payload. Finalization
  checks the live event lease, matching media identity, `deleting` status
  and absence of references, then removes tags and metadata and completes
  the event. A retryable failure reschedules the event. A terminal failure
  records sanitized diagnostics on both the media and event atomically.
  Object deletion remains an idempotent external effect under dispatcher
  control.
- Build requests validate a retry's eligible source status at admission.
  Claims keep the original start time when recovering a build, dispose of
  invalid payloads and stray terminal events, and return only builds that
  enter or remain `running` under the new lease. Renewals keep the same live
  lease. Trigger outcome plans commit the build and event together, including
  sanitized retry and terminal failure details. Provider tracking writes
  retain their provider identity, status and completed-event guards,
  idempotent terminal completion, and independent check schedule.
- Generic dispatcher plans preserve event type filtering, due-time and
  expiry boundaries, and attempt bookkeeping. Completion and retry require
  the current live lease. Share predicates with related plans where their
  conditions match. Keep the existing retry policy in `application`.

## Risks / Trade-offs

- D1 statement overhead grows with claim size and per-event writes. Preserve
  the 100-bind and 40-statement batch limits and measure the 50-query Worker
  invocation limit with claims, completions, failures, and scheduled check
  work included. Use the existing budget suites and test the maximum claim
  sets and tag replacement. Keep existing dispatch limits and recovery policy.
- Publication, media edits, build requests and claims can race each other.
  Exercise both claim/enqueue orders and retry-source inheritance across
  runtimes. Verify committed payload, version, deadline and receipt together.
- A failure after staging outbox work must roll back the related state.
  Exercise real statement failures inside the atomic unit and verify no
  post-commit wake-up occurs. Test a stale lease against a recovered build
  and a recovered media deletion, including retry and terminal outcomes.

## Migration Plan

Deploy either adapter against the existing tables, indexes and JSON formats.
Contract cases should claim events and resume builds written by the previous
version. Rollback uses the existing persisted rows with the previous adapters.
