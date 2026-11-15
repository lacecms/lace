## Context

The [proposal](proposal.md) covers the final configuration sync mutation.
`application/src/configuration` classifies model changes, prepares evidence
and renders the reviewed report. It runs resumable block rewrites and
replans before calling the final persistence port. The existing SQL
adapters each interpret the final operations. Node re-reads and plans inside
a write transaction. D1 reads ahead of time and guards its write batch with
the SQL-rendered stored-model summary and link predicates.

## Goals / Non-Goals

`@lacecms/db` owns the executable plan and statement order. The application
owns review, evidence and the portable command and result. The adapters own
driver calls, read timing, platform limits, IDs and post-commit notification.
The existing migration-unit builders and batch packing continue to handle
block rewrites ahead of final apply.

## Decisions

### Compile the approved report at the persistence boundary

Keep the application `planConfigurationSynchronization` function and its
ordered operations as the portable planning and reporting contract. Add the
SQL compilation to `packages/db/src/sync`, which already depends on
`application`. Node and D1 consume the resulting `WritePlan` through the
`db` package entry and share its receipt decoding where the results have the
same shape. A shared preparation step determines which models require
paged recursive rewrite input and derives the former read key and current
write key. The adapter supplies a synchronous SQLite read or an awaited D1
read at that boundary. An SQL-returning application planner would violate
the package graph and expose database concerns through the accepted
[application port](../../../specs/application-ports-and-commands/spec.md).

The `db` package entry may expose the adapter-facing builder, following
EX2A and EX2B. Existing exports and their signatures stay compatible.
Keep package export paths and the application, platform, CLI and SDK
interfaces stable. Document any new directory dependency in `db/src/index.ts`
and keep the sync, link and write-plan modules acyclic.

### Order and guard the final writes

1. Node uses the executor's lazy plan factory to re-read the stored models,
   compare the expected state and canonical report, and gather recursive
   rewrite inputs within its immediate transaction. D1 makes the same
   preflight comparisons before submitting the batch. Both return the
   portable no-op outcome for a fresh, unchanged configuration. Compare
   the existing model identities, baseline evidence, snapshot summaries and
   fingerprints, including both raw public-projection identity values.
2. D1 re-evaluates the stored summary and link admission predicates inside
   the one final batch. Use the D1 executor's batch guard for every mutation
   and release it in the batch. Node evaluates link availability inside its
   transaction before executing writes. A missed freshness guard uses the
   existing `CONFIGURATION_SYNC_STALE` code and rerun message. Preserve
   D1's link recheck on a missed batch guard, the unavailable-link rejection,
   singleton collision classification and both runtimes' storage-error
   mapping. Preserve the D1 statement-budget refusal at this command boundary.
3. Build model writes in reviewed key order. Create models with both
   baselines and insert the entry, draft snapshot and draft pointer for a
   new page or global. Update model keys and metadata in place so foreign
   keys cascade on an explicit rename. Remove empty models under the same
   identity predicate. Keep required row outcomes inside the atomic unit.
   Use admission, identity predicates and uniqueness constraints to justify
   single-row outcomes where possible. A failed required write rolls back
   all final changes before either adapter returns a result.
4. For recursive evolution, read current snapshots by the stored model key
   before any rename and apply the prepared field and media replacements
   under the configured key after the model write. The Node reader currently
   scans after the cascade. Reading before it in the same transaction selects
   the same entries and snapshots, and lets both adapters use the same plan.
   Retain the ordered set-based rewrites for hinted field and block changes,
   SEO removal and backfills. Keep reference replacements and the link graph
   revision in the same plan and remove its dirty token in that atomic unit.
5. Append the shared EX2B public-state and build statements for a plan with
   public impact. Increment once and return the resulting version from the
   same atomic unit that inserts or coalesces the pending request. Preserve
   `configuration_sync`, `system:content-sync`, the null snapshot ID and
   the existing pending-only debounce and retry lineage. Keep the work marker
   on the enqueue statements. D1 calls the existing outbox callback only on
   committed insert or coalesce. Node keeps its polling dispatcher. Baseline
   recording and query-metadata updates with a trusted unchanged public
   identity write their metadata without a bump or a build. Preserve the
   conservative legacy public-identity fallback.

### Preserve the boundary for resumable block migrations

The shared `configurationSyncMigrationStatements` remains the source of
block, snapshot and reference writes for the earlier migration phase. Node
keeps one transaction per entry unit. D1 packs whole units under all batch
guards and retains its existing published-then-draft split for an oversized
unit. Earlier committed units survive a later conflict. The final mutation
uses the re-prepared approved report, and the application continues to
return the migrated draft, published and block counts. Combining these
units with the final write would change the accepted recovery contract and
could exceed a D1 batch budget.

## Risks / Trade-offs

- D1 admission, diagnostics, result reads, row assertions and guard cleanup
  consume batch statements. Measure the compiled plan against the existing
  100-bind and 40-statement limits. Keep bounded scans, set-based rewrites and
  existing behavior at the supported boundary. Retain the 50-query limit on
  Worker paths covered by it. Keep the entire final mutation in one batch.
- D1 can observe a save, sync, or link availability change after preparation.
  Exercise the actual batch admission with changes made after the last read.
  Test rename plus recursive evolution to cover the change in Node scan timing.
- Keep failure injection at existing synchronization checkpoints or migrate
  the fixtures to equivalent points in the plan. Cover late failure after
  model and snapshot writes, including the public-state and outbox portion,
  and inspect both content and guard rows after rejection or rollback.

## Migration Plan

Deploy either adapter with the existing schema, model baselines, snapshots
and queued events. Exercise persisted rows without trusted baselines and a
partially completed block migration through the new final executor. The
previous adapters can read rows committed by this change if a deployment is
rolled back.
