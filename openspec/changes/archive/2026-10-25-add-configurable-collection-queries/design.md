## Context

See proposal.md for the selected CQ1 backlog session. This design is required because the change crosses configuration, contracts, authorization, SQL and admin URL state.

Observed implementation:

- `packages/config/src/index.ts` defines CollectionModelInput and projection-only listFields, validates top-level field keys and builds structural/projection hashes.
- `packages/db/src/sql-content.ts` shares ENTRY_SOURCE_SQL, ENTRY_SEARCH_SQL and ENTRY_SORT_SQL across Node/D1. Current search uses SQLite lower(), which does not provide Cyrillic folding; system title sort uses NOCASE. Draft fields remain fields_json TEXT.
- `packages/application` authorizes reads and resolves active model metadata. `packages/contracts` and `packages/server` own validated transport and generated OpenAPI.
- `apps/admin/src/app/router/collection-search.ts` currently validates only system sort, q and status before model-specific configuration is considered. CollectionEntries, EntryListToolbar, EntryListTable and list-columns own the list UI.
- Architecture §§4.4/4.7, 8, 12, 16, 17 and 20 require immutable publication, code-first metadata, cursor pages, portable prepared SQL and meaningful cross-runtime verification. Existing D1 batches and editorial concurrency stay unchanged.

## Goals / Non-Goals

**Goals:** One serializable, bounded query model shared by the API, read ports, URL state and both adapters; model configuration is authoritative for capability checks. One additive migration persists public-projection identity for safe synchronization classification. No content backfill or new field-query index is necessary for the initial scale.

**Non-Goals:** See proposal exclusions. Cyrillic/non-ASCII case folding, segmented search, ICU, FTS and a persisted search projection are excluded. Text matching and string sorting use SQLite ASCII-only case-insensitive behavior.

## Decisions

### Configuration and identity

Add `listOptions?: { sortableFields?: [...], filterableFields?: [...], searchableFields?: [...] }` on collections only. Use operation-specific mapped key types, including descriptor variants, so number search and composite queries fail static checks. Normalize strict inputs, deep-freeze/detach and project through all model metadata schemas. Each array preserves order and is bounded to 16 keys; empty options disappear, preserving old hashes. Exclude this container only at its descriptor location from structural identity; include nonempty settings in projection identity. Consumer field/default keys named listOptions must remain structural. A changed listOptions is display-only sync, needs no model version increment and modifies no values. When public identity is proven unchanged it schedules no build; the legacy fallback below covers records whose old public identity cannot be established.

Keep listFields as column selection. Do not replace it with an object format: independent capabilities avoid a breaking configuration change and allow hidden searchable/filterable fields.

### Public-projection identity and synchronization

The task 2.2 implementation probe found that `StoredContentModelState` has only
the full projection hash and a structural baseline. `label-update` advances
public state unconditionally. That state cannot distinguish a listOptions-only
edit from a simultaneous SEO fallback change. On 2026-10-24 the user approved
persisting a separate public-projection identity, including migration, legacy
fallback and synchronization tests. This supersedes the original assertion
that CQ1 introduces no persisted state.

Config computes runtime-only `publicProjectionHash` using the existing
per-model projection hashing input with only the collection's root listOptions
removed. Keep all other inputs, including labels, listFields, SEO and block
metadata, to preserve existing rebuild behavior. Do not recursively strip
consumer keys named listOptions. Exclude this new hash from the serializable
projection, structural/full projection hash inputs and REST metadata. No new
whole-config or client-visible hash is needed. Configurations without options
have equal model public/full projection hashes; omitted/empty settings keep all
old hashes unchanged.

Add nullable TEXT columns `content_models.public_projection_hash` and
`public_projection_source_hash` with ordinary additive ALTER TABLE statements
and the repository's migration metadata. The source stores the full projection
hash for which the public hash was recorded. This association is necessary:
older binaries can update projection_hash while leaving unfamiliar columns
untouched. Trust a stored public baseline only when both hashes have valid
SHA-256 form and source equals the stored full hash. Never infer validity merely
from a non-null public hash. Migration initializes neither hash, reads no entry
JSON, and changes no content, published state or outbox work.

Use this deterministic classification for an existing model whose structure
and version are unchanged:

1. With a trusted public baseline, compare configured publicProjectionHash to
   the stored public hash. A listOptions-only edit/removal updates full identity
   without public-state/build work; other public projection changes still build.
2. With a missing/invalid/stale baseline, equality of stored full projectionHash
   with configured full projectionHash proves unchanged configuration. Equality
   with configured publicProjectionHash proves unchanged pre-listOptions public
   projection, including first enablement. In either case seed both new fields
   without public-state/build work.
