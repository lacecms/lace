## Why

[EX4D — HTTP consistency](../../../../docs/extensibility-roadmap.md#session-ex4d--http-consistency)
follows the archived [EX4C typed handlers](../2026-11-16-ex04c-typed-handlers/)
and [EX2D test store](../2026-11-16-ex02d-one-test-store/). Entry reads
leave clients to construct their own revision tag, and four protected lists
have different continuation behavior or stop before all records are reachable.

## What Changes

- Emit the draft revision as an `ETag` on the admin entry detail response so an
  HTTP client can pass it directly in `If-Match`. Keep `expectedRevision` as
  the canonical JSON input. Use the media metadata version for media edits and
  the expected published snapshot ID for unpublish, following their respective
  concurrency guarantees.
- Page OAuth connections, users, invitations and builds through `after` and
  a shared `{ items, nextCursor? }` envelope. Users also receive account
  totals for the existing Admin summary. Add continuation controls to Users,
  Pending invitations and Builds, and reuse the Account screen's control.
- Use one page-limit contract for these lists, the existing admin entry and
  media lists, and MCP `list_entries`. The default is 50, the range is
  1–100, REST sends decimal query text and MCP sends a JSON number.
- **BREAKING** for list clients that assumed one response contained all users
  or invitations, validated their former exact response shapes, or used the
  previous OAuth connection cursor. OAuth `nextCursor` is omitted on the last
  page in place of `null`. Restart former OAuth traversals without `after`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [rest-contracts](../../../specs/rest-contracts/spec.md) defines the entry tag,
  page contracts, validation and OpenAPI parameters.
- [hono-app-factory](../../../specs/hono-app-factory/spec.md) defines HTTP
  round-tripping and access to paged build history.
- [application-ports-and-commands](../../../specs/application-ports-and-commands/spec.md)
  defines bounded list reads behind the existing application authorization.
- [mcp-content-server](../../../specs/mcp-content-server/spec.md) aligns the
  advertised and enforced `list_entries` limit with REST.
- [mcp-oauth-delegation](../../../specs/mcp-oauth-delegation/spec.md) covers owned
  connection continuations and Account paging.
- [admin-users-and-settings](../../../specs/admin-users-and-settings/spec.md)
  covers paging and counts on Users.
- [admin-remote-state-and-lists](../../../specs/admin-remote-state-and-lists/spec.md)
  covers paged builds and recovery from rejected continuations.

## Impact

The change is limited to EX4D. It updates shared contracts, the protected v1
routes and their OpenAPI, application read ports, Node/SQLite and Worker/D1
read adapters, and the corresponding Admin screens. It follows
[architecture §6](../../../../docs/architecture/workspace.md#6-repository-structure),
[§12](../../../../docs/architecture/api.md#12-rest-api),
[§14](../../../../docs/architecture/security.md#14-authentication-and-authorization),
[§15–16](../../../../docs/architecture/runtimes.md#15-infrastructure-ports)
and [§17](../../../../docs/architecture/admin.md#17-admin-application).
Persistence work consists of bounded reads and an index for invitation paging.
The [public delivery compatibility policy](../../../../docs/compatibility.md#public-contract-evolution)
continues to govern the public routes and build export. List response changes
are confined to session-only account and administration endpoints.
