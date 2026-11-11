## ADDED Requirements

### Requirement: Collections declare a default admin sort
A collection's `listOptions.defaultSort` SHALL be optional and written in the admin
entry-list sort syntax: one of `updatedAt`, `-updatedAt`, `title`, `-title`,
`publishedAt` or `-publishedAt`, or `field:<key>` / `-field:<key>` where `<key>` is an
entry of the same collection's normalized `sortableFields`. Normalization SHALL reject
any other value, a field sort whose key is not sortable in that collection, and a
non-string value before startup; typed configuration SHALL reject statically known
invalid system names and field keys whose type cannot be sorted. A `defaultSort` of
`-updatedAt` SHALL normalize to omission, so normalized metadata and hashes equal those
of omission. `defaultSort` alone SHALL be a valid nonempty `listOptions`. It SHALL be
part of the full model projection and of the shared metadata schemas, and, like the
rest of `listOptions`, SHALL be excluded from public projection identity.

When an admin entry-list request for the collection carries no sort, the list SHALL
use `defaultSort` with exactly the ordering, missing-value placement, ID tie-breaks,
cursor boundaries and validation of the same explicit sort. An explicit sort SHALL
always take precedence. The effective sort SHALL enter the continuation cursor
identity, so a continuation requested without sort SHALL fail at /after once
synchronization changed `defaultSort`. Node SQLite and local D1 SHALL produce
identical pages. Public delivery, the build export and the SDK SHALL keep their order.

Adding, changing or removing `defaultSort` SHALL be query-only synchronization as
defined by "Query metadata synchronization records a guarded public identity": no
model version bump, no snapshot rewrite and, with a trusted public baseline, no
published-state advance or build request.

#### Scenario: A portfolio opens by its order field
- **WHEN** a collection declares `sortableFields: ["order"]` and `defaultSort: "field:order"`, and entries have `order` 2, 10 and none
- **THEN** a list request without sort returns 2, 10 and then the entry without order, and the next page continues that order

#### Scenario: An invalid default fails configuration
- **WHEN** `defaultSort` is `field:summary` while `summary` is not in `sortableFields`, `-field:order` on a page, `author`, or a number
- **THEN** normalization fails before startup and type tests reject the statically known invalid declarations

#### Scenario: The old default normalizes away
- **WHEN** a collection declares `defaultSort: "-updatedAt"`
- **THEN** its normalized metadata, projection hash and public identity equal those of a collection without `defaultSort`

#### Scenario: A system default needs no sortable fields
- **WHEN** a collection declares only `listOptions: { defaultSort: "title" }`
- **THEN** configuration is valid, a list request without sort orders by system title ascending, and no field sort is enabled

#### Scenario: Changing the default does not rebuild
- **WHEN** synchronization adds `defaultSort` to a collection with a trusted public baseline
- **THEN** model metadata updates while snapshots, model version, published state and build work remain unchanged on Node and D1

## MODIFIED Requirements

### Requirement: Collection query capabilities are explicit configuration
A collection SHALL accept optional `listOptions` containing only `sortableFields`, `filterableFields`, `searchableFields` and `defaultSort`, the first three each an ordered array of at most 16 distinct declared top-level field keys. Sort/filter targets SHALL be text, textarea, number, boolean, select, date, datetime or url; search targets SHALL be text or textarea. Pages and globals SHALL reject this option. Normalization SHALL reject unknown options, missing fields, duplicates, unsupported types and nested paths before startup. Typed configuration SHALL restrict keys by operation-compatible field type. Empty arrays SHALL be omitted; an empty options object SHALL normalize to omission. The normalized detached metadata SHALL preserve configured order. `listFields` SHALL remain independent: visibility alone grants no operation and hidden fields can be queried through the configured controls. System title/slug search, status filtering and existing system sorts SHALL remain enabled. `defaultSort` SHALL follow "Collections declare a default admin sort". Omission SHALL enable no extra fields and preserve the existing default `-updatedAt`.

#### Scenario: A hidden description is searchable
- **WHEN** `description` is in `searchableFields` but not `listFields`
- **THEN** the main search includes its draft text and no description column is added

#### Scenario: Invalid operation targets fail configuration
- **WHEN** searchableFields names a number, any option names `group.child`, or a page declares listOptions
- **THEN** normalization fails before startup and type tests reject the corresponding statically known invalid declarations

#### Scenario: Existing configurations remain unchanged
- **WHEN** a collection omits listOptions or supplies only empty arrays
- **THEN** normalized metadata and hashes equal those of omission and no extra field controls appear
