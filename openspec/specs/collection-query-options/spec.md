# collection-query-options Specification

## Purpose

Define collection-configured admin sorting, typed filtering and ordinary literal LIKE search while preserving existing lists and published delivery behavior.

## Requirements

### Requirement: Collection query capabilities are explicit configuration
A collection SHALL accept optional `listOptions` containing only `sortableFields`, `filterableFields` and `searchableFields`, each an ordered array of at most 16 distinct declared top-level field keys. Sort/filter targets SHALL be text, textarea, number, boolean, select, date, datetime or url; search targets SHALL be text or textarea. Pages and globals SHALL reject this option. Normalization SHALL reject unknown options, missing fields, duplicates, unsupported types and nested paths before startup. Typed configuration SHALL restrict keys by operation-compatible field type. Empty arrays SHALL be omitted; an empty options object SHALL normalize to omission. The normalized detached metadata SHALL preserve configured order. `listFields` SHALL remain independent: visibility alone grants no operation and hidden fields can be queried through the configured controls. System title/slug search, status filtering and existing system sorts SHALL remain enabled. Omission SHALL enable no extra fields and preserve the existing default `-updatedAt`.

#### Scenario: A hidden description is searchable
- **WHEN** `description` is in `searchableFields` but not `listFields`
- **THEN** the main search includes its draft text and no description column is added

#### Scenario: Invalid operation targets fail configuration
- **WHEN** searchableFields names a number, any option names `group.child`, or a page declares listOptions
- **THEN** normalization fails before startup and type tests reject the corresponding statically known invalid declarations

#### Scenario: Existing configurations remain unchanged
- **WHEN** a collection omits listOptions or supplies only empty arrays
- **THEN** normalized metadata and hashes equal those of omission and no extra field controls appear

### Requirement: Field sorts are typed and deterministic
A configured field sort SHALL order current draft values by number, boolean (false before true), date, UTC datetime instant or text/select/url string, as appropriate. String order SHALL use the existing SQLite-compatible NOCASE ordering (ASCII case-insensitive, otherwise binary); select order SHALL use stored option values, not translated labels or declaration order. Locale-aware and Cyrillic case-insensitive sorting are outside this contract. Only one system or field sort SHALL be active. Missing, JSON null and empty-string values SHALL sort after present values in both directions; false and zero SHALL be present. Equal values SHALL break ties by entry ID in the selected direction. Field keys colliding with system names SHALL remain independently addressable.

#### Scenario: Numeric order with missing values
- **WHEN** year values 2, 10 and absent are sorted ascending and then descending
- **THEN** the orders are 2, 10, absent and 10, 2, absent with stable ID ties

#### Scenario: Field and system titles are distinct
- **WHEN** a collection declares a user field named title and enables its sorting
- **THEN** `sort=field:title` sorts its draft field value while `sort=title` retains system title ordering

### Requirement: Custom field continuations have bounded typed boundaries
Every custom field cursor SHALL remain within the existing 4096-character
opaque-cursor transport bound, independently of allowed field-value length.
Custom string sorts (text, textarea, select and url), including their missing
values, SHALL encode a bounded entry ID, current draft snapshot ID, positive
safe draft revision and missing rank with an explicit string-anchor format.
They SHALL bind the whole canonical query/model/capability identity through a
fixed-length fingerprint, including direction and effective sort type, without
embedding unbounded field names or raw, compressed or truncated sort strings.
Custom number/boolean/date/datetime sorts SHALL retain bounded typed scalar
boundaries and missing rank. System/public boundary behavior SHALL remain intact.

After authorization, configuration resolution and cursor shape/fingerprint
validation, persistence SHALL resolve the complete string scalar through an
indexed model/entry lookup against the same current draft pointer/revision.
The derived rank SHALL agree with the cursor. It SHALL use the resolved scalar
in the same NOCASE/rank/ID boundary as the first page, preserving exact ordering
for long shared prefixes. Missing, model-mismatched, draft-replaced,
revision-changed or rank-mismatched anchors SHALL fail with a value-free 422
VALIDATION_FAILED issue at /after and no returned page. Anchor membership in
the selected status predicate SHALL NOT be required if its draft identity and
revision remain unchanged. Cursor identity SHALL NOT confer authorization.

Anchor lookup and boundary use SHALL share a read snapshot or equivalent atomic
validity guard, including a truthful failure when the result page would be empty.
No unguarded lookup/use race SHALL reinterpret an edited anchor. Implementations
SHALL permit at most one additional constant indexed lookup statement per
string-anchor continuation, independent of page size, and none for first pages
or embedded-scalar boundaries. They SHALL NOT load full draft JSON/aggregates or
perform per-entry reads to resolve an anchor, add persisted cursor state, or
introduce a query index/migration for this protocol. Normal paging remains
stable for unchanged data and SHALL NOT promise snapshot isolation across
requests. Node and actual local D1 SHALL share these rules.

