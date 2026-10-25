# Configured collection queries (internal)

CQ1 adds opt-in Admin draft queries. Public authoring and operator instructions
live in `apps/docs/src/content/docs/en/latest/content-modeling/index.md`,
`editing-content/index.md`, `content-modeling/synchronization.md` and
`reference/api.md`. Architecture §§8, 9, 12, 16 and 17 and the OpenSpec capability
remain authoritative. This document records implementation boundaries.

## Configuration and transport

Collection `listOptions` separately declares `sortableFields`, `filterableFields`
and `searchableFields`, independent of `listFields`. Each ordered list has at
most 16 distinct top-level keys. Sort/filter allows text, textarea, URL, select,
number, boolean, date and datetime; extra search allows only text/textarea.
Pages/globals and nested/composite/block/SEO/media/rich-text targets are refused.
Empty arrays/options disappear; omission preserves old serialized metadata and
structural/full hashes. Query metadata is detached. Consumer field/default keys
named `listOptions` retain their structural meaning.

The API retains system title/slug search, status and system sorts and adds
`field:<key>` / `-field:<key>` and strict JSON filters:

- text/textarea/URL: `{field,op:"eq"|"contains",value:string}`;
- number: `{field,op:"eq",value:number}` or inclusive `{field,op:"range",min?,max?}`;
- boolean: `{field,op:"eq",value:false|true}`;
- select: `{field,op:"in",values:[...]}` (OR, 1–50 configured distinct strings);
- date/datetime: inclusive `{field,op:"range",from?,to?}`; dates use YYYY-MM-DD,
  datetimes require offsets and normalize to UTC;
- every enabled type: `{field,op:"isSet"|"isNotSet"}` with no operands.

Filters combine with AND, at most 16, one per field; raw decoded filters JSON is
bounded to 8192 UTF-8 bytes before parsing. Optional empty bounds are omitted;
zero and false remain present. Unknown members/fields/operators, duplicate query
parameters, inverted bounds and invalid select options return value-free 422
issues. Totals apply search/field filters, independently of selected status,
page size and cursor. Application authorization and active configuration
resolution precede persistence; all three roles share read behavior.

## Matching and runtime policy

`literalLikePattern` is shared through content/DB; q and contains bind ordinary
SQLite LIKE with ESCAPE. Backslash, percent and underscore are escaped before
the two substring wrappers. ASCII case is ignored; non-ASCII case is retained,
including distinct Е/е/Ё/ё and Ukrainian/Serbian letters. There is no normalization,
GLOB case-pair expansion, chunk matcher, ICU, FTS or application JSON scan. Text
eq binds `= COLLATE NOCASE` and keeps 200 UTF-16 units without a pattern budget.

Composition supplies immutable `ListQueryLimits`:

| Runtime | UTF-16 units (q/contains) | Final escaped pattern UTF-8 bytes |
| --- | --- | --- |
| Node/VPS | 200 | no separate bound |
| Cloudflare | 48 | 50 |

48 ordinary ASCII characters, 24 Cyrillic letters, 24 percent signs or 12 emoji
produce exactly 50 pattern bytes. Appending one ASCII character exceeds the byte
budget, even if the character count fits. q trims before measurement; contains
preserves whitespace. Both application and adapters validate before SQL; adapters
replace caller policy with their own. Invalid q maps to `/q`, contains to the
original `/filters/<index>/value`. Runtime metadata always advertises the policy
alongside model-list items; legacy absent limits default to 200/null. Limits stay
outside all config/model hashes and synchronization.

Canonical cursor/cache identity includes `sqlite-like-v1`, effective limits,
model, q/status/sort, filters sorted by field and select operands sorted by stored
value, plus enabled targets/types/select choices. Labels and visible-column order
are excluded. Old GLOB formats, changed policy/capabilities/operands expire safely.
The admin waits for metadata before runtime validation and drops only stale URL
conditions; invalid editing drafts keep the last valid query without truncation.

## SQL, boundaries and recovery

Prepared JSON paths/operands operate over current drafts before LIMIT. Missing,
null and empty strings are unset and sort last in both directions; whitespace,
false and zero are present. String sorting uses complete NOCASE values; select
uses stored option strings. Datetime predicates/order/boundaries compare instants.
Every sort breaks ties by ID in the selected direction. Default ordering retains
the existing model-entry index; public ordering remains publication time plus ID.
Configured JSON queries can scan model drafts and are not indexed catalog search.

Custom cursors use a fixed-length SHA-256 whole-query fingerprint and stay within
4096 characters. Numeric/boolean/date/datetime boundaries embed typed scalars and
missing rank. Text/textarea/select/URL cursors carry bounded entry ID, current
draft snapshot ID, positive safe revision, rank and type; they never carry raw,
compressed or truncated sort strings or unbounded field names. A materialized,
indexed anchor CTE in the item statement reads the selected scalar/rank only and
validates model/current pointer/revision/rank atomically with boundary use. Its
left-joined guard reports invalid anchors even when the page has no items. First,
scalar-continuation and string-continuation paths each use two read statements
(items and totals), with zero extra lookup statements and no per-entry reads.

Any successful boundary-draft save, including unrelated fields, deletion or
replacement expires a string cursor. A rejected stale save does not; publication
alone need not expire it. Pure status changes do not require the boundary to remain
in the filtered status. Paging across requests is not snapshot isolation. Invalid
anchors return value-free 422 `/after`. The admin retains rows until Restart list,
then discards every cached page/cursor, retains q/status/sort/filters, fetches the
first page and announces recovery. It does not retry the stale cursor or append
fresh results to old pages.

## Deployment and public identity

Run migration 0011 before deploying new API/admin, then run ordinary sync. Only
nullable `content_models.public_projection_hash` and
`public_projection_source_hash` are added, with ordered Drizzle metadata. No
content backfill, field-query index, persisted cursor state or editorial mutation
is introduced. Runtime `publicProjectionHash` hashes the existing projection
input excluding only root collection listOptions; it is never serialized into
REST or exports. Full projection identity still includes options, and old hashes
and metadata remain byte-compatible on omitted options.

Trust a stored public baseline only with two valid SHA-256 hashes and source
matching the stored full hash. For unchanged structure/version, compare trusted
public identities to derive public impact. Query-only enable/edit/remove/reorder
updates metadata without a public-version/build change. Labels, listFields, SEO
and blocks remain public identity inputs; mixed query/SEO changes still advance
once and coalesce one build. Without a trusted baseline, equality of stored full
identity with configured full or public identity proves safe seeding. Otherwise
retain a conservative one-time rebuild. Baseline-only seeding uses the existing
record-baseline operation and repeated identical sync writes nothing.

Both raw columns participate in prepared-state equality, reports and Node/D1
stale-plan guards, including D1 SQL JSON state. The guarded final mutation writes
them with full identity/structure atomically; injected failure rolls everything
back. Rollback retains columns/history. An older binary may update full identity
without the pair; re-upgrade detects the source mismatch and uses legacy proof/
fallback rather than trusting stale public identity. Roll back code/config
together; unsupported newer URL parameters may need clearing on older binaries.

Verification commands and measured Node/local-D1/browser evidence live in
`openspec/changes/archive/2026-10-25-add-configurable-collection-queries/verification.md`. Local D1
is Miniflare/workerd, not a claim of remote deployment acceptance. Bulk actions,
public queries/order changes and query schema/index expansion remain outside CQ1.