3. Without either proof, preserve conservative existing rebuild behavior and
   record a trusted baseline in that same final mutation. This one-time fallback
   is explicit; do not claim legacy unknown identities always avoid builds.

Keep existing create/remove/rename/version/content-rewrite behavior. Metadata
changes remain label-update operations with derived public impact. If only a
public baseline needs recording, reuse a record-baseline operation even when a
structural baseline already exists. An unchanged fully baselined model remains
a true no-op. Reports distinguish metadata-only recording and public impact.

Application owns public-impact classification; Node and D1 persist both hashes
with the model/full identity and canonical structure in the existing guarded
final mutation. Carry raw stored hash/source values through prepared state and
include them in equality, stale-plan checks and D1's SQL JSON state guard.
Concurrent public-baseline recording invalidates an older plan even when full
projectionHash is unchanged. Seed/create/rename paths write the new pair; a
mixed listOptions + SEO change increments public state once and coalesces one
build, with every metadata/content write rolled back on guard failure. No extra
D1 mutation batch is needed. Do not suppress every label-update build or update
the hashes through an unguarded post-commit write.

Rejected alternatives: reconstructing the previous projection from structure
loses SEO/display inputs; skipping all projection-only builds breaks SEO;
checking only removal of current listOptions cannot recognize later edits or
removal; a standalone public hash can become stale across rollback-era writes.
Persisting the hash and its source gives a bounded per-model baseline without
copying configuration or expanding the query index/schema.

### Query representation and normalization

Retain q/status/limit/after and system sort values. Add `field:<key>` and `-field:<key>` sorts to avoid collisions with title/publishedAt. Define strict filter discriminated unions:

- `{field, op: "isSet" | "isNotSet"}`;
- `{field, op: "eq", value}` where value has the declared primitive type;
- `{field, op: "contains", value: string}`;
- `{field, op: "in", values: string[]}` for select;
- `{field, op: "range", min?: number, max?: number}` for numbers;
- `{field, op: "range", from?: string, to?: string}` for dates/datetimes.

Wire filters is JSON in one `filters` parameter. Bound raw decoded UTF-8 bytes to 8192 before JSON.parse; cap filters at 16, one per field, select values at 50, text operands at 200 UTF-16 code units. Reject unknown members, duplicate parameters, invalid numbers/ranges and disallowed operators; never coerce string "false" into boolean false. Date range endpoints are dates; datetime endpoints require offsets and normalize to UTC before comparison and cursor/query hashing. Filter text is literal and retains whitespace; only q retains its existing trim behavior.

Canonical query binds the sqlite-like-v1 matching version and effective runtime limits and sorts filters by field and select values by their stored strings; canonical options target sets are independent of UI declaration order. Bind cursors to the effective query capability descriptor (enabled targets, relevant field types and select options), not the whole projection hash: changing a label/listFields order must not invalidate an otherwise identical query. Exclude labels/defaults unrelated to predicates. Include searchable target changes even if q itself did not change.

### Ordinary literal LIKE and platform budgets

On 2026-10-25 the user selected ordinary LIKE and a smaller Cloudflare search
budget while retaining Node/VPS's existing input limit. This supersedes the
GLOB case-pair design and the proposed chunk/adjacency matcher. No chunked
matcher was implemented; remove the existing GLOB compiler and its Cyrillic
case-pair table/tests. Keep the prepared shared SQL, typed predicates, totals,
projection identity and bounded-cursor work.

Compile q/contains as a literal LIKE substring: escape backslash, percent and
underscore using backslash, add one percent sign at either end and bind the
result with an explicit SQL ESCAPE clause. Brackets, asterisks, question marks,
quotes and non-ASCII characters remain ordinary literal characters. Do not
interpolate operands or enable case_sensitive_like. Standard SQLite LIKE ignores
ASCII case and retains Cyrillic/non-ASCII case. Use = COLLATE NOCASE for textual
eq, preserving literal ASCII-insensitive/non-ASCII-sensitive equality without
creating a pattern; select in retains exact stored-value matching.

Composition roots supply a portable policy:

- Node/VPS: maxSearchLength 200 UTF-16 code units; maxLikePatternBytes null.
- Cloudflare: maxSearchLength 48 UTF-16 code units; maxLikePatternBytes 50.

