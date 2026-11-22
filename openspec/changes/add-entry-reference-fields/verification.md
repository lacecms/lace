# Entry reference fields verification

## REL1A — Field descriptors and configuration

Verified on 2026-11-22.

`field.reference({ models })` stores one raw case-sensitive entry ID and
preserves literal model-key types. Nested groups and lists, model and block
defaults, metadata round trips and forged input were exercised in the
content, config and contracts suites. The config tests cover forward and
same-model declarations, route-less collections, rejection of globals and
unknown models, canonical model-set order and the pre-existing projection
fixture.

The normalized snapshot tests cover hidden values, visible and hidden
blocks, stable block keys, escaped pointers, materialized defaults and
repeated targets. The combined URL and typed reference count accepts 200
and rejects the 201st occurrence at its concrete path. The fixtures also
exercise the independent media, list and JSON byte limits. CE10 consumers
continue to receive the URL-only projection.

The sync planner treats widening as compatible, narrowing or replacing a
target set as validated and set reordering as equivalent. It accounts for
prospective target-model renames and retains existing source-model and
block version gates. Stored-target and graph evidence is the REL1B sync
checkpoint.

### Additive text-author migration fixture

The fixture in
[`reference-fields.test.ts`](../../../packages/application/src/configuration/reference-fields.test.ts)
starts with a populated `posts` model at version 1 with
`author: field.text()` holding `"Ada"`.

1. In model version 2 keep `author` and add
   `authorEntry: field.reference({ models: ["authors"] })`. The planner
   reports a compatible addition and preserves existing snapshot contents.
2. Map the text author explicitly to an author record and save its raw ID
   in `authorEntry` through the normal draft and publication workflow.
   The fixture represents the resulting draft and published data with
   `{ author: "Ada", authorEntry: "people/Ada" }`.
3. In model version 3 remove `author`, declare `removedFields: ["author"]`
   and check the sync plan. The fixture verifies one hinted removal and
   confirms the resulting snapshots preserve `authorEntry: "people/Ada"`.

Replacing the populated text field with a reference at the same key, or
moving it through a field-rename hint while changing the type, yields a
breaking type change.

### Checks

- Content, config and contracts passed 275, 111 and 211 tests respectively.
- The application planner and draft checks passed 88 tests. The focused
  admin and CLI checks passed 11 and 7 tests respectively.
- Content and contracts passed all three packaged-export checks. Generated
  OpenAPI adds the reference scalar to the field and list-item schemas.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and
  `pnpm exec openspec validate add-entry-reference-fields --type change --strict`
  passed.

## REL1B — Persistence and acyclic writes

Verified on 2026-11-22 on file-backed and in-memory Node SQLite and on
local D1 with Miniflare.

Migration `0006_entry_reference_purpose.sql` preserved legacy URL row IDs,
source cascades, public version and queued work on populated databases.
Fresh databases have indexed outgoing lookups by snapshot and purpose, and
indexed incoming lookups by target and purpose. Both SQLite and D1 plans
use the outgoing covering index for recursive reachability. D1 uses
`snapshot_id=? AND purpose=?` in draft proofs and adds `delivered=?` in
published proofs. The existing-edge lookup can also constrain the target ID.

The shared repository fixtures exercised draft and published cycles, hidden
locations, repeated targets, repairable orphans, list/block remapping, stale
revisions and replay. A title-only save performed zero writes to usages or
the graph revision. Two callers prepared their changes through independent
repositories before either committed. In both commit orders, the first
draft save or publication succeeded and the closing edge was refused.
Injected failures after usage writes or during build enqueue preserved
snapshots, usages, graph revision, public version, outbox, idempotency and
preview capture state.

Synchronization checks the final graph overlay and each whole-entry unit
in the existing migration order. In the opposite-phase reversal fixture,
either first entry would create a cycle in one phase. The check reported
the entry, phase and block location, advised separate stages, and left the
database unchanged. The removal stage survived an injected interruption
and resumed with the remaining entry. The following stage introduced the
reversed edges. Other fixtures covered atomic model-field backfill and
pruning, graph-only changes after planning, target model renames and
narrowing, missing and unpublished targets, the combined occurrence limit,
and route removal with typed versus URL usages.

