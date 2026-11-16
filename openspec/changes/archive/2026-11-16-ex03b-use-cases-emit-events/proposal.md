## Why

[EX3B — Use cases emit events](../../../docs/extensibility-roadmap.md#session-ex3b--use-cases-emit-events) follows [EX3A's registered enqueue path](../archive/2026-11-16-ex03a-event-registry-and-enqueue/) and [EX2D's shared repository test store](../archive/2026-11-16-ex02d-one-test-store/). The contracts are shared, but plans and runtime adapters still choose when to create events and assemble their payloads.

## What Changes

- Have the content, media, site-build and configuration-sync use cases supply typed event requests as part of their portable mutation commands.
- Compile those requests through the shared enqueue path in the same guarded SQLite transaction or D1 batch as the mutation. Make the public-state increment an explicit write separate from enqueue.
- Keep build targets and inherited retry lineage determined inside the atomic write. Preserve the commit-time checks for published entry deletion, public media references and final configuration sync.
- Preserve the existing REST, MCP and CLI outcomes, version 1 event rows, debounce, leases, retries and post-commit wake-ups. The scope covers the two registered event types. Webhooks and `entry.published` are future work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [outbox-dispatch](../../specs/outbox-dispatch/spec.md) specifies use-case ownership, guarded atomic enqueue and the existing independent media deletion events.
- [site-build-dispatch](../../specs/site-build-dispatch/spec.md) specifies which use cases request builds and which commit-time conditions control enqueue.

## Impact

`application` defines the portable event requests and supplies them on mutation
commands. Shared `db` plans bind guards, allocate event IDs through the existing
repository mechanism and compile enqueue statements. Node SQLite and the
Cloudflare adapter keep their existing executors and dispatch entry points.
The internal TypeScript mutation inputs change. The apply step updates
architecture [§6](../../../docs/architecture/workspace.md#6-repository-structure),
[§9.8](../../../docs/architecture/data-model.md#98-outbox-and-site-builds),
[§10](../../../docs/architecture/publication.md#10-content-publication) and
[§15–16](../../../docs/architecture/runtimes.md) before code. The existing
[outbox contract boundary](../../../docs/adr/0032-outbox-contract-boundary.md)
supports this dependency direction. No database migration is needed.
