# ADR 0019: One portable error model and classifier

- Status: Accepted
- Date: 2026-11-03
- Governing architecture: [section 12](../architecture/api.md#contract-rules)

## Context

Content, configuration, domain and application errors had separate conventions.
Contracts could not import application errors, so REST mapped account and
rate-limit failures inline and MCP reported them as internal errors.

## Decision

Content owns `LaceError<Code>` and `InvariantError`: it is the lowest shared
package permitted by [ADR 0001](0001-package-dependency-boundaries.md).
Domain and contracts re-export the same base. Each portable failure carries
its existing stable code or an explicit internal code. Account and rate-limit
errors live in domain; application preserves their public names by re-export.

Contracts owns one total status/message table and `classifyError`. Validation
errors carrying issues are recognized first. Three explicit hooks expose only
build-export version details, bounded block-order diagnostics and the
rate-limit retry header. Unknown errors and internal codes produce sanitized
`500 INTERNAL_ERROR`; foreign objects with a `code` property are not trusted.
REST and MCP delegate to this classifier, with MCP using only its envelope body.

Argument guards use `TypeError` or `RangeError`. Failed product guarantees and
runtime capabilities use `InvariantError`. Package-local `fail` helpers stay
local because their constructors and message prefixes differ.

## Consequences

The REST matrix retains its statuses, codes, messages, details and headers.
MCP preserves account and rate-limit codes. A shared matrix covers every
exported error class, and a vocabulary guard prevents duplicate owners and
raw error construction in content and application. Constructor signatures,
names, messages and public application exports remain compatible.

## Alternatives considered

Putting the base in domain would violate the content/config dependency direction.
Keeping account errors in application would require unchecked property reads
in contracts. A shared failure factory adds no value to package-specific
constructors.