#### Scenario: Long strings remain pageable within transport bounds
- **WHEN** configured text, textarea, select or URL values include long incompressible strings and equal prefixes beyond 4096 characters
- **THEN** unchanged data pages exactly once in either direction with NOCASE and ID ties, missing values last, and every emitted cursor at most 4096 characters without truncating the sort values

#### Scenario: Edited or deleted anchor expires explicitly
- **WHEN** a boundary draft is successfully saved, replaced or deleted after its string-sort page was read
- **THEN** continuation fails with value-free validation at /after rather than using a changed or absent boundary, even if the edit touched an unrelated field

#### Scenario: Rejected draft save does not expire an unchanged anchor
- **WHEN** a stale save fails without changing the boundary draft pointer or revision
- **THEN** its existing string-anchor continuation remains valid for unchanged data

#### Scenario: An anchor changes while a continuation is being read
- **WHEN** a save/delete races anchor resolution and item selection, including a would-be empty page
- **THEN** the read uses one valid read snapshot or rejects at /after, without combining a prior boundary with an invalidated anchor

#### Scenario: Anchored reads stay constant as page size grows
- **WHEN** the same string-sort continuation is requested at different supported page sizes
- **THEN** statement counts are fixed for that path with at most one additional indexed anchor lookup relative to the equivalent first page and no per-entry JSON loads

### Requirement: Filters have bounded type-specific semantics
Each query SHALL accept at most 16 filter objects, at most one per configured field. Filters on different fields SHALL combine with AND; select `in` values SHALL combine with OR. All filterable types SHALL support `isSet` and `isNotSet` with no value. Missing, JSON null and empty strings SHALL be unset; zero and false SHALL be set. Text/textarea/url SHALL support `eq` and `contains`, using literal SQLite ASCII-insensitive/non-ASCII-sensitive matching (eq via = COLLATE NOCASE, contains via LIKE with ESCAPE). Boolean SHALL support `eq` with a boolean. Select SHALL support `in` with 1–50 distinct configured option values, matched exactly. Number SHALL support `eq` with a finite number and `range` with inclusive optional finite `min`/`max`, at least one present. Date and datetime SHALL support `range` with inclusive optional `from`/`to`, at least one present; date uses validated YYYY-MM-DD and datetime uses validated explicit-offset ISO instants normalized to UTC. An inverted range, wrong operator/type, unknown object member, duplicate field, empty text operand or unsupported option SHALL fail validation. Text operands SHALL be bounded to 200 UTF-16 code units without silently trimming meaningful operand whitespace. Missing values SHALL never match equality, contains, select or range filters. Non-empty whitespace strings SHALL count as set.

#### Scenario: Conjunction with a multi-select filter
- **WHEN** category is filtered with in [news, events] and year with range min 2020
- **THEN** only entries in either category with year at least 2020 match

#### Scenario: False and zero are meaningful
- **WHEN** featured is false and priority is zero
- **THEN** both match isSet and their respective equality filters, and neither matches isNotSet

#### Scenario: Invalid ranges and excessive input are rejected
- **WHEN** min exceeds max, a datetime has no offset, a field appears twice, or 17 filters are supplied
- **THEN** the query fails validation with a pointer to the invalid filter and no list query runs

### Requirement: Search uses ordinary literal LIKE with runtime-specific limits
The single q term SHALL match when the draft system title, draft slug or any
configured searchable draft field contains it, using ordinary parameterized
SQLite LIKE with an explicit ESCAPE clause. ASCII A-Z/a-z SHALL match without
case sensitivity; Cyrillic and all other non-ASCII characters SHALL remain
case-sensitive. Е, е, Ё and ё SHALL remain distinct. No Unicode normalization,
case-pair expansion, GLOB compiler, segmented/recursive matcher, ICU, FTS,
transliteration or persisted search projection SHALL be introduced. Percent,
underscore and backslash in operands SHALL be escaped as literals before the
two substring percent wrappers are added. Other punctuation SHALL be literal.
All predicates SHALL run server-side before paging. Matching items, totals and
boundaries SHALL agree on Node and actual local D1 for queries accepted by both.

Node/VPS q and contains operands SHALL retain the 200 UTF-16-code-unit limit.
Cloudflare SHALL enforce both at most 48 UTF-16 code units and at most 50 UTF-8
bytes in the final escaped LIKE pattern, including wrappers and escape bytes.
The byte budget SHALL be authoritative for multibyte and escaped input. q SHALL
be trimmed before validation; contains whitespace SHALL be preserved. Text eq
SHALL keep its 200-code-unit bound on both runtimes and use = COLLATE NOCASE,
without a LIKE pattern. Numeric/boolean/select/date/datetime rules SHALL remain
unchanged. Search-input limits SHALL NOT restrict stored field lengths or the
bounded string-sort anchor protocol.

