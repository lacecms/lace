## MODIFIED Requirements

### Requirement: The first tool set is closed and draft-oriented
The MCP tool surface SHALL contain only `list_content_models`, `list_entries`,
`get_entry`, `create_entry`, `save_draft` and `publish_entry`. Read tools SHALL
require the effective `content:read` permission; create and save SHALL require
effective `content:write`; `publish_entry` SHALL require effective
`content:publish` together with the delegated `publish` operation. Tool discovery SHALL expose only permitted tools, and every
call SHALL independently authorize its operation. The server SHALL NOT provide
an arbitrary HTTP, SQL, code-execution or operation-name proxy. Unpublication, deletion, revert, duplication, media operations, build requests,
user/settings management and configuration/source editing SHALL be unavailable
regardless of granted scopes or role.
Unknown or forbidden tool names SHALL fail without invoking a content command.

#### Scenario: Viewer discovers tools
- **WHEN** a connected viewer lists tools with read consent
- **THEN** only the three read tools are listed and a direct `save_draft` call is refused without mutation

#### Scenario: Administrator uses MCP
- **WHEN** an administrator grants read/write access without the publish scope and lists tools
- **THEN** exactly the five read and draft tools are listed, and requests for publish, unpublish or delete cannot execute

#### Scenario: Administrator grants publication
- **WHEN** an administrator grants read, write and publish access and lists tools
- **THEN** exactly six tools are listed including `publish_entry`, and no unpublish, delete, revert, duplicate or media tool exists

## ADDED Requirements

### Requirement: Publication through MCP reuses the shared publication operation
`publish_entry` SHALL accept an entry ID, an explicit expected draft revision
and an optional idempotency key with the same syntax as the REST
`Idempotency-Key` header, and SHALL invoke the same portable publication
operation as REST with the delegated actor. Strict validation, route and
singleton checks, internal-link publication guards, stale-revision conflicts,
idempotent replay scoped to entry and actor, atomic snapshot replacement and
build queueing or coalescing SHALL behave exactly as for REST on Node and
Cloudflare. A successful call SHALL return the shared publication result
representation, including the queued or replayed build outcome. Failures SHALL
return the shared stable error code and issue paths inside an MCP tool error
and SHALL leave content, routes, public-state version and the build outbox
unchanged. The tool SHALL publish the stored draft only; it SHALL NOT accept
draft content, a publication time or an actor.

#### Scenario: Agent publishes a saved draft
- **WHEN** a client with publish authority saves a draft and calls `publish_entry` with the returned revision
- **THEN** the entry is published with the same result shape as REST, public reads return the new snapshot, and one build is queued or coalesced

#### Scenario: Stale revision
- **WHEN** a browser saves the entry after the client read it and the client publishes with the older revision
- **THEN** the call returns the shared revision-conflict error and nothing is published

#### Scenario: Invalid or unroutable draft
- **WHEN** the draft fails strict validation, its route conflicts with another entry, or it links to an unavailable destination
- **THEN** the call returns the same stable error as REST and the previous published snapshot remains current

#### Scenario: Retry after a lost response
- **WHEN** the client repeats a successful call with the same entry, revision and idempotency key
- **THEN** it receives the original publication result marked as replayed, with no new snapshot, version increment or build event

#### Scenario: Publication without authority
- **WHEN** a token without `content:publish`, or a token whose user is no longer an administrator, calls `publish_entry`
- **THEN** the call is refused before content reads, with the OAuth insufficient-scope challenge for a missing scope or an authorization failure for a missing role permission
