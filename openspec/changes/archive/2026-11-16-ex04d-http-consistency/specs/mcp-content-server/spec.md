## ADDED Requirements

### Requirement: Entry tool paging uses the shared REST limit
The `list_entries` tool SHALL use the same normalized limit rule as the
admin entry-list REST contract. It SHALL advertise and accept a JSON integer
from 1 through 100, with default 50, and pass the normalized integer to the
same content operation. An explicitly invalid value SHALL cause the shared
validation tool error with a value-free issue at `/limit` before any list
read. The entry DTO, cursor, filters and authority are defined by the
existing content tool contract.

#### Scenario: Equivalent entry list requests select the same page
- **WHEN** an authorized REST session and an authorized MCP client request
  the same model, query and continuation with REST `limit=2` and MCP
  `limit: 2`
- **THEN** the calls select the same rows and continuation

#### Scenario: A text limit is supplied to the tool
- **WHEN** an authorized MCP client supplies `limit: "2"`
- **THEN** the tool returns its structured `VALIDATION_FAILED` error with
  pointer `/limit` before reading entries
