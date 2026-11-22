## Context

The 50-entry limit bounds the media detail list. It also bounds the number of iterations in `MediaUseCases.detachDraftUsage`, but each iteration hydrates a content entry, calls `ContentUseCases.save` (which loads the entry again), executes a complete guarded save and reloads the aggregate. The final deletion also registers post-commit work on the Worker. The [audit measurements](proposal.md) exclude authentication and dispatch.

## Goals / Non-Goals

Make the normal success path finite and countable on both runtimes. Keep the admitted set stable across requests while allowing concurrent content edits, publication and ordinary deletion. The scope ends when the existing outbox event commits. The existing dispatcher owns binary removal and retries.

## Decisions

### One admission, one request per draft, one finish

Keep the existing authenticated DELETE route. The [REST delta](specs/rest-contracts/spec.md) defines the query grammar and response shapes. Start returns a bounded list of IDs and revisions ordered by entry ID. A step names one pair. Only finish, or an admission that finds zero uses, calls the existing guarded deletion command. Separating the last save from finish reserves a full invocation for the deletion mark, DTO and outbox wake-up. A fixed chunk of two already exceeds the budget in the audit's simple fixture. A runtime-specific lower entry limit would deny an accepted operation.

### Existing projections record committed work

Add a portable admission read and a condition on the existing guarded draft write. Shared SQL in `@lacecms/db` reads the active item and current reference owners, deduplicates by entry ID before a limit of 51, and returns revision and published-use evidence from one consistent database view. This check needs neither usage-location DTOs nor the bodies of 50 drafts. Published-only usage counts too. At 51 rows the admission can refuse immediately.

For a named step, share draft normalization and the descriptor-aware detach transform in `@lacecms/application`. Hydrate the named draft once. Use the existing revision, projection, media eligibility and entry-reference guards in the write plan. Add active-media, published-use and distinct-owner eligibility predicates inside the same SQLite transaction or guarded D1 batch as the draft mutation. An eligible step seeing an absent reference is a read-only acknowledgment, including on replay after a racing save removed it. A step seeing a changed revision that still references the item reports the ordinary conflict. Return a small acknowledgment from the commit result so detaching avoids the second aggregate load and post-save hydration. Preserve the ordinary save caller's return type and behavior.

Keep SQL and write-plan guards shared. Node supplies its interactive transaction and D1 its prepared batch. A direct entry request carries no authority from admission. Reauthenticate, authorize and apply the same live guards even when a caller skipped admission. The final deletion guard covers every current reference, including an entry outside the client's list and a previously processed entry that reintroduced the media. Never append it to the plan automatically. A concurrent or repeated finish can win only the existing active-to-deleting transition.

### One confirmation survives a closed tab

After the user confirms the named entries, compare the admitted IDs with that confirmation before dispatching any entry request. Persist a versioned checkpoint in browser storage scoped by installation, authenticated actor and media ID before the first entry write. Store the bounded ID/revision pairs and next unacknowledged position. Exclude draft values, credentials and media bytes. Advance only after a validated acknowledgment for the expected ID. A fresh Admin session on the same browser can offer **Continue** with that plan. Distinct tabs can replay the same step safely. Clear the checkpoint on completion or deliberate abandonment. A fresh approval is required to adopt a changed plan.

If the tab closes or a response is lost, reconcile the media's current state before retry. For active media, retry an uncertain entry with the saved revision, or retry finish if all entries were acknowledged. If the item is deleting, failed deletion, or already absent, clear the stale plan and display the observed state. Do not attribute a transition by another actor to this client's request. A stale revision that still uses the item, new use at finish, expired session or revoked permission stops the sequence. Preserve completed edits, refresh usage and affected entry caches, and offer the appropriate sign-in, review or resume action. Recovery from missing or unusable browser storage starts with fresh usage and confirmation. The current reference projection releases already detached drafts from that review.

### Measure the request that actually runs

Use the shared HTTP fixture in `tests/support/cross-runtime-fixture.mjs` and the `countingD1` wrapper around migrated local D1. Reset counters after setup and prior request settlement. Drain the current request's registered promises before reading counters, as in `reference-worker-budget.test.ts`. Count each SQL statement inside a batch. Keep fixture seeding and independent database assertions outside the measured boundary. For each invocation record phase, status, statement count, largest mutation batch and maximum binds. A large plan needs more invocations, while the cost of a named step is bounded by one legal draft.

Finish must exercise the production wake-up with other due work. Preserve the single post-commit pass and scheduled recovery. Bound work claimed in the detach finish pass to fit the headroom left by authentication and the guarded mark if existing claim sizes exceed it. The same constraint applies to zero-use admission, which also queues deletion. No draft step registers a wake-up.

## Risks / Trade-offs

- Fifty simple drafts require up to 52 HTTP requests in an uninterrupted run. Admin sends them sequentially and exposes progress. Closing the tab pauses further requests after any in-flight request settles.
- The HTTP contract changes for direct detach clients. An intermediate success leaves an active item. Direct clients must parse progress and follow the protocol to get a deletion receipt.
- A busy site may acquire new references or edit an admitted draft. Surfacing a conflict permits fresh review of the changed data and retains edits already committed.

## Migration Plan

Ship the API, generated contract and Admin together and document the new direct-client sequence and intermediate response. Existing rows and indexes supply admission and progress evidence. There is no SQL migration, durable server job or backfill. On rollback, deploy the matching previous Admin and API together. Clear incompatible browser checkpoints, reload current usage and review remaining drafts. Prior guarded saves retain ordinary content revisions.
