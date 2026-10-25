# Implementation verification

## Current status (2026-10-25)

All implementation, documentation and verification tasks are complete (19/19).
Final quality-gate results are recorded below. The
approved behavior is ordinary literal LIKE with Node/VPS 200 UTF-16 code units
and Cloudflare 48 code units / 50 final escaped UTF-8 pattern bytes. String sorts
use bounded, explicitly discriminated current-draft/revision anchors. No chunk
matcher or Cyrillic folding remains. The only database change is additive
migration 0011's two nullable public-identity/source columns.

The chronological notes below preserve prior probes and resolved blockers;
recommendations for GLOB/chunking and claims that runtime/UI work is pending
are historical and superseded by the completion evidence at the end. The owner requested archival after completion; all six capabilities are synced
to main specs and the change is archived under its dated directory.

## Completed checks

- `pnpm --filter @lacecms/config build`: passed.
- `pnpm --filter @lacecms/config test`: passed, 71 tests.
- `pnpm --filter @lacecms/config type-test`: passed.
- `pnpm --filter @lacecms/application build`: passed.
- `pnpm --filter @lacecms/application exec vitest run src/configuration-evolution.test.mjs`: passed, 32 existing tests after removing the temporary reproduction.
- `pnpm exec openspec validate add-configurable-collection-queries --type change --strict`: passed.

Config tests cover detached/frozen operation metadata, operation-specific static
keys, scalar/nested restrictions, pages/globals, unknown/duplicate/over-limit
options, empty normalization, independent column visibility, unchanged omitted
hashes, and model/whole-config projection versus structural identity. These hash
checks do not prove synchronization avoids public-state/build work.

## Task 2.2 blocker

A focused synchronization regression using `posts()` before and
`posts({ listOptions: { sortableFields: ["summary"], filterableFields: ["summary"],
searchableFields: ["summary"] } })` after normalization produced:

- identical structural hashes and model versions;
- different projection hashes;
- a `label-update` operation and no content writes;
- `configurationSyncAdvancesPublicState(plan) === true`, contrary to the planned
  no-build/no-public-state requirement.

The temporary regression was removed after recording this result; its assertion
must return with the chosen implementation. The existing 32 configuration
evolution tests passed during this reproduction.

`StoredContentModelState` stores one projection hash and a canonical structural
baseline, without prior listOptions or public projection identity.
`configurationSyncAdvancesPublicState` treats every operation except
`record-baseline` as public. Two different prior projections can have identical
structure but differ in admin query settings or public SEO fallback mappings.
The existing persisted inputs cannot identify which properties changed. A
blanket no-build rule for `label-update` would suppress required SEO builds.
Special-casing only first enablement would fail edits/removal and combined
changes. No such workaround was implemented.

Before proceeding, reconcile the design/proposal assertion of no new persisted
state with the requirement to distinguish these updates. Preferred revision:
persist a separate public-projection identity, with explicit Node/D1 migration,
legacy fallback, atomic synchronization and mixed-change regression coverage.
The alternative is to retain conservative rebuilds for listOptions changes,
which explicitly relaxes the approved no-build behavior.

## Outstanding verification

Contracts/API, query resolution, SQL, Node/local D1 corpus and performance,
admin/browser journeys, documentation, root quality gates and OpenAPI checks
remain pending. No local D1 or browser evidence has been produced.


## Task 2.2 completed (2026-10-25)

Migration 0011 adds only nullable model public identity and source hash columns.
The shared runtime computes public identity without root listOptions. Node and D1
persist both fields in guarded final synchronization mutations; reports and stale
state comparisons retain them. The original blocker above is resolved.

Verified commands:

- Config build, tests (72), and type tests: passed.
- Application build and tests (105): passed.
- DB build and tests (20), including fresh/populated SQLite migration: passed.
- Node/Cloudflare TypeScript compilation: passed.
- Shared Node repository corpus: 178 passed (file-backed and in-memory SQLite).
- Shared actual local D1 repository corpus: 89 passed.
- Focused local D1 migration: 1 passed (fresh and populated databases).

The shared new identity cases cover enable/edit/reorder/remove without builds,
legacy first-enable and unchanged baseline seeding, no-op repeat sync, mixed SEO
updates with one build, stale plans after baseline-only seeding, rollback-era
source mismatch with conservative rebuild, and final-mutation failure rollback.
Migration cases compare model, entry, snapshot, route, public-state and outbox
rows before/after. Local D1 uses Miniflare/workerd; opening its localhost listener
required an approved sandbox escalation after an EPERM startup failure.


## Contracts, resolution, API and identity