### Local Worker invocation counts

The [Worker budget case](../../../packages/platform-cloudflare/src/reference-worker-budget.test.ts)
counted every D1 statement including authentication, response reads and
deferred dispatch. Mixed requests used 200 blocks, 200 distinct media
references, 100 URL links and 100 typed references. The wide DAG shared a
descendant across branches. The deep and wide proofs accepted exactly
2,048 reachable IDs, and the 2,049th distinct ID caused a rejected write.

| Invocation | Statements | Largest batch | Most binds |
| --- | ---: | ---: | ---: |
| Mixed create | 44 | 35 | 100 |
| Mixed save | 48 | 35 | 100 |
| Mixed stale save | 44 | 35 | 100 |
| Mixed save with a missing target | 44 | 35 | 100 |
| Mixed publication with idempotency key | 42 | 27 | 100 |
| Mixed publication replay | 40 | 27 | 100 |
| Mixed duplicate | 47 | 35 | 100 |
| Mixed revert | 28 | 16 | 15 |
| Deep or wide DAG with 2,048 IDs | 21 | 15 | 18 |
| Rejected overflow or cycle | 21 | 15 | 14 |

All measured invocations stayed within 50 statements, 40 statements per
guarded batch and 100 binds per statement. Set the
`LACE_REL1B_EVIDENCE` environment variable to a file path when running the Worker
budget case to capture its statement counts and query plans as JSON.

### Checks

- Node repository contracts passed 313 tests. The local D1 repository,
  migration, graph and Worker suites passed 186 tests.
- Application and DB suites passed 179 and 70 tests respectively.
  Focused REST and MCP suites passed 8 and 7 tests, and both packaged
  export checks passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and
  `pnpm exec openspec validate add-entry-reference-fields --type change --strict`
  passed.

## REL1C — Removal, direct impact and admin API

- The shared repository contracts ran on file-backed and in-memory SQLite
  and local D1. They checked literal prefix search, bounded batch resolution,
  route-less publication status and separation from URL targets.
- Impact grouped the review's own Author field by snapshot for Page → Review
  → Anna. A 56-group fixture crossed source pages, continued 25 locations
  from a single draft, distinguished hidden published usages and invalidated
  both cursor modes after a graph change.
- A delivered typed usage blocked unpublication and deletion until the
  referring source was republished. A draft-only delete required current
  acknowledgment. Mixed URL and typed usages required both receipts. Stale
  and cross-actor receipts failed without changing publication, outbox or
  graph state. Confirmed deletion preserved the referring draft and revision.
- Two independent repository commands tested both commit orders of source
  publication and reviewed target deletion. The shared HTTP scenario also
  raced publication against withdrawal on Node and Worker. In each case only
  one mutation committed and the losing attempt left its prior state intact.
- The shared REST scenario exercised browser permissions, automation
  credential refusal, route-less catalog and resolve responses, both impact
  modes, stale preconditions, malformed delete bodies and idempotent
  publication and withdrawal. OpenAPI and the Hono RPC type checks cover the
  added contracts. The cycle response reports the candidate field and the
  saved draft that removes a specific edge from the witness.

### Local Worker invocation counts

Counts include session authentication, response reads and deferred dispatch
for single requests. The long-cycle case checked 2,048 reachable IDs. Its
16-ID witness indicated an omitted segment and named the corrective source
near the end of that segment.

| Invocation | Statements | Largest batch | Most binds |
| --- | ---: | ---: | ---: |
| Search reference targets | 3 | 0 | 11 |
| Resolve selected IDs | 3 | 0 | 1 |
| Read reference impact, including a location continuation | 6 | 0 | 8 |
| Delete with reference review | 22 | 14 | 14 |
| Withdraw, including idempotent replay | 29 | 18 | 12 |
| Publish, including conflicts and replay | 37 | 25 | 20 |
| Reject a publication closing the long cycle | 33 | 24 | 19 |

### Checks

- The Node repository and REST run passed 324 tests. The focused local D1
  repository, graph and Worker runs passed 22 tests.
- Application, contracts, DB, server, MCP and shared fixture suites passed
  857 tests. The affected packaged export suites and Hono RPC type check passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and strict OpenSpec
  validation passed.
