## Context

The repository facades delegate entry writes to the `entries.ts` modules of
each platform. D1 already has guarded batches and tracks affected outbox
statements through `MutationBatch.addOutbox`. Node checks changes inside a
synchronous transaction. Both already consume set-based builders for
publication projections, link projections and retention from `@lacecms/db`.
The configuration-sync migration statement builder provides the precedent
for representing a predicate and ordered mutations as data.

The complete-draft, publication and deletion commands already carry the
validated inputs and guards through application ports. The existing command
ports, application authorization, repository facades and two-snapshot model
provide the interface around the new persistence path.

## Goals / Non-Goals

**Goals**

- Define each migrated command's SQL, admission rules, order and result slots
  in one package and apply the same rules on both runtimes.
- Keep the shared definition usable by later mutations with different guards
  and receipts. Keep connection handles, clocks and ID providers in their
  existing layers.

**Non-Goals**

- Generalizing the application ports into a transaction interface or a SQL
  DSL. The plan models the supported SQLite dialect directly.
- Moving presentation, configuration planning, storage effects or transport
  authorization into the executor. The proposal gives the session boundary.

## Decisions

### Shared plans and platform executors

Place the plan types in a dedicated `db` domain and the builders beside the
existing entry, publication and build SQL. A plan contains an admission
predicate and its bound parameters, typed guard diagnostics, ordered SQL
statements and parameters, expected affected-row counts where exact counts
matter, named result slots, and an outbox marker for enqueue and coalesce
statements. Keep any SQL condition slots explicit and bind ids, times and
content as values. Use the package root to expose the builders and types
needed by the two platforms. Platform dependencies continue to point toward
`db`, and `application` remains independent of persistence.

- Node evaluates admission inside the same write transaction as the plan
  statements. It executes the plan and checks exact counts before committing.
  It returns a receipt only after the outer transaction returns successfully.
- D1 compiles admission to the first guarded write in one `batch()`. Use a
  batch-unique row in the existing `mutation_guards` table and remove that
  row inside the batch. Every dependent write is gated on admission. For
  publication the dependent writes also require the newly inserted snapshot
  as described in the publication delta. Use affected-row counts and named
  read slots to decode the receipt. An exact-count invariant that is not
  guaranteed by the admitted predicates and constraints needs an in-batch
  assertion so a mismatch aborts before commit.
- Keep the existing named fault checkpoints, including checkpoints after
  outbox work is staged. Inject the D1 fault inside the batch. Use the 100
  bound-parameter, 40 batch-statement and 50 invocation-query ceilings when
  compiling and testing bounded plans. Reuse the chunked block and media
  inserts, including the guard overhead in the bind count.

A driver-neutral transaction callback cannot run on D1. A D1 executor that
discards a result after discovering a failed invariant in committed metadata
cannot roll back the writes. A separate preflight without a commit-time
guard leaves races between validation and mutation.

### Typed outcomes come from the guarded database unit

Use shared predicates for both admission and diagnosis. On D1 a diagnostic
read for a failed admission can run inside the batch before any dependent
write. On Node read equivalent evidence in the transaction. This binds
classification to the state that rejected the mutation. Pass structured
link-target rows, link-removal evidence and live idempotency data through
typed result handling where the existing helpers need them.

- Create checks the model, singleton occupancy and availability of draft
  media. A duplicate additionally checks source existence and revision.
  Persist the current model's stored schema version in the new draft and
  keep revision-one creation intact.
- Save checks the mutable draft pointer, expected revision and availability
  of all referenced active media. Use a bounded set-based check across the
  complete reference set, then replace the blocks and reference projections
  and advance the draft revision exactly once.
- Publish gives live idempotency handling priority over the stale-draft
  result, then validates delivered link targets and checks route ownership.
  Keep the route and singleton indexes as relational integrity constraints.
- Unpublish checks live idempotency, current publication identity and link
  removal evidence. Retain the existing distinction between already
  unpublished and a different current publication. Delete checks current
  publication identity, link-removal evidence and the expected draft revision.
  Preserve the application authorization and the actor-scoped acknowledgment
  rules that the guards protect.

