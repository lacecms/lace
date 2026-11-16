## Why

[EX3A — Event registry and one enqueue path](../../../../docs/extensibility-roadmap.md#session-ex3a--event-registry-and-one-enqueue-path) builds on the archived [EX2B shared write plans](../2026-11-15-ex02b-shared-write-plans-media-builds-outbox/). The plans still have separate event inserts, and the persisted names and payload checks are repeated across SQL, schema and dispatch code.

## What Changes

- Register `site.build.requested` and `media.delete.requested` in `@lacecms/contracts/outbox`, with a Valibot payload schema and a version for each type. The existing persisted type names and JSON shapes represent version 1.
- Route every production event insert or coalesce through `enqueueEvents` in the shared `db` plans. Keep commit-time build target selection, retry lineage, pending-only coalescing, and post-commit wake-up receipts.
- Resolve the leased dispatchers by registered event type on Node and the Worker. Validate stored payloads before external work and retire corrupt known events with a closed reason so later work can still run.
- Keep current producer ownership in the write plans. Use-case event emission belongs to [EX3B](../../../../docs/extensibility-roadmap.md#session-ex3b--use-cases-emit-events). Webhooks and new event types are future work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [outbox-dispatch](../../../specs/outbox-dispatch/spec.md) defines the registered event contracts, atomic enqueue and typed dispatch, including stored-row compatibility and failure handling.
- [site-build-dispatch](../../../specs/site-build-dispatch/spec.md) specifies commit-time build targets and retry lineage through the common enqueue path.

## Impact

`contracts` owns the event schema, `db` compiles enqueue and lease statements,
and `application` and the runtime compositions bind dispatch. Architecture
[§6](../../../../docs/architecture/workspace.md#6-repository-structure) and
[ADR 0001](../../../../docs/adr/0001-package-dependency-boundaries.md) need a
narrow exception for the outbox contract subpath before implementation, recorded
in a short ADR.
Update [§9.8](../../../../docs/architecture/data-model.md#98-outbox-and-site-builds),
[§10](../../../../docs/architecture/publication.md#10-content-publication) and
[§15–16](../../../../docs/architecture/runtimes.md) for the shared boundary. The
existing SQLite/D1 schema and migration history, REST and MCP contracts, normal
build and deletion outcomes, and dispatch timing carry forward.