- Contracts: 145 tests passed, covering typed strict unions, zero/false, invalid
  ranges/members/limits, explicit-offset UTC normalization, metadata, canonical
  filter/cache identity and preserved system sorts.
- Application: 106 tests passed, including authorized configuration resolution,
  role parity, canonical/detached operands and failure before persistence reads.
- Server: 87 tests passed, including raw UTF-8 filter byte bounds, malformed JSON,
  duplicate parameters, disabled fields/sorts, strict operands/members, inverted
  ranges, precise value-free pointers, empty filters and legacy requests.
- DB: 22 tests passed, including SHA-256 cursor fingerprints over canonical
  operands/capabilities, and exhaustive supported Cyrillic pairs and literal
  punctuation through SQLite GLOB. Actual D1 matcher parity remains task 4.3.
- Admin client: 26 tests passed, including canonical filter/select order and
  effective-capability cache identity.
- `pnpm openapi:generate`: passed. `pnpm openapi:check`: passed using temporary
  isolated Git metadata seeded with the regenerated artifact. The check's
  additional git-diff guard otherwise rejects an intentionally uncommitted
  artifact; the real repository index and history were left unchanged.
- Root typecheck passed after the identity/contracts changes; final updated
  gates are recorded below when run.

## Task 4.2 cursor-size blocker

Configured text/textarea fields do not require maxLength. The current shared
opaqueCursorSchema caps all cursors at 4096 characters, while the design and
node-content-repositories delta require embedding a typed custom sort value
plus missing rank in the continuation boundary.

A direct Node reproduction through existing encodeSortCursor and the shared
transport schema produced:

```
sortValueCodeUnits: 5000
cursorLength: 6756
passesTransportCursorSchema: false
```

Five thousand characters are valid field content, far below draft JSON bounds.
Canonical query hashing solves operand/capability size but does not bound the
sort value. Compression cannot guarantee that arbitrary allowed text fits;
truncation breaks ordering for common prefixes, and imposing a new field limit
would narrow the approved configuration contract. No SQL workaround or silent
limit was implemented.

Recommended planning revision: for custom string sorts, encode a bounded
entry/revision anchor with query/capability identity and missing rank, then
resolve its typed boundary through a bounded indexed lookup on continuation.
Reject missing or revision-changed anchors using the existing cursor validation
recovery, retain embedded numeric/boolean/date/datetime boundaries and preserve
public/system cursors. Keep a fixed statement count independent of page size,
allowing at most one additional anchor lookup per continuation; verify large
incompressible strings, shared prefixes, missing values, edited/deleted anchors,
Node/local-D1 parity and browser paging recovery. This explicitly replaces the
raw-string-boundary requirement and needs an approved planning revision.


## Final checks before the task 4.2 pause

- `pnpm typecheck`: passed (36 Turborepo tasks and root config typecheck).
- `pnpm lint`: passed, including dependency-boundary and admin-color checks;
  pre-existing advisory warnings remain.
- `pnpm format:check`: passed.
- `pnpm exec openspec validate add-configurable-collection-queries --type change --strict`: passed.
- `git diff --check`: passed.
- Focused post-fingerprint cursor/list regression: 14 Node and 7 actual local D1
  cases passed. An old forged-cursor fixture was updated to derive the current
  kind from the first page rather than assume the previous cursor format.
- Admin client/collection widget suites: 50 tests passed; admin typecheck passed.

These checks cover the implemented portion only. Configured SQL predicates and
sort boundaries, actual D1 Cyrillic query parity, the 1,000-entry performance
work, configured admin controls, browser acceptance and final documentation are
still incomplete. The change has not been archived or declared ready to ship.


## Task 4.2/4.3 SQL progress and actual D1 pattern-capacity blocker

The approved bounded-cursor design is implemented in the shared DB list planner:
prepared typed predicates, missing-last custom boundaries, fixed-length custom
query fingerprints, scalar cursors and revision/snapshot string anchors. A
single-statement anchor lookup/guard covers item selection and empty pages.
Items/totals share predicates; returned field JSON projects listFields only and
string sort values do not enter returned cursors or result rows. Both adapters
use the same planner. No additional migration/index was added.

- Full Node repository corpus: 180 passed (file-backed/in-memory SQLite).
- Shared configured-query Node cases verify numeric/boolean/date/datetime,
  text/textarea/URL/select paging in both directions, long area/URL prefixes,
  Cyrillic and punctuation, select OR/cross-field AND, zero/false, inclusive UTC
  bounds, query totals, altered anchor fields, stale-save stability and immutable
  publication. Additional required cases/performance/browser checks remain.
