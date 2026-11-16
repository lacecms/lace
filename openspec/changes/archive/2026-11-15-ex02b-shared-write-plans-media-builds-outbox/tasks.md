## 1. Architecture and plan execution

- [x] 1.1 Update architecture §9.7–9.8, §15–16 and ADR 0002 for shared media, build and outbox plans, including commit-time payload fields and the remaining candidate-read difference. Verify that the runtime table preserves the accepted claim caps, transaction boundaries, and dispatch behavior.
- [x] 1.2 Reuse the EX2A executors for statement groups with independent per-candidate guards. Verify atomic rollback of a group on SQL failure, independent zero-row outcomes for losing claims, no persisted guard tokens and no enqueue receipt for lease changes. Check the built `db` entry and its packaged export assertions.

## 2. Build enqueue and public-state writers

- [x] 2.1 Add the shared JavaScript payload constructor and enqueue statements in `db`. Wire manual requests and explicit retries on both adapters. Verify first insert, coalescing and one pending row, the five-second deadline, zero and nonzero versions, retry-source inheritance and precedence, rejected retry sources, and the exact queue receipt.
- [x] 2.2 Wire the group into entry publication, unpublication, published-entry deletion and the existing public-state write in configuration sync. Verify event versions match the atomic commit, replays and draft-only deletion queue no work, and sync retains its freshness guards and request reason. Cover both orders of the claim/coalesce race and verify the claimed target stays fixed. Remove superseded enqueue helpers and check that the affected SQL has no `json_patch` construction of build events.

## 3. Media persistence

- [x] 3.1 Move upload metadata and tag writes and metadata edits onto plans, with the shared build fragment for public effects. Verify metadata/hash/tag atomicity, upload cleanup on persistence failure, the 20-tag bound, stale `updated_at` and inactive media outcomes, and rollback of changes to metadata, tags, version and event. Verify tags-only and draft-only-reference edits queue no work and combined descriptive/tag edits of published media enqueue once.
- [x] 3.2 Move deletion requests, explicit retries and dispatch finalization/failure onto plans. Verify rejection while referenced and a concurrent save/deletion race, non-coalesced events, exact live lease and media matching, retry and terminal diagnostics, and atomic removal of metadata and tags after object deletion. Verify stale finalization and late SQL failure leave the current lease and media intact.

## 4. Site-build and dispatcher transitions

- [x] 4.1 Move generic outbox claims, completion and rescheduling to shared plans. Verify eligibility, ordering, the 20-lease cap, lease expiry and recovery, attempts and sanitization, and refusal of stale completion or retry on both adapters.
- [x] 4.2 Move site-build claims, renewals, trigger outcomes and provider-check writes to shared plans. Verify the 10-lease cap within the D1 batch limit, candidate races, original start time on reclaim, invalid and stray terminal events, and every trigger outcome with its paired event update. Cover a stale result, rollback of a late write, provider identity guards, and repeated tracked completion after restart. Exercise persisted payloads and running rows produced by the old path.

## 5. Session verification

- [x] 5.1 Run the focused `db`, application media/dispatch, and Worker outbox, content, dispatch and Pages tracking suites. Run both complete repository contract suites with `pnpm --filter @lacecms/platform-node test src/repository-contract.test.ts` and `pnpm --filter @lacecms/platform-cloudflare test src/repository-contract.test.ts` using actual local D1 for the latter. Verify exactly one request-local post-commit wake-up for insert/coalesce, zero on replay, guard miss or rollback, and the existing 100-bind, 40-statement and 50-query limits, including a scheduled run with builds, provider checks and media finalization or failure. Check that new tests are typed and follow the source layout rules.
- [x] 5.2 Record the scoped write SQL and module changes against the EX2A measurements in the roadmap progress log. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex02b-shared-write-plans-media-builds-outbox --type change --strict` and `pnpm spec:validate`.
