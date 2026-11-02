## ADDED Requirements

### Requirement: MCP tool errors use the shared REST classification
Every failure inside an MCP tool call, including tool-argument validation,
unknown entries, content, account and rate-limit failures, SHALL be reported
as an MCP tool error whose structured content is the error envelope body that
the shared REST classifier produces for the same failure: the same code,
sanitized message, details and validation issue paths. MCP SHALL NOT map a
failure that has a documented transport code to `INTERNAL_ERROR`. Transport
headers such as `Retry-After` SHALL not appear in the tool result. Unexpected
failures SHALL keep the generic `INTERNAL_ERROR` body without internal detail.

#### Scenario: An account failure keeps its code through MCP
- **WHEN** a tool's application operation fails with an account failure whose
  code is `NOT_FOUND`
- **THEN** the tool result is an error whose structured content has code
  `NOT_FOUND` and the same message REST returns, not `INTERNAL_ERROR`

#### Scenario: A rate-limit failure keeps its code through MCP
- **WHEN** a tool's application operation is refused because a limit is
  exhausted
- **THEN** the tool result is an error with code `RATE_LIMITED` and the REST
  message, and no retry header value appears in the result

#### Scenario: Argument validation and missing entries are unchanged
- **WHEN** a client calls `save_draft` without `expectedRevision`, or
  `get_entry` with an unknown entry ID
- **THEN** the results are a `VALIDATION_FAILED` error with path
  `/expectedRevision` and a `NOT_FOUND` error, exactly as before

#### Scenario: Unexpected failures stay sanitized
- **WHEN** a tool's operation throws an error without a code whose message
  contains SQL text
- **THEN** the tool result has code `INTERNAL_ERROR` and the generic message,
  and contains no SQL text