- Unaffected actual local D1 repository corpus: 89 passed; the new configured
  query case was excluded only from that regression run and remains failing.
- Actual local D1 configured-query case: failed with
  `D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR`.
- A direct local D1 diagnostic with bound ASCII patterns returned matches at
  lengths 10, 40 and 50, and the same error at 51, 100 and 200 bytes. The isolated
  diagnostic used Miniflare/workerd; its temporary test was removed after
  capturing the results. This is actual D1 evidence, not a SQLite approximation.
- Root typecheck, lint, format:check, strict OpenSpec validation and git diff
  whitespace checks passed at this checkpoint (existing advisory lint warnings
  remain; obsolete list imports were cleaned up).

The approved literal compiler expands each ASCII letter to a four-byte case
pair, and Cyrillic pairs require six bytes. With substring wrappers, 13 ASCII
letters or nine Cyrillic letters can exceed D1's 50-byte compiled-pattern limit,
well below the promised 200-code-unit input limit. A real configured URL contains
case-insensitive characters whose compiled filter pattern exceeds this bound;
Node succeeds but D1 rejects the query. Lowering the user-input limit, accepting
Node/D1 divergence, or silently returning an empty/partial page is not valid.
Tasks 4.2/4.3 remain incomplete and no checkbox was marked for the partial SQL.

Recommended revision for approval: compile literal tokens into UTF-8-bounded
GLOB chunks (including escaping/wrapper overhead) and evaluate complete chunks
at exact adjacent code-point offsets in SQL. Equality has one fixed start;
substring matching needs a server-side candidate-position strategy with a
bounded-pattern fast screen, exact adjacency checks and measured model-scoped
costs. Keep the single-pattern fast path when it fits. Apply the same compiler
and SQL strategy on Node/D1, with prepared operands, no application JSON scan,
no new index/schema, unchanged 200-code-unit inputs and literal/pair semantics.
Add actual local D1 tests at compiled byte boundaries, long ASCII/Cyrillic/mixed
terms, punctuation at chunk splits, false separated-chunk matches, and near-limit
field performance. Scope/design artifacts must be reconciled before coding this
new matching strategy.

## Ordinary LIKE revision and requested cleanup (2026-10-25)

The chunked GLOB recommendation above is superseded. The user selected ordinary
LIKE and separate runtime budgets. Removed the case-pair GLOB compiler and its
expansion tests; shared SQL now binds escaped literal LIKE patterns, while text
equality uses COLLATE NOCASE. No chunk/adjacency implementation existed to remove.
Architecture, backlog, proposal, design, six delta specs and tasks agree on Node
200 code units versus Cloudflare 48 code units / 50 escaped UTF-8 pattern bytes.

Cleanup verification:

- Shared DB build and tests: passed, 22 tests.
- Test-utils build and both platform TypeScript compilations: passed.
- Focused Node repository tests (literal LIKE, sort, cursor, list): 16 passed,
  164 skipped.
- The same focused actual local D1 repository tests: 8 passed, 82 skipped.
- Root typecheck: passed, 36 successful tasks plus project TypeScript check.
- Root lint: passed, 21 successful tasks.
- Root format:check and strict OpenSpec validation: passed.
- OpenAPI regenerated; openapi:check passed with isolated Git metadata seeded
  from the intended generated artifact, without staging the real working tree.
- No references to the removed compiler or ASCII/Cyrillic-insensitive promise
  remain in production sources or current planning (historical notes excluded).

These checks verify matcher cleanup only. Runtime metadata, pre-read and adapter
budget enforcement, cursor/cache policy versioning and admin controls remain
unchecked tasks; Cloudflare's new rejection behavior is not yet implemented.


## Completed runtime, SQL and Admin implementation (2026-10-25)

- Contracts: 146 passed; runtime 200/null and 48/50 metadata round trips and
  legacy defaults, strict operands/members, UTC ranges, zero/false, namespaced
  sorts, detached capabilities and stable canonical filter/select identity.
- Application: 107 passed; immutable composition policy, original per-filter
  pointers, authorization/configuration resolution before reads, UTF-8/escaping
  boundaries, trim versus preserved contains whitespace, text eq 200 and role
  parity. Caller/config cannot override policy.
- Server: 88 passed; listOptions actually propagated through the metadata
  mapper (a real-browser finding now covered by regression), advertised runtime
  limits, value-free 422 paths, raw filter JSON bounds/duplicates/legacy queries.
- Config: 72 passed and type tests passed; legacy serialized models/hashes,
  structural/full/public identity, detached options and consumer keys named
  listOptions remain covered.
