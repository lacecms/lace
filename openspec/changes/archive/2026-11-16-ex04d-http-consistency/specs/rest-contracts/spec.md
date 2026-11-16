## ADDED Requirements

### Requirement: Admin entry reads supply the draft precondition
An authorized successful `GET /api/v1/admin/entries/{entryId}` SHALL return
`ETag` as the draft revision in quoted decimal form, for example `"7"` for
revision 7. The header and the DTO's `draft.revision` SHALL come from the
same read. This response SHALL use `Cache-Control: no-store`; entry detail
requests with `If-None-Match` SHALL still return the current authorized
entry as `200`. The entry tag SHALL be accepted verbatim by every operation
that accepts a draft revision through `If-Match`. The JSON preconditions,
media metadata tags, publication snapshot guard for unpublish and public
conditional-read contracts SHALL keep their existing meanings.

#### Scenario: Read and save with the returned tag
- **WHEN** an authorized writer loads an entry at revision 7, then sends a
  valid complete-draft save with the returned `ETag` as its only revision
  precondition
- **THEN** the read carries `ETag: "7"`, the save advances the draft to
  revision 8, and the next detail read returns `ETag: "8"` and revision 8

#### Scenario: Another writer has saved
- **WHEN** a permitted mutation attempts to update the entry with a tag
  obtained before another writer advanced its draft revision
- **THEN** it receives `409 CONTENT_REVISION_CONFLICT` and the competing
  mutation changes no draft, publication or build state

#### Scenario: The publication changes without a draft edit
- **WHEN** an authorized caller rereads an entry with `If-None-Match`
  after it is published at the same draft revision
- **THEN** the response is `200` with the current publication in the DTO,
  the same draft tag, and `Cache-Control: no-store`

### Requirement: Protected operational lists use opaque cursor pages
`GET /api/v1/account/mcp-connections`, `GET /api/v1/admin/users`,
`GET /api/v1/admin/invitations` and `GET /api/v1/admin/site-builds` SHALL
accept optional `after` and `limit` query parameters. Omitting `after`
starts a traversal. Each response SHALL contain `items` and SHALL include
`nextCursor` exactly when at least one further row exists at the time of
the read. The client SHALL be able to pass that string verbatim as `after`
on the same list, with any supported page size. The last page, including
an empty page, SHALL omit `nextCursor`. User pages SHALL also contain
`total` (all accounts) and `disabledCount` (all disabled accounts)
measured in the same read as the page and independently of its cursor.

Every continuation SHALL be bounded to at most 4,096 characters and
scoped to its list. An OAuth connection continuation SHALL also be scoped
to the authenticated owner. Malformed, unsupported and out-of-scope
continuations, including prior raw OAuth grant IDs, SHALL return the same
value-free `422 VALIDATION_FAILED` issue at `/after` to an authorized
caller. A user cursor whose boundary account is gone SHALL return that
same issue. Permissions SHALL be checked for each request and a cursor SHALL
confer no authority. Each endpoint SHALL preserve the items' existing
safe DTOs and eligibility rules.

#### Scenario: A full page is also the last page
- **WHEN** exactly two invitations qualify and a permitted caller requests
  `limit=2`
- **THEN** both invitations are returned, with the continuation omitted

#### Scenario: A viewer traverses more than 100 builds
- **WHEN** a signed-in viewer follows the build continuations through
  a static history of 105 builds
- **THEN** all 105 records are reachable exactly once in newest-first
  order under the existing session read permission

#### Scenario: Counts cover all users
- **WHEN** a page returns one enabled user and a disabled user falls on a
  different page
- **THEN** `total` includes both users and `disabledCount` includes the
  disabled user independently of the returned items

#### Scenario: A foreign continuation is rejected
- **WHEN** a permitted caller submits a build cursor to the invitation
  list, or submits another user's connection cursor to the connection list
- **THEN** the operation returns `422 VALIDATION_FAILED` at `/after`
  without echoing the cursor or disclosing any protected rows

