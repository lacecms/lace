## MODIFIED Requirements

### Requirement: The build export declares its format version
The build export SHALL carry a required `formatVersion`, a positive integer
that identifies the export's structure. The format version SHALL be `2` for
the structure defined by this contract. Adding an optional key or a key that
older consumers may ignore SHALL NOT change it. Removing a key, changing a
key's type, or changing the meaning of a value consumers rely on SHALL require
a new format version. The shared contract SHALL expose the highest format
version it defines as a constant. The strict build-export variant SHALL accept
only that current format version. The tolerant variant SHALL accept any
positive integer, so a consumer can recognize and report a newer format.

Format 2 SHALL require `internalLinks` arrays on delivered entries/globals;
format 1 compatibility SHALL remain available to tolerant consumer parsing for
old fixtures. This bump SHALL make old build SDKs fail before rendering an
unsupported field-target grammar. Generic public JSON fields retain their
transport representation; new reference strings require link-aware consumers.

#### Scenario: The current API sends an export
- **WHEN** a build client reads the export from either runtime
- **THEN** the response carries `formatVersion: 2`, and strict validation
  succeeds

#### Scenario: An export lacks the format version
- **WHEN** an export payload has no `formatVersion`, or carries `0` or `1.5`
- **THEN** both the strict and the tolerant build-export variants reject it

#### Scenario: An export declares a newer format
- **WHEN** an otherwise valid export payload carries `formatVersion: 3` while
  the contract's current format version is 2
- **THEN** the strict variant rejects it and the tolerant variant accepts it
  with `formatVersion: 3`

#### Scenario: Older builder cannot silently emit tokens
- **WHEN** a format-1-only SDK requests a new server's export
- **THEN** it rejects format 2 with its upgrade diagnostic before producing HTML

## ADDED Requirements

### Requirement: Admin internal link queries and receipts are strict and bounded
The authenticated API SHALL expose:
- `GET /api/v1/admin/link-targets` with optional `modelKey`, `status`, `search`
  (at most 100 characters), `after` and `limit` (1–50, default 20);
- `POST /api/v1/admin/link-targets/resolve` with `{ids}` containing at most 200
  distinct valid IDs, returning statuses keyed by ID without per-ID requests;
- `GET /api/v1/admin/entries/:entryId/link-impact` with `action` (`delete` or
  `unpublish`), `after` and `limit` (1–50, default 20); its location-page mode
  SHALL instead accept `sourceEntryId`, `snapshotId` and `locationsAfter` with
  `action`/`limit`, rejecting a mixture of source-page and location-page cursors.
Search SHALL be a documented normalized title-prefix search, not a site-wide
substring scan. Picker targets SHALL expose ID, model key/kind, display title,
publication status and current published path when present; globals SHALL be
excluded. Resolver states SHALL be `published`, `unpublished`, `missing` and
`non-routable`, without fabricating a missing title.
`status` SHALL accept only `published` or `unpublished`; omission SHALL include
both. Source-page responses SHALL use `mode: sources`, at most the requested
groups and at most 10 initial locations per group with `nextLocationsCursor`.
Location-page responses SHALL use `mode: locations` with at most `limit`
locations and their continuation. Receipts/cursors SHALL be at most 4096
characters. Search comparison SHALL trim the prefix and be ASCII case-insensitive
with non-ASCII characters matched exactly; SQL wildcard characters SHALL be
literal input rather than expanding the search.
Impact SHALL expose source groups by current snapshot phase/visibility, exact
locations through bounded location cursors, `hasPublishedUsages`, an opaque
impact receipt and continuation cursors. Both entity and location pages SHALL
be bounded. Cursors/receipts SHALL bind target, action and dependency revision;
an outdated page SHALL return 409 `CONTENT_LINK_IMPACT_CHANGED` rather than mix
sets. All reads require `content:read`; unknown keys, bad limits, malformed IDs
or foreign cursors SHALL fail strict validation before content reads.

#### Scenario: A highly linked target
- **WHEN** a target has 1,000 source entities and one source has 200 locations
- **THEN** the API exposes all entities and locations through bounded pages without returning the complete graph in one response

#### Scenario: Batch resolver and viewer
- **WHEN** a viewer resolves 200 IDs in one valid request
- **THEN** it returns their permitted statuses in one response and grants no mutation permission

### Requirement: Delete and unpublish accept an explicit link impact acknowledgment
Existing delete and unpublish requests SHALL accept optional
`linkImpact: {receipt, acknowledgePublishedLinks: true}` in their strict command
body. Delete SHALL retain its existing precondition transport, accepting an
optional strict JSON body without requiring one for unreferenced entries.
Unpublish SHALL retain its expected published snapshot and idempotency rules.
The receipt SHALL bind action, target, actor, existing target guards and incoming
dependency revision; it SHALL grant no authorization. Missing acknowledgment
when required SHALL return 409 `CONTENT_LINKS_IN_USE`; a stale/cross-target/
cross-action receipt SHALL return 409 `CONTENT_LINK_IMPACT_CHANGED`. Validation
and authorization errors SHALL remain sanitized. OpenAPI SHALL describe the
queries, DTOs, new issue/error codes and recovery.

#### Scenario: Legacy unreferenced request
- **WHEN** a valid existing client deletes or unpublishes an entry without published-visible incoming links and sends no new option
- **THEN** the command retains its existing response and precondition behavior

#### Scenario: A receipt cannot authorize another command
- **WHEN** a receipt for target A/unpublish is submitted for target B/delete
- **THEN** the request fails without any mutation

### Requirement: Published URL reference manifests describe only delivered locations
Published entry/global DTOs SHALL optionally carry `internalLinks`, an array of
`{sourceKey, area, pointer, targetId}` where area is `fields` or `data`.
New servers SHALL emit the array, including `[]`, on every returned
entry/global. Manifest locations SHALL exactly match canonical reference values
in delivered model/global URL fields and block data, excluding hidden blocks,
block settings and every other field kind. Values in `fields`, `data` and
`settings` SHALL remain authored values; reference tokens occur only at declared
ordinary URL locations in fields/data. No editorial metadata or target drafts SHALL
enter public responses. Strict and tolerant DTO variants SHALL validate the new
known property; format 1 input without it SHALL normalize to an empty array.
Single public reads SHALL return only local manifests and SHALL NOT fetch target
entries recursively. SDK/site consumers SHALL resolve explicitly before href
output; a string's transport type alone SHALL NOT assert that it is an href.

#### Scenario: Public visibility boundaries
- **WHEN** a published global has a visible nested URL reference and a hidden block reference
- **THEN** its public manifest includes only the visible location and contains no draft title or hidden block data

#### Scenario: Public read is independent of target fan-out
- **WHEN** a page references 200 distinct entries
- **THEN** reading that page returns its local manifest without 200 target requests