- DB: 23 passed, including fresh/populated migration, ordinary LIKE semantics,
  fixed query fingerprints, runtime/version cursor expiry and literal punctuation.
- Node complete repository corpus: 187 passed (file-backed/in-memory SQLite).
- Actual local D1 repository plus D1 adapter suites: 106 passed. Local D1
  migration public-identity case: 1 passed (8 unrelated cases excluded).
- Admin complete unit/component suite: 832 passed in 179 files. Covers two-stage
  metadata/URL resolution, hidden sorts, false/zero, optional/inverted ranges,
  select OR, UTC dates/times, byte-aware invalid drafts, query keys, retained
  rows and explicit first-page restart without stale-cursor retry.
- Real HTTP/browser acceptance: 4 Playwright scenarios passed in 29.3 seconds,
  using migrated file SQLite and actual Miniflare/workerd D1, the production
  REST app/use cases/adapters and built Admin assets. Only authenticated actors
  are fixture identities; list requests are not mocked browser routes. Covers
  all roles, visible/hidden configured operations, combined filters, ASCII search,
  exact versus changed Cyrillic case, literal wildcards, Node 200/Cloudflare 48/50
  budgets, stale URL recovery, reload and Back/Forward, keyboard activation,
  bounded long-string paging and edited/deleted anchor recovery. Axe WCAG A/AA
  checks pass. An existing counter opacity reduced contrast and was removed.
- Documentation check/build: 19 pages verified, including links/fragments/assets
  and OpenAPI; docs unit tests 3 passed. Generated scenario-guide tests: 9 passed.

The new shared repository cases include long text/textarea/select/URL boundaries,
shared prefixes beyond 4096 characters, both directions, ties/missing/empty/zero/
false, scalar type checks, foreign/replaced/revised/rank-mismatched anchors,
status membership changes, rejected stale saves, immutable public reads and
lookup/use races including empty pages. The materialized CTE and validity sentinel
resolve/use/validate anchors in one item statement, without a separate lookup or
full draft projection. The string-anchor discriminator is explicit; obsolete
custom cursor formats safely fail at /after.

### Measured 1,000-entry query evidence

Fixture: 1,000 mixed entries, 900 in the requested model and 100 in another,
including one approximately 900 KB draft field. Page sizes 1, 10 and 100. Each
measurement includes first-page plus continuation reads. Default unconfigured
ordering retains the existing model-entry index. Configured field queries scan
model-scoped drafts; this is not an indexed large-catalog search claim.

| Runtime/path | First statements | Continuation statements | Combined elapsed (ms) |
| --- | --- | --- | --- |
| SQLite file, default | 2 | 2 | 1 |
| SQLite file, numeric scalar | 2 | 2 | 3–4 |
| SQLite file, string anchor | 2 | 2 | 4 |
| SQLite memory, all paths | 2 | 2 | 0–4 |
| Actual local D1, default | 2 | 2 | 11–14 |
| Actual local D1, numeric scalar | 2 | 2 | 12–14 |
| Actual local D1, string anchor | 2 | 2 | 11–13 |

D1 rows_read (first/continuation, page sizes 1/10/100): default
1805/1806, 1823/1824, 2003/2004; numeric 4502/4501, 4502/4492, 4502/4402;
string 4502/4515, 4502/4524, 4502/4614. These include items and totals and are
local D1 observations, not remote CPU/quota guarantees. String continuations add
zero statements; no per-entry application JSON loads or query indexes were added.
A targeted search/range returns an entry beyond the first default page, including
the near-limit field. Accepted common patterns return matching items/totals across
runtimes. Cloudflare rejects 51-byte patterns before SQL (zero statements), while
exactly 50-byte ASCII/Cyrillic/escaping/mixed-script/emoji patterns match. Node
accepts 200-unit q/contains; text eq retains 200 units on both runtimes. Underlying
backend failures are not replaced by truncated/partial pages.

### Documentation ownership and compatibility

Updated public content modeling, editing lists, synchronization and API reference;
internal node-api/configuration-sync guidance and docs/collection-queries.md;
and the generated lace-operations guide. Examples include every filter family,
field:<key>, hidden targets, resource/UTC/matching rules, rollout, conservative
legacy fallback, source mismatch after rollback/re-upgrade, bounded anchors and
query-preserving restart. Published API/export ordering remains unchanged; no
snapshot backfill, query index or persisted cursor state was added. Existing
legacy URL/system-sort behavior stays covered. Keep additive columns/history on
rollback and expire old-format cursors safely.


## Final quality gates (2026-10-25)

- `pnpm typecheck`: passed, 36 successful Turborepo tasks plus root project check.
- `pnpm lint`: passed, 21 tasks plus dependency-boundary/admin-color checks;
  existing advisory warnings remain.