The Cloudflare byte budget applies to the complete escaped pattern, including
its two percent wrappers. Forty-eight unescaped ASCII characters or 24 ordinary
Cyrillic letters fit; escaped %, _ and backslash and wider Unicode characters
consume more budget. No simple fixed character count replaces UTF-8 measurement.
Trim q before measuring; preserve meaningful contains whitespace. Both q and
contains use this policy, while text eq retains the shared 200-code-unit limit.
Never truncate input, change query meaning or wait for D1 to reject it.

Application checks policy after authorization and active-field resolution but
before read-port calls. Node/D1 read adapters also enforce their own policy
before SQL even when called directly. The server maps excess q to /q and excess
contains to /filters/<index>/value with value-free 422 VALIDATION_FAILED. Shared
wire schemas keep a portable 200-code-unit ceiling; model-aware/runtime-aware
validation applies the stricter policy. A client cannot override policy using
query parameters or collection config. Published/content/media-list APIs are
outside this admin collection-query policy.

Expose listQueryLimits {maxSearchLength, maxLikePatternBytes} alongside items in
GET /api/v1/admin/content-models, always emitted by new servers. Shared response
schemas accept absence as Node/VPS 200/null for legacy responses. These are
runtime capabilities, outside configuration definitions, structural/full/public
hashes and config sync. API/admin deploy together. The admin waits for model
metadata, then validates URL q/contains using the advertised budget: discard
only invalid conditions, retain valid peers, and never query over budget.
While editing, retain invalid drafts, explain the budget and keep the last valid
query/results rather than truncate or issue invalid requests. Search maxLength,
byte-aware validation, filter editor and hints all use the same policy; existing
search debounce/history behavior remains.

Bind an explicit sqlite-like-v1 matching version and effective runtime policy
into cursor fingerprints and admin query/cache identities. A prior GLOB cursor
or cursor from a different budget expires safely. Labels/listFields-order remain
excluded. Limit changes must not reuse loaded pages or affect model hashes.

Verify ordinary LIKE parity on Node and actual local D1 for common accepted
inputs: ASCII case changes, exact versus changed Cyrillic case, Е/е/Ё/ё,
Ukrainian/Serbian/mixed scripts and literal wildcards. Separately prove Node
accepts a 200-code-unit term that Cloudflare rejects before SQL, Cloudflare
accepts exactly 50 final-pattern bytes and rejects 51, and escaping/multibyte
input is measured after q trimming. Test contains and equality independently,
metadata round trips, URL recovery and UI behavior under both policies.

Rejected alternatives: ICU/custom case folding and GLOB pair expansion retain
unneeded Cyrillic complexity; segmented matching adds SQL cost and maintenance;
normalization/FTS adds persisted state outside this selected scope. Ordinary
LIKE plus explicit runtime limits is the chosen behavior. Field-value lengths
and custom string-sort cursor anchors are unaffected by search-input budgets.

### Shared SQL and bounded reads

Extend shared DB SQL helpers and portable read-query types, keeping driver-specific execution in adapters. Resolve targets only from validated active model descriptors. Query system title/slug OR configured draft fields; combine with field predicates and status via AND. Extract scalars with bound safe JSON paths and use json_type checks to distinguish missing/null, booleans and numbers. Treat empty strings as unset, whitespace as present. Do not cast strings into numbers or stringify composite values. Number/boolean/date/datetime comparisons follow their types; stored datetime values must be compared by instant, including equivalent offsets, rather than raw mixed-offset strings. Use one common UTC-compatible expression/normalization for filtering, ordering and cursors, verified on both runtimes without field-storage schema changes.

For custom sorting, use an explicit missing rank (always ascending) followed by typed value and ID in the chosen direction. Continuation predicates must reflect the same tuple, including a distinct missing-value branch. Do not compare missing values through ordinary NULL equality. Preserve existing system sort semantics including never-published behavior; public collection sort remains publication timestamp plus ID. Custom numeric/boolean/date/datetime cursors embed validated typed boundaries;
custom string sorts use the bounded anchors defined below. Both carry missing
rank, direction/type discrimination and a fixed-length canonical query
fingerprint. Preserve system/public boundary semantics; safely reject obsolete
custom formats rather than interpreting them as the new format.

Build per-status totals with exactly the same search/field predicates but without selected status or cursor. Obtain items/totals in the existing grouped read pattern: no N+1 statements and no application scan of all content JSON. Keep the existing indexed default path when q/field queries are absent. Configured JSON sorting and substring predicates can scan matching model drafts: page limits bound returned data, not scanned rows. Do not claim an indexed large-catalog search. Measure with 1,000 mixed entries and near-limit draft fields, recording Node timing and D1 statement/rows-read evidence; initial acceptance requires fixed statement count independent of page size, model-scoped queries and no per-entry application loads. If measured costs require an additional query index/schema migration, revise this design before coding that expansion instead of silently adding one. Existing configured read paths must fail visibly on backend limits, never return silently partial results.