#### Scenario: A reader lacks the required authority
- **WHEN** a caller without a session or without the required permission
  requests a continuation page
- **THEN** the request receives the existing sanitized authentication or
  authorization failure and performs no protected list read

#### Scenario: The boundary user has been removed
- **WHEN** a user page's boundary account is removed before the next
  request
- **THEN** the continuation returns the same invalid-cursor response and
  the list remains available from the first page

## MODIFIED Requirements

### Requirement: Admin list page limits have one bound
Admin entry, media, user, invitation, site-build and OAuth connection lists,
and MCP `list_entries`, SHALL use one shared integer limit contract across
request validation, dispatch and published schemas. The supported range
SHALL be 1 to 100, with a default of 50 when omitted. REST SHALL accept
canonical positive decimal query text and MCP SHALL accept a JSON number.
Out-of-range or invalid values SHALL produce a value-free
`VALIDATION_FAILED` issue at `/limit` before a list read. REST SHALL return
`422` and MCP SHALL use its existing tool failure envelope. The OpenAPI
document SHALL describe the REST input and the MCP tool schema SHALL
describe the numeric input with the same bounds and default.

Bounded reads with their own declared limits SHALL retain their contracts,
including the build export (1–100, default 100), internal-link pages
(1–50, default 20) and the media tag catalog (1–100, default 50).

#### Scenario: OpenAPI and the server agree
- **WHEN** a client inspects any of the listed REST operations and the
  MCP `list_entries` tool declaration
- **THEN** the descriptions advertise 1–100 and default 50, with decimal
  text in the REST query and an integer in the tool arguments

#### Scenario: An over-large page is refused
- **WHEN** an authorized caller requests an admin entry or media list with
  `limit=101` or `limit=500`
- **THEN** the API returns `422 VALIDATION_FAILED` at `/limit` without
  running a list query or echoing the submitted value

#### Scenario: Invalid transport values are refused
- **WHEN** an authorized caller submits REST `limit=01` or `limit=1e1`,
  or MCP limit `101`, `1.5` or `"10"`
- **THEN** the corresponding transport reports a validation issue at
  `/limit` before the read and the error omits the submitted value

#### Scenario: The default page size applies
- **WHEN** a caller omits `limit` and more than 50 eligible items exist
- **THEN** the first page contains 50 items and provides a continuation

### Requirement: OpenAPI describes account and administration reads
The generated versioned OpenAPI document SHALL describe the user list,
invitation list, site-build history, account capabilities, settings status,
build-token list and build-token revocation operations, including their path
and query parameters, success schemas and applicable sanitized failures.
It SHALL describe the paged success contracts and `422` outcomes for the
three lists and the `ETag` response header for successful admin entry
detail reads. It SHALL describe `If-Match` on the existing draft revision
operations, including the agreement rule when a body revision is supplied.
Node and Cloudflare SHALL enforce the same described behavior and retain
the existing session or import credential policy on each route.

#### Scenario: Account and administration operations are discoverable
- **WHEN** a consumer inspects the generated versioned OpenAPI document
- **THEN** it describes `GET /api/v1/admin/users`, `GET /api/v1/admin/invitations`,
  `GET /api/v1/admin/site-builds`, `GET /api/v1/account/capabilities`,
  `GET /api/v1/admin/settings/status`, `GET /api/v1/admin/api-tokens`, and
  `DELETE /api/v1/admin/api-tokens/{tokenId}` with their response contracts

#### Scenario: Entry request headers round-trip through the documented contract
- **WHEN** a client inspects the entry detail read and the five draft
  revision operations
- **THEN** OpenAPI describes the returned tag, the optional `If-Match`
  parameter on each operation, and how it corresponds to the body revision

#### Scenario: Existing authorization is preserved
- **WHEN** an anonymous or insufficiently authorized caller invokes an
  operation documented by this requirement
- **THEN** the existing credentials and permission checks continue to deny
  the request with the existing sanitized failure response
