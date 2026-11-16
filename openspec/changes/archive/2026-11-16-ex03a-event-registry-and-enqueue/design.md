## Context

The current `db` plans share the build enqueue group and have a separate media
deletion insert. The build group fills the target version and inherited retry
source from state inside the atomic write. Site builds use a dedicated claim
that starts or recovers a build row. Media deletion uses the generic lease port
and completes metadata removal under a lease-and-media guard. These claim
protocols serve distinct aggregate transitions and remain in use.

## Goals / Non-Goals

Provide one source for durable event identity and payloads across SQL, plan
inputs and dispatch. Keep persistence guards in `db` and external effects in
`application`, wired through the existing runtime composition roots. The
[proposal](proposal.md) defines the session boundary.

## Decisions

### Contract entry point and package boundaries

Add a portable `@lacecms/contracts/outbox` entry point that exports the two
type constants, registry descriptors, and schema-derived event and payload
types. Key the descriptors by the type constants and use the same constants
in SQL. The subpath imports no transport DTOs or OpenAPI metadata. `application`
uses it for typed dispatch. `db` uses it for enqueue input validation, stored
payload decoding, and schema and query predicates. Compose dispatch from
`application` so platform packages need no additional dependency edge.

Architecture §6 currently prohibits an `application` dependency on `contracts`
and omits this edge for `db`. Start apply by recording a narrow exception in
§6 and a short ADR linked from ADR 0001. Enforce that exception at the subpath
level in the boundary checker, including its application import allowlist.
Keep REST and MCP DTO imports outside `application` and `db`. A registry in
`application` would move persistence schema ownership there and make the
contracts package depend on use-case and port code. A new shared package would
add another published artifact for two schemas already covered by the
roadmap's chosen package.

### Write and read forms of version 1

Give each descriptor the numeric version `1`. The current persisted type
selects that descriptor. Writers keep the current JSON layout. Read schemas
allow extra fields, legacy media without `requestedBy`, and build requests
without `publishedSnapshotId`. Consume only declared fields. Keep nonempty
historical build reasons valid, including `configuration_sync` and
`media_metadata`, and preserve the existing missing-snapshot handling on
claim. Invalid values in declared optional fields fail validation when present.

Derive enqueue schemas from the same field definitions. Require `requestedBy`
for media writes and an explicit nullable `publishedSnapshotId` for build
writes. A build producer supplies request-owned fields, while the atomic SQL
supplies `targetVersion` and any inherited `retryOfBuildId`. Keep the two
database-derived fields typed and exercise the complete written payload against
the read schema on both database adapters. An application-side
version or retry-source read ahead of the write would open a race with a
publication, retry or claim.

### Shared enqueue compiler

Place `enqueueEvents` in `db` at the write-plan boundary. It accepts typed
requests with their guards, IDs and timestamps, validates request-owned
fields before executing the plan, and compiles the ordered insert or coalesce
statements. Move the durable insert SQL behind this compiler. Keep the
publication helper responsible for incrementing public state before calling
enqueue. Use the same compiler from publication, unpublication, published
entry deletion, public media-metadata edits, public configuration sync,
manual build and build retry, and media deletion and deletion retry.
Keep existing exported plan helpers as entry points where callers rely on
them and have them call the same compiler. Retain checkpoint names used for
rollback tests, expected change counts, and receipt slots.

Keep build admission and the common pending predicate backed by the existing
partial unique index. The specialized build branch updates only an eligible
pending row, preserving its event ID and attempts and computing the queue
receipt inside the atomic write. Inherit a nonempty retry source using a
`json_valid`-guarded extraction so malformed JSON in an unclaimed row cannot
block a new valid request. A candidate that wins the claim race retains its
version and payload. Media deletion inserts under its existing `deleting`
transition guard, with an exact count and no coalescing.

Use registry constants in live SQL that inserts, filters, renews or matches
event types. Bind values where practical and use a registry-derived SQL
literal for the Drizzle partial-index predicate. Verify that the migrated
predicate agrees with the live schema and uniqueness behavior. Published
migrations and snapshots remain the historical inputs to this check. Use
outbox markers on the affected inserts and coalesces so both executors can
report committed work through the current request-local Worker hook.

### Type lookup and invalid rows

Bind the two existing dispatcher instances in one `application` table keyed
by the registry event type. Require an entry for each registered type at
compile time and let both compositions resolve their existing runners through
that table. Keep current polling lanes, Worker batch limits, dispatcher log
names and error isolation. Scheduled tracking stays between the scheduled
build and media passes. The post-commit pass keeps its current media pass,
build debounce wait and build pass.

Decode build candidates with the registry in the shared claim builder before
returning the typed build lease. Use the current guarded build retirement for
invalid rows. On the generic claim path, use the registry for known media
rows before projecting a lease. For an invalid candidate, emit a guarded
terminal update in its existing statement position, match the observed type,
payload and eligibility, and return no lease for that candidate. Write the
event diagnostic and clear the lease in that single update. Keep the generic
lease contract for callers explicitly filtering other event types. The media
handler uses the registry to narrow the generic lease from its port before
deriving a media ID, including when composed with a test or custom port.
Invalid rows are terminal outbox outcomes. Aggregate changes still require
valid claim and identity data.

Lease retirement and claim must compare against the observed raw JSON, since
normalized payloads can discard legacy fields and can differ in serialization.
The raw value stays in the claim guard. Expose only the closed reason and event
correlation in diagnostics. Claimed valid media keeps the existing idempotent
object deletion and lease-guarded metadata finalization. Claimed valid builds
keep renewal, retry and provider tracking behavior.

## Risks / Trade-offs

- Decode and retire invalid work within the existing candidate caps. A mixed
  batch with invalid rows must allow eligible valid work to proceed and keep
  the Worker within 100 binds per statement, 40 statements per mutation batch
  and 50 queries per scheduled invocation.
- A candidate can change between the D1 read and guarded batch. Exercise both
  claim/coalesce orderings and a stale invalid candidate against a changed
  payload and a competing lease.
- Check the packed contracts subpath and its transitive imports in the actual
  SQLite and Worker targets. Keep the package, module and test layout checks
  active for the new entry and tests.

## Migration Plan

Deploy against the existing SQLite/D1 tables and partial index. Existing and
new valid rows use the same type names, lease state and version 1 JSON shape,
so either runtime can resume pending or expired work across upgrade and
rollback without rewriting it. A row already retired as invalid remains
terminal after rollback. A future incompatible payload version will need its
own persisted discriminator and compatibility plan.