### Bounded custom string cursor anchors

A task 4.2 probe found that a valid 5,000-character text field creates a
6,756-character cursor when embedded, exceeding opaqueCursorSchema's existing
4,096-character limit. Text/textarea descriptors need not set maxLength. On
2026-10-25 the user approved bounded entry/revision anchors with an indexed
continuation lookup and rejection of edited/deleted anchors. This replaces the
original requirement to embed raw string boundaries; no content limit or cursor
transport expansion is introduced.

For every custom string type (text, textarea, select and URL), encode the entry
ID, current draft snapshot ID, positive safe draft revision, missing rank and a
string-anchor discriminator in the opaque versioned cursor. Use the existing
bounded identifier domain and a fixed-length SHA-256 fingerprint over the whole
canonical model/search/status/sort/filter/capability identity. Do not duplicate
unbounded field keys, values or target descriptors in the new custom cursor.
Direction and effective type must be validated against the request, directly or
through its fingerprint. Never embed or truncate the sort string. Missing string
values use the same anchor protocol. Custom numeric/boolean/date/datetime sorts
retain bounded normalized scalar values and missing ranks in their boundaries.
System and public cursors retain their existing boundary behavior.

After authorization, query/configuration resolution, format/type checks and
fingerprint validation, resolve a string anchor by model and entry ID against
its current draft pointer and revision. Read only the selected scalar and its
JSON type/missing rank, not the full fields JSON or entry aggregate. The anchor
must exist, still belong to the model and name the same current draft/revision;
its derived missing rank must agree with the cursor. A draft save invalidates
its anchor even when only another field was changed. Pure publication/status
changes need not invalidate an otherwise unchanged draft boundary. The anchor
need not still satisfy the selected status predicate: it supplies an ordering
boundary, not membership or authorization.

Apply the resolved complete string with the same NOCASE comparison, missing-last
rank, direction and ID tie break as first-page ordering. Lookup and boundary use
must share a database read snapshot or equivalent validity guard in the item
read; never trust an earlier unguarded lookup after a concurrent save. Anchor
validity must remain observable when zero rows match. An indexed anchor CTE in
the item statement may resolve and guard it together; otherwise a bounded anchor
read requires the same consistency guarantee. Allow at most one additional
constant indexed read statement per anchored continuation, none on first pages
or embedded-scalar paths, and no per-entry reads. Shared SQL/cursor helpers own
the semantics; adapters own execution. This adds no schema/index or persisted
cursor state. Record actual Node/D1 counts separately for first/continuation
pages and prove counts remain independent of page size.

A malformed, foreign, deleted, replaced, revision-changed or rank-mismatched
anchor returns a value-free 422 VALIDATION_FAILED issue at /after, without a
page or partial continuation. Never substitute an ID-only boundary, ignore an
invalid anchor or silently skip results. Fingerprint/shape rejection precedes
anchor reads. This is stable paging for unchanged content, not snapshot
isolation across user requests; unrelated entry edits may still move results.

On a cursor validation failure at /after, preserve previously loaded rows while
showing Restart list. That explicit action discards every page/cursor for the
current list and fetches the first page retaining all valid query parameters.
Do not append restarted rows to the old list or automatically retry the stale
cursor indefinitely. Keep recovery keyboard-accessible and announce the
restarted list; viewer/editor/admin behavior is the same. URLs never carry the
cursor and need no grammar change.

Rejected alternatives: larger transport cursors risk backend URL limits;
compression has no bound for arbitrary strings; prefixes/truncation misorder
shared prefixes; rejecting long values narrows the allowed field model. Indexed
anchors retain exact ordering with bounded transport at the cost of explicit
expiry when the boundary draft changes.

### Layer responsibilities and error transport

Config owns typed capabilities and identity; contracts owns strict DTOs, operand limits and metadata; application validates model-aware operation permissions before reading and passes a portable resolved query; db owns safe SQL/pattern/cursor helpers; Node/D1 own execution. Server maps rejected query details into existing 422 VALIDATION_FAILED pointers while preserving application invalid-state conventions. Audit error messages for value-free output, especially filter operands; no search/filter text in new operational logs. No new telemetry is necessary; preserve request IDs and existing list retry errors. Do not expose SQL fragments or persistence rows above db/adapters.

### Admin controls and URL recovery

