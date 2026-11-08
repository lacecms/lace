# ADR 0002: Use guarded D1 batches and interactive Node transactions

- Status: Accepted
- Date: 2026-09-07
- Governing architecture: [sections 4.5](../architecture/README.md#45-portable-capabilities-explicit-adapters), [9](../architecture/data-model.md#9-content-data-model), and [10](../architecture/publication.md#10-content-publication)

## Context

Publication and draft mutations must atomically preserve snapshots, routes,
media references, published state, idempotency, and outbox invariants. Node
SQLite supports interactive callbacks; D1 provides atomic SQL batches.

## Decision

Application ports model known atomic content operations rather than a generic
transaction callback. Node implements them with interactive SQLite transactions.
D1 implements them as explicit guarded atomic SQL batches. Publication first
conditionally creates its snapshot only when the draft pointer and expected
revision match; all later copy, route, state, idempotency, outbox, and cleanup
statements are conditional on that guard. A zero-row guard returns
`CONTENT_REVISION_CONFLICT` and makes all following statements no-ops.

## Consequences

- Node and Cloudflare have identical observable publication semantics without
  pretending their transaction APIs are identical.
- Cross-runtime tests must cover commit, route-collision rollback, and revision
  conflicts.

## Alternatives considered

- A generic interactive transaction port was rejected because D1 cannot safely
  fulfill that promise.
- Unguarded writes after validation were rejected because concurrent drafts can
  publish stale content.
- Separate snapshot and outbox writes were rejected because they can leave
  public state without a rebuild request.

## Amendment (RF5C, 2026-11-08)

- **Publication result.** D1 returns the committed entry it predicts before
  the batch, because the idempotency record that stores the response is part
  of that batch; Node reloads the entry inside its transaction. Both SHALL
  equal a subsequent `load` (including the SEO group), and the shared
  repository contract asserts that for publication, its replay and
  unpublication.
- **Conflict precedence.** Both runtimes check, in order: idempotent replay
  (or a changed fingerprint), a stale expected revision
  (`CONTENT_REVISION_CONFLICT`), invalid internal-link targets, then write.
  The guarded statement remains the race guard on both.
- The full list of intentional runtime differences is the "Runtime deltas"
  table in architecture §16.
