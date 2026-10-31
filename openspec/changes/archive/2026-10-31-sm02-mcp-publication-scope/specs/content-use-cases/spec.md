## MODIFIED Requirements

### Requirement: Delegated content authority is checked inside shared use cases
Every portable content operation SHALL evaluate its operation-level authority
and existing role permission policy before protected content reads or writes.
An authenticated actor with a delegated grant SHALL be limited to the explicit
operation and permission ceiling carried by that server-derived grant. The
ceiling SHALL only reduce the current role's authority and SHALL NOT supply a
new role. Missing operations in a delegated ceiling SHALL be denied by default.
Unrestricted browser actors SHALL retain the existing role policy and
published/unpublished deletion distinctions. Unpublication and deletion SHALL fail for every MCP grant even if invoked
directly through a portable use case rather than an advertised tool.
Publication SHALL succeed for a delegated actor only when its ceiling contains
both the `content:publish` permission and the `publish` operation and the
current role has `content:publish`; otherwise it SHALL fail the same way. Revocation of a
connection SHALL remain a separate credential operation. Callers SHALL NOT
strip delegated authority when composing another application operation.

#### Scenario: Direct delegated deletion of unpublished content
- **WHEN** an administrator actor with the MCP grant invokes deletion of an unpublished collection entry directly
- **THEN** the shared application boundary denies it before reading protected content or invoking a mutation port despite the role having `content:write`

#### Scenario: Direct delegated publication or unpublication
- **WHEN** an administrator actor with a read/write MCP grant invokes publication, or any MCP-granted actor invokes unpublication, without going through MCP tool discovery
- **THEN** authorization fails and no snapshot, route, public-state or outbox change occurs

#### Scenario: Publish-scoped delegated publication
- **WHEN** an administrator actor whose MCP grant includes publication invokes the publication operation
- **THEN** it runs with the existing validation, revision, idempotency and build rules, while unpublication and deletion by the same actor still fail

#### Scenario: New lifecycle operation is introduced
- **WHEN** a new content operation is added without inclusion in the delegated allowlist
- **THEN** it remains unavailable to delegated actors while its browser behavior follows the declared role policy

#### Scenario: Browser lifecycle remains usable
- **WHEN** a session-authenticated administrator publishes or deletes a permitted collection entry
- **THEN** the existing role, revision, link-impact and idempotency rules apply without the MCP restrictions
