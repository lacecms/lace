## 1. Reproduce the queued build failure

- [x] 1.1 Add a deterministic integration case using a migrated file-backed SQLite database and the VPS poller's production build callback. Prepare two distinct due events across a restart as described in the design. Hold the first trigger for more than 60 seconds while its heartbeat succeeds. On the original code demonstrate that the second lease ages in the queue and the second build ID reaches the external trigger twice across polls.

## 2. Claim and verify work at the trigger boundary

- [x] 2.1 Set the production VPS build pass to one claim. Verify the restart case observes only A leased while A runs, exactly one trigger call per ID, both rows succeeded, both events processed and no calls on a later poll. Exercise the production setting from the test so reverting the composition change fails the test.
- [x] 2.2 Guard the portable dispatcher's first call against expiry and conditionally renew each deferred lease before invoking its trigger. Test a live lease, the exact expiry boundary, lost ownership, a thrown renewal and a delayed confirmation. Assert skipped calls produce zero external requests and zero attempt or outcome writes. Verify existing success, tracking, acceptance, failure and retry behavior for admitted calls.
- [x] 2.3 Exercise two SQLite connections. Let a peer take B while A's call is still running and verify B is triggered once. Separately stop an owner after claim and before trigger, then verify the peer recovers the same build ID only after expiry and that the old token cannot finalize it.

## 3. Document and verify

- [x] 3.1 Describe the VPS one-build poll and lease recovery in architecture §10, with a link to the site-build dispatch capability. Verify the documentation distinguishes the healthy backlog scenario from a crash after the builder has acted.
- [x] 3.2 Run the focused application, Node dispatcher, VPS loop and Worker dispatch tests and the relevant SQLite and local D1 lease contracts. Verify the scheduled and post-commit Worker paths retain their one-build limit, the mixed scheduled pass stays within 50 D1 queries and in-flight renewal and shutdown recovery still pass.
- [x] 3.3 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate claim-site-builds-at-dispatch --type change --strict`. Record the checks and the external-call counts from the restart regression. See [Verification](verification.md).
