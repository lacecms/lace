## Why

[EX2B — Media, builds and outbox](../../../../docs/extensibility-roadmap.md#session-ex2b--media-builds-and-outbox) follows the archived [EX2A entry write plans](../2026-11-15-ex02a-shared-write-plans-entries/). Node SQLite and D1 still assemble separate media, build and dispatcher mutations, and D1 constructs build event payloads separately from the Node enqueue path.

## What Changes

- Move media metadata creation, metadata and tag edits, deletion requests and retries, and lease-guarded deletion finalization and failure to shared `@lacecms/db` write plans.
- Share the plans for build requests and retries, claims, renewals, trigger outcomes, provider tracking writes, and generic outbox claims, completion and rescheduling.
- Use one JavaScript build payload constructor and a common enqueue group for manual requests, entry publication and removal, media metadata changes, and the public-state step of configuration synchronization. Preserve commit-time version selection, pending-only coalescing and retry lineage.
- Retain the existing application ports, authorization, errors, lease and retry policies, queue receipts, and post-commit Worker wake-up. EX2C owns the remaining configuration synchronization writes. EX2D owns the test store and author lookups. EX3 owns the event registry, dispatch lookup and use-case event emission.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The roadmap's behavior-preserving workflow uses `skip_specs: true`.
Acceptance remains governed by [media use cases](../../../specs/media-use-cases/spec.md),
[site-build dispatch](../../../specs/site-build-dispatch/spec.md),
[outbox dispatch](../../../specs/outbox-dispatch/spec.md),
[provider tracking](../../../specs/cloudflare-pages-deployment-tracking/spec.md),
[scheduled dispatch](../../../specs/cloudflare-scheduled-dispatch/spec.md), and the
[repository contracts](../../../specs/content-repository-contracts/spec.md) for
[Node](../../../specs/node-content-repositories/spec.md) and [D1](../../../specs/d1-content-repositories/spec.md).

## Impact

The change affects the shared SQL and plan builders in `packages/db`, the
repository wiring in `packages/platform-node` and `packages/platform-cloudflare`,
and their shared contract tests in `packages/test-utils`. Update architecture
[§9.7–9.8](../../../../docs/architecture/data-model.md#97-media),
[§15–16](../../../../docs/architecture/runtimes.md), and the implementation
description in [ADR 0002](../../../../docs/adr/0002-d1-batches-and-node-transactions.md).
The existing schema, payload fields and REST and MCP contracts are sufficient.
