## 1. Architecture and shared enqueue

- [x] 1.1 Update architecture §6, §9.8, §10 and §15–16 before code. Verify the documented boundary assigns request data to use cases, admission and atomic enqueue to persistence, and dispatch to committed work under the existing outbox subpath dependency rule.
- [x] 1.2 Define the registry-derived request type and let shared plan code bind IDs, guards and receipt metadata to requests. Add the ordinary registered-event insert path and keep the special build coalescing path. Verify payload validation, the media insert count, the build receipt slots and commit-time version, and a version increment compiled by itself with no outbox statement.

## 2. Content and media producers

- [x] 2.1 Update publish, unpublish and delete together with their ports, shared plans, both adapters and direct repository callers. Split the combined publication helper. Verify the supplied actor, operation time and new or removed snapshot in persisted build requests, including route-less publication. Verify a draft-only delete, guard miss, replay and late write failure leave the queue unchanged.
- [x] 2.2 Update the metadata edit, deletion and deletion retry commands and plans. Verify tag-only and unchanged edits have no build effect, and test the first published reference appearing or last published reference disappearing before the guarded write. Check the metadata result, version and persisted event together. Verify independent deletion events, reference conflicts and rollback at the media enqueue checkpoint.

## 3. Build and sync producers

- [x] 3.1 Have the administrator build use cases supply manual and retry events. Consume those requests in the common build plan. Verify authorization, retry eligibility, explicit and inherited retry lineage, debounce and coalescing, and a receipt with the current target including zero before the first publication. Verify the request never advances the version.
- [x] 3.2 Supply the sync build request from the prepared final plan and consume it after guarded revalidation. Verify preview, no-op, baseline-only and stale sync leave the queue unchanged, a public-changing apply uses the committed target, and an interrupted block migration can resume and queue one build in its final mutation. Exercise rollback after a late final-mutation failure.

## 4. Parity and completion

- [x] 4.1 Run focused application producer, DB plan, REST and MCP tests and the shared repository contract suite with `pnpm --filter @lacecms/platform-node test src/repository-contract.test.ts` and `pnpm --filter @lacecms/platform-cloudflare test src/repository-contract.test.ts`. Verify the same contract assertions pass on file-backed and in-memory SQLite and local D1. Check packed application and DB exports affected by the port and helper changes.
- [x] 4.2 Run the Worker dispatch, content, media and sync budget tests. Verify one post-commit wake-up per request with an insert or coalesce and zero with a replay, guard miss, false media predicate or rollback. Keep the relevant D1 workloads within 100 binds per statement, 40 statements per mutation batch and 50 queries per invocation.
- [x] 4.3 Record the number of producer paths now supplying explicit requests and the fate of the combined public-state/enqueue helper in the roadmap progress log. Verify all production inserts still go through the shared compiler. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec openspec validate ex03b-use-cases-emit-events --type change --strict` and `pnpm spec:validate`.
