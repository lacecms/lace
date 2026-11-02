## ADDED Requirements

### Requirement: One error model maps failures through one classification table
Every portable failure raised by content rules, configuration, domain rules,
application use cases and shared contracts SHALL carry a stable
machine-readable code through one shared error base. One shared classifier
SHALL own the mapping from failure to transport envelope for every transport:
validation failures carrying issues SHALL map to `422 VALIDATION_FAILED` with
their issues; any other failure whose code is a documented transport code
SHALL map to that code's single status and sanitized message; every other
failure, including configuration, block-definition, block-migration and
internal-invariant failures and errors without a code, SHALL map to `500
INTERNAL_ERROR` with the generic message. The documented status and code pairs
SHALL be exactly: `VALIDATION_FAILED` `422`; `AUTHORIZATION_DENIED` `403`;
`CONTENT_INVALID_STATE` `422`; `INVALID_CREDENTIALS` `400`; `NOT_FOUND` `404`;
`INVITATION_INVALID` and `RESET_INVALID` `410`; `PAYLOAD_TOO_LARGE` `413`;
`RATE_LIMITED` `429`; and `409` for `BUILD_EXPORT_VERSION_CHANGED`,
`CONFLICT`, `CONTENT_LINKS_IN_USE`, `CONTENT_LINK_IMPACT_CHANGED`,
`CONTENT_MODEL_CARDINALITY_CONFLICT`, `CONTENT_NOT_PUBLISHED`,
`CONTENT_PAGE_SINGLETON`, `CONTENT_PUBLISHED_IMMUTABLE`,
`CONTENT_REVISION_CONFLICT`, `CONTENT_ROUTE_CONFLICT`, `LAST_ADMIN_PROTECTED`,
`MEDIA_IN_USE` and `MEDIA_UPDATE_CONFLICT`. An exhausted account or request
limit SHALL keep its `Retry-After` header of at least one whole second. A
stale build export SHALL keep its documented version details, and a block
order failure SHALL keep its bounded ordering message. No envelope SHALL
expose the internal message of a failure the table does not mark safe. The
status, code, message, details and headers the REST API returns for each
failure SHALL equal those it returned before this requirement, and a
repository test SHALL pin that matrix for every portable error class the
shared packages export.

#### Scenario: An account failure is classified from its code
- **WHEN** an account operation fails because an invitation has expired
- **THEN** the API returns status `410` with code `INVITATION_INVALID` and the
  sanitized invitation message, exactly as before

#### Scenario: A rate-limited account operation keeps its retry hint
- **WHEN** a sensitive account operation is refused because its limit is
  exhausted with 1.2 seconds remaining
- **THEN** the API returns status `429` with code `RATE_LIMITED` and the header
  `Retry-After: 2`

#### Scenario: A configuration failure is internal
- **WHEN** a request reaches a block definition or configuration failure
- **THEN** the API returns status `500` with code `INTERNAL_ERROR` and the
  generic message, without the definition detail

#### Scenario: An internal invariant failure is sanitized
- **WHEN** a media binary request finds that the stored object is unavailable
- **THEN** the API returns status `500` with code `INTERNAL_ERROR` and the
  generic message, without the storage key or internal message

#### Scenario: The matrix covers every exported error class
- **WHEN** a shared package exports a new error class that the status matrix
  does not list
- **THEN** the repository test fails and names that class
