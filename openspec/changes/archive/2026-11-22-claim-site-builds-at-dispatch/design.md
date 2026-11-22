## Context

The VPS entry point in `apps/api/src/dispatcher.ts` calls `buildDispatcher.runOnce()`. The portable implementation in `packages/application/src/outbox/dispatchers.ts` claims up to ten events at one timestamp, then awaits each trigger in order. Claiming also marks the build row running. Only the active call renews its lease, normally every 20 seconds. The shared SQL outcome guard correctly refuses a result once the 60-second lease has expired. An early external call on that expired lease is the gap. Both production Worker entry points already use a build limit of one.

## Goals / Non-Goals

Use the existing atomic claim as authority to start a build. Preserve the heartbeat for long-running work, the durable build identity across recovery, the current retry policy and the Worker query budget. The fix covers duplicate calls caused by waiting in a healthy dispatcher's local batch. A crash after an external side effect and before its durable acknowledgment remains subject to ordinary lease recovery. Deduplicating that crash window would require a separate builder protocol.

## Decisions

1. **Claim one build at the VPS scheduling boundary.** Supply a limit of one from the production build callback. After the current call settles, the existing loop runs its media and maintenance work and schedules the next poll. When another process is ready it can claim other due work. Keep the repository's batch claim API, its ordering and cap, the exported dispatcher's existing limit argument and the build start transition inside the atomic claim.
2. **Protect the portable trigger boundary.** A just-acquired first lease can proceed directly if the injected clock is still strictly before its expiry. For a lease deferred behind earlier work, use `renewSiteBuildLease` with its lease ID and a freshly sampled time. The existing SQL verifies event type, ownership, unfinished status and expiry in the same update. A rejected renewal or an error skips this trigger and outcome handling. Check freshness at the handoff to the trigger, including time spent awaiting confirmation. At the exact expiry boundary the claim is stale. Never start the heartbeat for a discarded claim. For an admitted call retain the existing heartbeat, lost-lease handling and guarded outcome writes.
3. **Keep production Worker passes at one build.** The first lease's atomic claim and expiry supply its initial authority, so scheduled and post-commit dispatch need no extra D1 statement on the normal path. Bound multi-claim recovery to the original pass limit. A skipped claim does not burn a failed provider attempt. Recover unfinished work through the existing poll or scheduled invocation.
4. **Test distinct durable events.** Ordinary consecutive build requests can coalesce. Use a migrated, file-backed SQLite repository, request and claim build A, then request B. Close the old connection before any trigger, advance beyond A's lease and B's debounce, and reopen as the restarted worker. Drive both the injected clock and renewal timers deterministically. Hold A's trigger open across the original lease duration and observe B's outbox lock before releasing A. Count calls by build ID, read build history and outbox completion, and poll again past expiry. A separate two-connection case lets a peer take B while A is busy.

## Risks / Trade-offs

- One claim per production poll adds the existing media/maintenance phase and poll interval between queued builds. This keeps the sequential VPS schedule bounded and gives those operations a turn during a backlog.
- Extending the lease duration only postpones the failure for a slower first build. Renewing every queued lease keeps work reserved while a peer could execute it. Parallel builder calls would change VPS scheduling and introduce competing release work.
- A scope limited to guarded completion would still allow an obsolete dispatcher to perform the external side effect. Tests must count trigger invocations as well as inspect final rows.

## Migration Plan

Ship the application dispatcher and VPS composition with the normal release. Pending events and leases left by an older process already contain the fields required for recovery. There is no database migration, operator setting or builder API change.
