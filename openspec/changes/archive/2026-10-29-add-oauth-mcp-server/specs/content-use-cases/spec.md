## ADDED Requirements

### Requirement: Delegated content authority is checked inside shared use cases
Every portable content operation SHALL evaluate its operation-level authority
and existing role permission policy before protected content reads or writes.
An authenticated actor with a delegated grant SHALL be limited to the explicit
operation and permission ceiling carried by that server-derived grant. The
ceiling SHALL only reduce the current role's authority and SHALL NOT supply a
new role. Missing operations in a delegated ceiling SHALL be denied by default.
Unrestricted browser actors SHALL retain the existing role policy and
published/unpublished deletion distinctions. Publication, unpublication and
deletion SHALL fail for the first-phase MCP grant even if invoked directly
through a portable use case rather than an advertised tool. Revocation of a
connection SHALL remain a separate credential operation. Callers SHALL NOT
strip delegated authority when composing another application operation.

#### Scenario: Direct delegated deletion of unpublished content
- **WHEN** an administrator actor with the MCP grant invokes deletion of an unpublished collection entry directly
- **THEN** the shared application boundary denies it before reading protected content or invoking a mutation port despite the role having `content:write`

#### Scenario: Direct delegated publication or unpublication
- **WHEN** the same actor invokes publication or unpublication without going through MCP tool discovery
- **THEN** authorization fails and no snapshot, route, public-state or outbox change occurs

#### Scenario: New lifecycle operation is introduced
- **WHEN** a new content operation is added without inclusion in the delegated allowlist
- **THEN** it remains unavailable to delegated actors while its browser behavior follows the declared role policy

#### Scenario: Browser lifecycle remains usable
- **WHEN** a session-authenticated administrator publishes or deletes a permitted collection entry
- **THEN** the existing role, revision, link-impact and idempotency rules apply without the MCP restrictions

### Requirement: Admin and MCP share content discovery and read orchestration
Portable application behavior SHALL provide authorized model discovery and
the complete admin content read/write results needed by REST and MCP. It SHALL
derive model capabilities from the normalized configuration, use the same
content listing/loading and create/save operations, preserve runtime query
budgets, and resolve safe editor attribution through the existing bounded
identity lookup. Transport adapters SHALL NOT independently implement model
selection, content normalization, derived state, metadata selection or
editor-name orchestration. Serialization SHALL use the shared contract
projections without persistence/provider objects or executable configuration.
Existing lifecycle validation and atomicity SHALL remain the single source of
truth for both adapters.

#### Scenario: A content rule evolves
- **WHEN** a shared validator, configured field default or draft-state rule changes
- **THEN** equivalent REST and MCP operations observe the same result without a second implementation of that rule

#### Scenario: Safe editor attribution is returned
- **WHEN** either adapter loads an entry last edited by a persisted user
- **THEN** both return the same safe attribution and neither adapter performs its own provider-user lookup

#### Scenario: Model discovery is unauthorized
- **WHEN** an actor lacks effective read authority and requests model metadata through the portable operation
- **THEN** it is denied before protected metadata is returned