Apply the existing portable error codes to typed misses using the established
messages and issue details. Scope driver-error simplification to migrated
entry paths. Existing unmigrated writers still use `sqliteWriteError` where
appropriate. Keep unexpected statements and commit faults on the portable
invalid-state path. Driver-message matching for expected conflicts is brittle
and loses the precedence between competing failure reasons.

### Publication, receipts and idempotency

Share the guarded snapshot copy, raw and projected block and reference
writes, link-graph changes, route handling, pointer update, retention, and
idempotency writes. Keep route-less entries route-less. Keep draft-only
deletion on a path with zero public-state or build writes.

Use the existing snapshot mappers and projection helpers to materialize
publication results. Make response JSON a bound input to the shared record
statement. Node can prepare the response from the state read inside its
transaction. D1 prepares it from its pre-batch materialization, with the
validated draft identity and revision rechecked for publication inside
admission. Keep the existing result fidelity checks for both strategies,
including SEO, blocks, actor, timestamps, and projected fields. Preserve
the existing actor scope, fingerprint conflict, live/expired cutoff and
expired-key replacement. For a live replay return the stored response without
reporting a fresh version or outbox write. A post-commit idempotency insert
would allow a committed publication to lose its replay record.

### Public-state version and outbox handoff

Share the public-state and enqueue statement group used by the migrated
commands. Use the existing D1 set-based SQL semantics during this session so
the event version comes from the public-state row changed by the plan. Keep
the debounce, pending-only coalescing, retry lineage, reason and nullable
snapshot identity. Read the receipt within the same atomic unit. Base
`committedOutboxWork` on affected rows from marked statements after the
transaction or batch succeeds. D1 feeds it to the existing request-local
outbox registration. The Node dispatcher continues polling. Dispatch
registration remains a post-commit effect and scheduled recovery remains
available.

EX2B will reuse the plan, guard, row-count, result and outbox contracts for
media, build and dispatcher operations. It owns replacing SQL payload
construction with one JavaScript path, preserving commit-time version and
coalescing behavior. EX2C depends on those primitives for its public-state
and build writes. It will translate the existing semantic synchronization
operations to persistence statements in `db`, keeping the application
planner, CLI reporting and runtime-specific freshness evidence portable.
Resumable block migration units and the final atomic synchronization mutation
retain their separate boundaries. These follow-ups depend on the resulting
interfaces, so their OpenSpec changes follow EX2A and EX2B in delivery order.

### Trusted list policy at composition

Require `listQueryLimits` in the `ContentUseCases` dependency type and check
for absence at construction, including JavaScript callers. Remove implicit
Node arguments from application query validation and resolution. The Node
and Worker production compositions already pass their policies through
`composeLaceServices`. Supply explicit policies in the direct application,
MCP, server, admin e2e and shared test compositions. Keep repository-side
policy enforcement for direct calls and keep request and configuration input
from selecting a policy. Retain existing constants and the compatible
wire-schema decoding of older responses. Moving runtime defaults into a
request schema or accepting an omitted policy would conceal a missing
composition dependency.

## Risks / Trade-offs

- Guard and diagnostic SQL counts toward D1 limits. Run maximum create and
  save, projected publication and failure-path cases against actual local D1.
- Existing SQL constraint and deferred commit faults must still roll back.
  Run cases with real SQL failures along with checkpoint-driven failures.
- A callback triggered by a prepared or zero-change outbox statement would
  schedule spurious work. Cover insert, coalesce, replay, guard miss and
  rollback independently.
- D1 captures a publication response before the batch. Preserve the
  existing runtime distinction from Node for when result values are
  materialized and pin immediate-load parity in shared fixtures.

## Migration Plan

Use existing tables, indexes, TTLs and JSON contracts. No migration or
backfill is required. Either runtime can deploy with the existing database.
Rollback restores the previous runtime code against the same persisted
schema and outbox/idempotency formats.