The platform SHALL supply trusted listQueryLimits {maxSearchLength,
maxLikePatternBytes}: 200/null on Node and 48/50 on Cloudflare. Application
validation SHALL reject excess input before invoking the list read port, and
adapters SHALL reject it before SQL when called directly. Excess q SHALL produce
a value-free 422 VALIDATION_FAILED issue at /q; excess contains SHALL name
/filters/<index>/value. Neither caller input nor collection config SHALL override
the policy. Inputs SHALL NOT be silently truncated or deferred to a backend
pattern error. This policy SHALL NOT change media-list or public API behavior.

Runtime metadata SHALL advertise the effective limits to the admin independently
of model configuration/hashes/sync. An explicit sqlite-like-v1 matching version
and the runtime policy SHALL enter cursor/cache identities so obsolete GLOB or
different-policy continuations expire safely.

#### Scenario: Existing collections use standard SQLite case behavior
- **WHEN** a collection title is Москва Launch
- **THEN** q=Москва or q=launch matches while q=МОСКВА does not, on Node and D1

#### Scenario: Cyrillic case and literal symbols are preserved
- **WHEN** a searchable field contains Ёлка [2026]*%_
- **THEN** Ёлка and the literal [2026]*%_ match within the runtime budget, while ёлка, Елка and елка do not

#### Scenario: Configured text participates in OR search
- **WHEN** only a configured description contains an accepted term and the title/slug do not
- **THEN** the entry matches subject to the active status and field filters

#### Scenario: Node retains its larger search budget
- **WHEN** a valid 200-code-unit q or contains operand is requested on Node/VPS
- **THEN** it is accepted, while the same over-budget request on Cloudflare fails validation before any list SQL

#### Scenario: Cloudflare counts compiled UTF-8 bytes
- **WHEN** the escaped substring pattern is exactly 50 bytes and within 48 code units
- **THEN** Cloudflare accepts it, while a 51-byte pattern fails at /q or /filters/<index>/value before SQL, including when escaping or multibyte input causes the overflow

#### Scenario: Equality does not inherit the LIKE pattern budget
- **WHEN** a permitted textual eq operand exceeds 50 UTF-8 bytes but stays within 200 code units
- **THEN** Node and Cloudflare accept it with ASCII-insensitive/non-ASCII-sensitive equality, independent of substring limits

### Requirement: Query configuration does not change editorial content
List queries SHALL require content:read and expose the same results to viewers, editors and administrators. They SHALL use draft field values and derived publication status, never search published values in place of draft values. Enabling/disabling operations SHALL NOT rewrite snapshots, advance revisions or alter public API/SDK/export ordering. Query-only synchronization SHALL NOT advance published state or request builds when a trusted baseline or legacy hash proof establishes unchanged public identity, following the synchronization requirement below. Missing or stale legacy identity without such proof SHALL use the explicitly conservative fallback. Unsupported field operations SHALL be rejected by the server even when a caller bypasses admin controls. Reads SHALL preserve existing authorization and bounded response limits.

#### Scenario: Draft edits affect only admin queries
- **WHEN** a published entry's category is changed only in its draft
- **THEN** admin category filters use the new value while public export and site output retain the published value

#### Scenario: Direct caller requests a disabled field
- **WHEN** a caller supplies a valid field filter for a field not enabled by configuration
- **THEN** the server rejects it rather than querying that field

### Requirement: Query eligibility derives from shared field type capabilities

Collection query configuration, shared metadata schemas, query resolution,
cursor validation and SQL construction SHALL obtain sort/filter/search
eligibility, the sort family of a field and the operators of its filter kind
from the field type capability declaration of `field-descriptors`. The
accepted sets SHALL stay as specified by this capability: sort and filter
targets are text, textarea, number, boolean, select, date, datetime or url;
search targets are text or textarea; text, textarea and url filters accept
`eq` and `contains`; select accepts `in`; number accepts `eq` and `range`;
boolean accepts `eq`; date and datetime accept `range`; every filterable kind
accepts `isSet` and `isNotSet`. Fields of the string sort family (text,
textarea, select and url) SHALL keep string-anchor continuations and NOCASE
ordering; datetime fields SHALL keep UTC-instant ordering and safe-integer
boundaries. Node SQLite and local D1 SHALL produce identical pages,
continuations and validation failures, because both use the same shared
statement builder.

#### Scenario: Unchanged query validation

- **WHEN** the existing collection query, cursor and repository contract
  suites run against Node and D1
- **THEN** every case passes without modification, including rejection of a
  `contains` filter on a number field at `/filters/<index>/op` and of a
  searchable number field during configuration normalization

#### Scenario: Server and admin agree on operators

