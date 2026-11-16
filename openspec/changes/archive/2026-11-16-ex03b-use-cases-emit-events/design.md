## Context

`publicBuildStatements` currently increments the version and constructs
publication build requests. The media and sync plans build their own
payloads, and the Node and D1 build adapters independently select the
manual or retry reason. EX3A already provides the common compiler,
payload validation and dispatch lookup.

## Goals / Non-Goals

Put the event type and request-owned data at the application command
boundary, with explicit write ordering and one shared enqueue path.
The work stays within the [proposal's scope](proposal.md).

## Decisions

### Event requests belong to the portable command

Define the discriminated request in `application/src/ports/outbox.ts`
and carry a readonly list on the relevant commands. Derive the payload
for each type from `OutboxEnqueuePayload` in `@lacecms/contracts/outbox`. Carry the request
time in the envelope for events such as media deletion whose version 1
payload has no timestamp. Use the same actor, affected identity and clock
sample as the mutation. Required requests are part of the command
contract. A command that can legitimately skip emission supplies an
empty list when the application has no event to request.

The shared content, media and build use cases and final sync orchestration
construct the requests. REST, MCP and CLI continue to consume their
existing operation results. Keep generated event IDs with the repository
ID source. Bind that ID, the SQL guard, exact-count checks and receipt
metadata when compiling the write. Adapters forward the command and
execute the shared plan. A separate enqueue call after the command would
leave a crash window between the state change and its durable work.

### Compose the version update and enqueue explicitly

Give the version increment its own statement builder. Shared plans
place it before compilation of the supplied events when the operation
advances public state. Retire the combined publication helper that
constructs an event. Preserve the build result slots, queue receipts
and existing failure checkpoints.

| Command | Admission and ordering |
| --- | --- |
| Publish and unpublish | Keep admission and replay precedence, including link and revision checks. Apply the snapshot and route changes, bump once, then enqueue the supplied event before completing idempotency and snapshot cleanup in the same atomic unit. Generated event data is outside the idempotency fingerprint. |
| Delete entry | Use the published snapshot identity already read by the use case to select its build request. The existing revision, publication and link guards ensure that a changed publication defeats that command. A published delete enqueues before the guarded cascade, which still completes in the same write. |
| Edit media metadata | The use case knows whether descriptive values changed. The guarded write knows whether the item has a current published reference. Apply the same in-write reachability predicate to the version increment and enqueue. Avoid an additional read or an application-side decision based on a potentially stale reference count. |
| Request or retry media deletion | Retain the lifecycle and reference guards. Compile the supplied event alongside the transition to `deleting`. The object deletion remains leased asynchronous work. |
| Apply configuration sync | Use `configurationSyncAdvancesPublicState` on the final prepared report, after any block-migration replan. Both adapters already revalidate that exact report and guard the final write. Keep using the revalidated report for mutation admission and verify the event list agrees before committing. The plan compiler consumes the supplied event. Individual migration units enqueue nothing. |
| Request or retry a build | Take the retry source from the supplied request and keep retryable-status admission within the atomic write. Keep administrator authorization in the application. Omit the version increment. |

### Retain the event-specific persistence rules

Keep registry validation at the shared enqueue boundary. The build path
still reads the version inside the mutation and fills it into the payload
after any increment. Pending retry lineage, debounce and coalescing are
resolved there under the existing pending-row predicate. The specialized
build path and the ordinary guarded insert share the same entry point.
Use a generic ordinary insert for registered events with simple insertion
semantics so an additional event of that kind can use an existing
producer's command without a dedicated insert branch or runtime adapter.
Dispatch for a future event remains a separate capability.

### Report committed work from execution

Keep outbox markers on the actual inserts and coalesces. Both executors
derive the receipt from affected rows after successful commit. The Worker
continues to schedule one request-local pass for committed work, and the
Node poller and scheduled Worker dispatch continue to recover work.
Using the request list to schedule dispatch would also count a replay,
a rolled-back write or an unmatched media predicate.

## Risks / Trade-offs

- Cover both directions of a published-reference race with an admitted
  descriptive media edit. The same guard must control both writes and the
  reported result.
- Preserve build and sync receipt reads inside the atomic write. Keep the
  existing D1 query, bind and statement budgets and exercise the existing
  late-failure checkpoints on Node SQLite and local D1.
- Update direct repository test callers to pass explicit requests, and
  exercise the real use cases with the EX2D SQLite fixture. Verify package
  export inventories if a shared helper or port type changes.

## Migration Plan

Deploy the application and its matching adapters together. Version 1
event names, JSON, indexes and tables carry forward, including pending and
leased events. Rolling back the engine packages can resume the same rows
with the prior dispatcher.
