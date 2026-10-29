## ADDED Requirements

### Requirement: Content contracts and projections are shared across transports
The existing content-model, entry-list, admin-entry, create-entry and
complete-draft representations SHALL have one runtime validation and JSON
projection definition consumed by REST and MCP. Protocol-specific wrappers
SHALL NOT redefine field/block descriptors, content aggregate constraints,
editor attribution, derived state, identifiers, revisions or stable error
classifications. An MCP schema representation SHALL be derived from the shared
runtime contracts and SHALL still use those contracts for actual validation;
protocol-library structural schema requirements SHALL NOT become a second
business schema. MCP arguments SHALL use typed JSON filters and explicit
revision values, while HTTP query/header parsing remains REST-specific. Both
SHALL normalize to the same application input. Existing REST paths, status
codes, response shapes, ETags, pagination/cursor semantics and OpenAPI SHALL
remain compatible.

#### Scenario: Additional supported descriptor metadata
- **WHEN** the shared model contract gains a supported descriptor option
- **THEN** REST and MCP expose and validate that option through the same definition

#### Scenario: Equivalent normalized draft input
- **WHEN** REST supplies a draft with a matching `If-Match` header and MCP supplies the same draft with explicit `expectedRevision`
- **THEN** both invoke the same application operation with the same normalized draft and revision

#### Scenario: Transport-only query syntax
- **WHEN** REST supplies its JSON-encoded filters query and MCP supplies the corresponding typed JSON object
- **THEN** both reach the same filter validation and bounded collection query without a separate MCP filter policy