- `pnpm format:check`: passed, 1435 checked files.
- `pnpm openapi:generate`: passed. `pnpm openapi:check`: passed with an isolated
  temporary Git index seeded from the intended generated artifact. This verifies
  regeneration equality without staging/committing the shared working tree;
  the normal check's uncommitted-artifact Git guard still requires the eventual
  owner commit. Real repository index/history were not changed.
- `pnpm exec openspec validate add-configurable-collection-queries --type change --strict`:
  passed. `git diff --check`: passed.
- Final explicit string-anchor/calendar-boundary regression: 4 Node cases and
  4 actual local D1 cases passed (the latter includes the 1000-entry metrics and
  byte-boundary corpus); scalar cursors reject impossible calendar dates.
- Final real Node/local-D1 HTTP browser acceptance: all 4 scenarios passed in
  29.4 seconds against the latest format and focus/restart behavior.
- The final focused collection widget suite passed 16 tests; the earlier full
  Admin suite passed 832, and no unrelated behavior was changed afterward.
- Docs check/build passed and generated guide scenarios passed 9 tests. Public
  synchronization prose was reconciled with the internal no-build exceptions.

All 19 tasks are complete. No publication or remote deployment was performed.
Local D1/browser evidence does not assert production Cloudflare CPU/quota or
remote deployment acceptance.


## Owner-requested archival (2026-10-25)

Created branch `codex/add-configurable-collection-queries`. Synchronized the new
`collection-query-options` capability and five modified capabilities into main
specs. Verified every delta requirement and scenario, retained unrelated
requirements, and passed strict validation of all 79 main specs before moving
the complete change (including .openspec.yaml and all 19 checked tasks) to
`openspec/changes/archive/2026-10-25-add-configurable-collection-queries`. Updated
backlog completion and the internal verification reference to the archive path.
The owner also authorized a commit of the task on this branch.

After staging the owner-authorized commit, direct `pnpm openapi:check` passed
against the real repository index; the earlier temporary-index caveat no longer
applies to the staged artifact. Final format and diff whitespace checks passed,
and strict validation passed for all 79 synchronized main specifications.

## CI follow-up: in-memory identity and legacy Node fixtures

The first PR #60 CI run for d4574dd failed in @lacecms/test-utils with three
assertions. The in-memory adapter had not retained publicProjectionHash and
publicProjectionSourceHash, so later synchronization kept requesting baseline
recording rather than reaching a no-op. The list-input assertion also omitted
new runtime listQueryLimits. These suites were missed by the original focused
verification, despite the Node/D1 repository corpus passing.

The in-memory final model state now carries both public identity values, matching
the SQL adapters, and raw public identity/source changes participate in stale-plan
comparison. The list-input expectation includes Node 200/null. Added regression
cases verify query-only enable/edit/remove without public state/build changes,
idempotent repeats, and rejection of concurrent changes to either identity value
even when the derived plan remains the same. All 54 test-utils tests pass.

The complete root test run then exposed five older Node-test expectations:
the migration count did not include 0011, populated-migration snapshots did not
expect its two null columns, and the EXPLAIN query-plan fixture used positional
arguments against numbered SQL parameters. Counts now use the checked-in ledger;
full snapshot comparisons retain old data and assert the added null fields;
the actual captured list statement is explained with its numbered bindings,
retaining the entry-list index assertion. All 39 focused Node tests pass.

Follow-up checks: root typecheck (36 tasks plus project check), lint (21 tasks),
format check, direct openapi:check and full strict OpenSpec validation (81 items)
passed. The full root pnpm test run is used in addition to the focused suites;
PR CI is rechecked on the fix commit rather than relying on the original narrow
repository checks.

The follow-up GitHub Actions run 40240443188 for cb2b99f passed the complete Test
and Build steps. It then exposed stale generated-project snapshot hashes for
the intentionally updated docs/lace-operations.md. Reviewed all six current
variants: the generated tree, template version, every other digest and manifest
entry are unchanged; only that guide's digest and managed manifest hash differ.
Regenerated current snapshots with the existing acceptance command and verified
them again without --update. Historical template snapshots were not changed.

Local pnpm acceptance:starter and pnpm acceptance:existing-site both passed on
packed packages after the snapshot correction; the additional docs locale/fixed-
version build passed as well. All 212 standalone root tests passed. The local
all-package run encounters the existing Docker safety refusal in four CLI tests
because this machine has no Docker daemon; that protection was not bypassed.
The complete Test step was instead confirmed on the GitHub runner above.
