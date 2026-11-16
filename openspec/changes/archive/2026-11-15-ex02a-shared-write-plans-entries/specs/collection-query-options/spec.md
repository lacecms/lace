## MODIFIED Requirements

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
maxLikePatternBytes}: 200/null on Node and 48/50 on Cloudflare. Every
application composition SHALL supply the policy explicitly. A missing policy
SHALL fail construction instead of selecting the Node policy. Application
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

#### Scenario: Application construction requires a policy
- **WHEN** a composition constructs the content application without trusted
  list-query limits
- **THEN** construction fails before any list is served, while Node and
  Cloudflare compositions supplying their policy advertise and enforce it
