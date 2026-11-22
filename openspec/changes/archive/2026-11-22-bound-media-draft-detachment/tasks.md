## 1. Guarded media detachment

- [x] 1.1 Add the admission read to the portable port, shared SQL and both repositories. With migrated SQLite and local D1, verify zero uses, repeated locations in one entry, draft plus published usage, a published-only owner, 50 distinct drafts and a real 51st owner.
- [x] 1.2 Reuse draft normalization and the guarded save plan for a named entry and revision. Verify scalar, list, nested, hidden block and SEO detachment, actor/revision attribution, other references and block envelopes on both adapters. Check that an absent reference replays without a write.
- [x] 1.3 Replace the multi-entry loop with admit, entry and finish commands. Test both permissions before data access, inactive items, a publication or 51st owner arriving just before a save, a stale still-using draft, a new use before finish, and competing finishes. Inspect earlier revisions, published state and outbox after each failure.

## 2. Authenticated HTTP and Worker budgets

- [x] 2.1 Extend the media query/result schemas, route and OpenAPI. Run contract and route tests for each wire shape, repeated/invalid parameters, ordinary deletion, retry, permission loss, progress responses and the terminal media DTO. Regenerate the snapshot and run `pnpm openapi:check`.
- [x] 2.2 Add one HTTP scenario to the shared cross-runtime fixture for 1, 2, 50 and 51 real entries. Drive it through actual session-authenticated requests on Node/SQLite and Worker/local D1. Assert the admitted sets, acknowledgments, exact revision changes, active intermediate state, one terminal deletion event for eligible cases and absence of mutations for 51.
- [x] 2.3 Enforce and record the 50/40/100 statement, mutation batch and bind ceilings per Worker invocation using the counting binding and drained `waitUntil` work. Include zero-use start, the full 50-entry run, refusals, retries, a maximum mixed-reference draft and finish with due media and build work. Keep the post-commit claim sizes within the measured headroom and run the existing mixed-dispatch and maximum-draft budget cases.

## 3. Admin continuation and delivery

- [x] 3.1 Teach the typed Admin client and delete-media feature to compare the confirmed set, validate each progress response, persist the scoped checkpoint and finish sequentially. Verify one confirmation, progress labels, final cache refresh, and a changed admission set with no draft writes.
- [x] 3.2 Test close/reopen, lost entry and finish responses, two tabs, revision conflict, revoked access, and another account on the same browser. Verify preserved revisions, refreshed partial progress, keyboard access, and the resume or review action for each state.
- [x] 3.3 Update architecture §§9.7/12/16, the editing and API guides, and the verification note. Include a working direct-client sequence, compatibility note, and measured per-phase maxima. Check documented status codes and examples against the tested OpenAPI contract.
- [x] 3.4 Run the focused application, repository, HTTP, Worker-budget and Admin tests, then `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate bound-media-draft-detachment --type change --strict`. Record commands and outcomes with the change.