Keep one active sort and add a selector covering system plus all configured fields. Only enabled visible headers become sortable. A field filter affordance and the general Filters control open the same condition editor, so hidden fields are available without extra columns. Reuse existing accessible popovers, native inputs and select/checkbox patterns; no new UI dependency. The editor selects type-compatible operators; blank optional bounds are omitted but false/zero are retained. Invalid local ranges keep the last valid query and show an inline explanation. Active conditions show field labels and readable values, removable individually. Clear-all resets q/status/field filters while retaining valid sort.

Split URL validation into shape parsing then model-aware resolution after metadata is available. Do not discard a legitimate field sort before the collection loads. Drop malformed/stale URL conditions, retaining valid peers and falling back to default sort; direct API requests remain strict. Canonicalize filters into the URL and query key, omit empty/default parameters, never write cursors to URL, reset all loaded pages when effective predicates/sort change. Preserve debounce/replace for q and Back/Forward restoration. Use existing pending/error/no-match states; no-match recovery clears all filter types. Keep viewer query controls active. Status totals follow q and field conditions. A continuation validation failure at /after offers Restart list as specified above, retaining the query and replacing all cached pages on activation.

### Portability, atomicity and concurrency

List operations are authorized reads. Query execution needs no content backfill, extra D1 mutation batch or save/publish/revert maintenance hooks. Configuration synchronization additionally maintains the two public-identity columns described above within its existing guarded mutation. Existing optimistic guards and immutable public snapshots stay intact. Normal cursor paging is stable for unchanged data, not snapshot isolation across concurrent edits: do not claim otherwise. A saved draft can move between pages under concurrent editing as with current lists; configuration-semantic changes invalidate continuations rather than reinterpret them. Verify a stale save failure leaves both content and subsequent query results unchanged, so it does not invalidate an unchanged anchor; a successful save of the boundary draft does invalidate a string anchor.

## Risks / Trade-offs

- JSON predicates/substring matches require model-scoped scans → bounded input, no N+1, preserved indexed default path and recorded performance evidence; future indexes require a separately revised design.
- Runtime LIKE budgets and UI validation can drift → one escaping/byte-budget contract, server-side pre-read enforcement, advertised runtime limits and Node/D1 byte-boundary tests.
- Filter UI state can diverge from URL/configuration → two-stage resolution, canonical query keys and reload/Back/Forward/stale-config browser journeys.
- Custom string anchors expire after a successful boundary-draft edit or deletion → value-free /after validation plus explicit query-preserving Restart list; verify concurrent lookup/use and empty-page races.
- Existing opaque admin cursors may expire → stable validation error; URLs never contain these cursors.
- Date boundaries can shift with local time → UTC datetime inputs/labels, explicit offsets on wire, inclusive documented bounds and cross-runtime instant tests.

- Missing/stale public identity may hide a public projection change → prove equality from existing full hashes or rebuild conservatively; bind the new baseline to its full source and test rollback/re-upgrade.

## Migration Plan

1. During apply, select CQ1 in backlog, remove only field-value filters from the unordered candidate sentence (bulk actions remain deferred), and update architecture §§8, 9, 12, 16 and 17 before code. The approved identity revision is reflected in those documents before task 2.2 resumes.
2. Add the next ordered additive migration and Drizzle metadata for the two nullable model identity columns. Run the migration before the new binary on Node and local D1, including populated databases; verify no content/public-state/outbox changes. Do not backfill from the newly deployed config in migration SQL because the prior public projection may differ.
3. Ship runtime LIKE policy, literal escaping, advertised listQueryLimits, pre-read server/adapter validation and admin budget-aware recovery together with runtime public identity, guarded synchronization classification, configuration/metadata, contracts, query resolution, shared SQL and both adapters, then admin controls and OpenAPI together. Existing model versions and saved content remain unchanged. The first normal config sync seeds identity using the safe legacy proofs or conservatively rebuilds when neither proof holds.
4. Verify large/incompressible string and shared-prefix paging in both directions within the existing cursor bound; missing values, edited/deleted/replaced anchors, lookup/use races and empty-page validity; numeric/system/public regressions; constant read counts and browser restart recovery.
5. Verify enable/edit/remove/reorder and combined query+SEO changes, idempotent baseline recording, stale plans and injected atomic failures on Node and actual local D1. Document migrate-then-sync rollout and the legacy fallback; query-only updates with trusted/equivalent public identity require no rebuild.
6. Rollback code/config together while retaining the additive columns and migration history. Older code may conservatively rebuild and leaves new columns untouched; a later upgrade checks their source against the full projection hash and uses the legacy fallback when stale. New query URLs become unsupported on older admin/API; clearing parameters restores old behavior. No destructive down migration or snapshot restoration is required.