- **WHEN** the admin condition editor lists the operators for each
  filterable field kind
- **THEN** the list equals the operators the server accepts for that kind,
  followed by `isSet` and `isNotSet`

### Requirement: Filter values are checked by one portable rule
The content package SHALL publish the presence operators (`isSet`,
`isNotSet`) that every filterable type supports, and one portable check that
returns whether a filter's operation and value are valid for a field filter
kind. The check covers the operator and operand rules of "Filters have
bounded type-specific semantics", including select option membership and the
50-value `in` bound. The application query validation and the admin filter
editor SHALL use that check instead of their own copies. Their pointers,
failure codes and admin messages SHALL stay unchanged. A shared parity table
SHALL show that the application and the admin accept and reject the same
filters. The per-kind operator table and everything derived from it
(capability discovery, OpenAPI and SQL) SHALL be unchanged.

#### Scenario: Application and admin agree on a filter
- **WHEN** the parity table supplies a select `in` filter with 51 values, a
  number `range` with min above max, or a text `contains` with an empty
  operand
- **THEN** the application query validation and the admin filter editor both
  reject it, and both accept the corresponding valid filters

#### Scenario: Presence operators have one declaration
- **WHEN** a maintainer adds a filterable field type
- **THEN** it supports `isSet` and `isNotSet` through the shared declaration
  without an edit in the application or the admin

### Requirement: Query metadata synchronization records a guarded public identity
The system SHALL persist nullable TEXT `public_projection_hash` and
`public_projection_source_hash` columns on `content_models`, identically on
Node SQLite and D1, without field-query indexes. A model row SHALL begin with
unknown public identity until synchronization records it. The full projection
hash SHALL continue including listOptions, while public identity SHALL use the
runtime model publicProjectionHash defined in content-model-configuration.
A public baseline SHALL be trusted only when both stored hashes are valid
SHA-256 values and its source equals the stored full projection hash.

For unchanged model structure and version with a trusted baseline, sync SHALL
compare configured and stored public identity to derive public impact. A
query-only enable/edit/remove/reorder SHALL update full model metadata and the
new identity pair without changing public state or build work. Public metadata
changes, including simultaneous SEO and query edits, SHALL retain the existing
single atomic published-state advance and build coalescing. Creates, removals,
renames, version changes and content rewrites SHALL retain their existing rules.

For missing, invalid or source-mismatched public identity, sync SHALL treat
the public projection as changed when the full projection hash differs: it
SHALL conservatively advance public state and coalesce build work when
applying the projection update, then record the new identity pair. When the
full projection hash is unchanged, it SHALL record the identity pair as a
baseline-only operation without a public-state advance or build. No stored
hash equality SHALL be used to prove an untrusted public identity unchanged.

Both identity fields SHALL be read, reported as synchronization metadata and
included in prepared-state equality and stale-plan guards on both runtimes,
including D1's SQL state comparison. The final guarded model mutation SHALL
write public identity, its source, full identity and canonical structure
atomically. A baseline-only update SHALL be a record-baseline operation without
a public version/build change; subsequent identical sync SHALL perform no writes.
A stale-plan or injected failure SHALL roll back the new metadata together with
other final-mutation writes. No unguarded post-commit seeding SHALL occur.
Internal public identity SHALL NOT be added to REST metadata or public exports.

#### Scenario: Query-only synchronization does not rebuild
- **WHEN** a collection with trusted public identity enables, edits, reorders or removes listOptions without another projection change
- **THEN** its full projection and identity source update atomically while snapshots, model version, published state and build work remain unchanged on Node and D1

#### Scenario: An unchanged model records its public identity once
- **WHEN** a model with a valid structural baseline but no trusted public baseline has a stored full hash equal to configured full identity
- **THEN** sync records the public pair as a baseline-only operation without a build and the next identical sync is a no-op

#### Scenario: Untrusted identity takes the conservative path
- **WHEN** no trusted public baseline exists and the full projection hash changes, even when the stored full hash equals the configured publicProjectionHash
- **THEN** sync advances public state once, coalesces one build request and records the identity pair without rewriting snapshots

#### Scenario: Mixed query and SEO changes still rebuild
- **WHEN** listOptions and an SEO fallback mapping change in the same synchronization
- **THEN** public identity changes, public state advances once and one build request is coalesced atomically, while content values remain unchanged

#### Scenario: Concurrent identity recording invalidates an older plan
- **WHEN** one sync records public identity after another plan was prepared, even if the full projection hash is unchanged
- **THEN** the older plan fails its stale guard without overwriting metadata or changing content, published state or outbox work

#### Scenario: Final mutation failure preserves every identity
- **WHEN** a fault occurs between writing model/public identity metadata and completing the final synchronization mutation
- **THEN** Node and D1 roll back both new fields with full/structural identity, canonical baseline and any public-state/build work
