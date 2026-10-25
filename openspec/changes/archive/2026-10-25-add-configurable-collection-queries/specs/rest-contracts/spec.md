## MODIFIED Requirements

### Requirement: Admin entry-list queries are validated and query-bound
The admin entry-list route SHALL accept optional `q`, `status`, `sort`,
`limit`, `after`, and `filters` query parameters. `q` SHALL be trimmed; an empty result
SHALL mean no search. Shared wire validation SHALL cap terms at 200 UTF-16 code units; trusted runtime policy SHALL enforce Node 200/null versus Cloudflare 48 code units/50 final-pattern UTF-8 bytes before list reads.
A search SHALL match entries whose draft title or draft slug contains the term,
using ordinary literal LIKE with ASCII-insensitive and non-ASCII-sensitive matching, also including configured searchable draft fields. `status` SHALL be one of `draft`,
`published`, or `changed` and SHALL restrict items to that status. `sort` SHALL
be one of `updatedAt`, `-updatedAt`, `title`, `-title`, `publishedAt`, or
`-publishedAt`, or configured `field:<key>` / `-field:<key>`. A leading `-` means descending, and the default SHALL be
`-updatedAt`. Title ordering SHALL be case-insensitive for ASCII letters.
Publication-time ordering SHALL treat never-published entries as earliest.
Every order SHALL break ties by entry ID in the same direction. An unsupported
status or sort, an over-long term, or an invalid limit SHALL return the stable
`VALIDATION_FAILED` envelope with a JSON Pointer naming the parameter. A
continuation cursor SHALL be accepted only with the same model, search term,
status, sort, canonical filters and effective list-query configuration that produced it; otherwise the request SHALL fail validation
without returning a page. The generated OpenAPI document SHALL describe these
parameters and the list response schema.

`filters` SHALL be a JSON-encoded array of strict typed filter objects as defined by collection-query-options; omission or [] means no field filters. Each object SHALL carry `field` and `op`, plus only the operator's operands: `value`, `values`, `min`/`max`, or `from`/`to`. Raw filters SHALL be bounded to 8192 UTF-8 bytes before parsing. Duplicate query parameters SHALL fail validation. The API SHALL return 422 VALIDATION_FAILED for malformed or disallowed queries with value-free issues at /filters, /filters/<index>/<member>, or /sort as appropriate. It SHALL not accept client-supplied search target lists. Per-status totals SHALL apply q and all field filters but not the selected status, cursor or page limit. Shared metadata schemas SHALL expose listOptions; generated OpenAPI SHALL document the complete grammar and bounds. Cursor fingerprints SHALL treat reordered filters and select-value lists as equivalent and reject configuration changes that alter effective query semantics, matching-version changes and runtime-policy changes.

Custom field cursors SHALL remain within the existing 4096-character transport
bound. Custom string sorts SHALL use the indexed entry/draft/revision anchor
protocol from collection-query-options; embedded scalar and existing
system/public boundaries SHALL retain their defined behavior. A malformed,
foreign, missing, draft-replaced, revision-changed or rank-mismatched anchor
SHALL return 422 VALIDATION_FAILED with a value-free issue at /after and no page.
The generated OpenAPI description SHALL document bounded opaque continuations,
anchor expiry and restarting from the first page with the same query. No raw
sort string or anchor contents SHALL be echoed in validation messages or logs.

GET /api/v1/admin/content-models SHALL emit listQueryLimits alongside items,
with maxSearchLength 200 and maxLikePatternBytes null on Node/VPS and 48/50 on
Cloudflare. Shared response schemas SHALL accept omitted limits with a 200/null
legacy default. Limits SHALL NOT be embedded in model definitions or their
hashes. New servers SHALL advertise their actual enforced policy. OpenAPI SHALL
document both budgets, UTF-8 accounting after literal escaping and wrappers,
ASCII-only case insensitivity and per-parameter validation pointers. contains
uses the same runtime budget as q; textual eq uses = COLLATE NOCASE and retains
200 code units. Over-budget contains SHALL fail at /filters/<index>/value. The
API SHALL NOT truncate or let D1 discover an oversized LIKE pattern.

#### Scenario: Search, filter, and sort a collection list
- **WHEN** an editor requests `q=Launch&status=changed&sort=title`
- **THEN** the response contains only changed entries whose draft title or slug
  contains `launch` in any ASCII case, ordered by title ascending, and `totals`
  counts every status among entries that match `launch`

#### Scenario: Reject an unsupported list query
- **WHEN** a client requests `status=archived`, `sort=author`, or a 201-character
  `q`
- **THEN** the API returns `422` `VALIDATION_FAILED` with the pointer `/status`,
  `/sort`, or `/q` and no list content

#### Scenario: Reject a cursor from a different query
- **WHEN** a client reuses a cursor from a `sort=title` page with
  `sort=-updatedAt` or with a different `q`
- **THEN** the API rejects the request with a validation failure instead of
  returning an inconsistent page


#### Scenario: Field sort and typed filters
- **WHEN** a configured collection receives sort=-field:year and filters=[{"field":"category","op":"in","values":["news"]},{"field":"year","op":"range","min":2020}]
- **THEN** it returns all matching entries in descending numeric year order, subject to the requested page size, with totals across statuses for those same conditions

#### Scenario: Reordered equivalent conditions retain the cursor
- **WHEN** filter objects or select operands are reordered without changing their meanings
- **THEN** the continuation cursor remains valid, while a changed operand or removed query permission invalidates it

#### Scenario: Malformed filters fail safely
- **WHEN** filters is malformed JSON, over 8192 bytes, names a disabled field or has a wrong operand type
- **THEN** the server returns 422 with a precise parameter pointer without echoing supplied values or running the list read



#### Scenario: A string anchor expires after a successful draft edit
- **WHEN** a caller continues a configured string sort after its boundary draft revision changed
- **THEN** the API returns 422 VALIDATION_FAILED at /after, and the same query without after can load a fresh first page

#### Scenario: Long field values fit bounded opaque continuations
- **WHEN** a configured text/textarea value longer than 4096 characters ends a page
- **THEN** the API emits a cursor no longer than 4096 characters and accepts it for the unchanged boundary without embedding or truncating that field value

#### Scenario: Runtime metadata advertises search capabilities
- **WHEN** the admin requests content-model metadata from Node and Cloudflare
- **THEN** responses advertise respectively 200/null and 48/50, while legacy responses without listQueryLimits validate as 200/null and model hashes remain equal

#### Scenario: Over-budget Cloudflare search fails safely
- **WHEN** q or contains exceeds either Cloudflare's character ceiling or final escaped 50-byte pattern budget
- **THEN** the API returns value-free 422 validation at /q or /filters/<index>/value before list SQL, while Node accepts the same operand when within its 200-code-unit bound
