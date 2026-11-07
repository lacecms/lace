## MODIFIED Requirements

### Requirement: One error model maps failures through one classification table
Every portable failure raised by content rules, configuration, domain rules,
application use cases, shared contracts, persistence adapters and runtime
adapters SHALL carry a stable machine-readable code through one shared error
base. This includes:

- stale configuration-synchronization plans (`CONFIGURATION_SYNC_STALE`);
- object-storage failures (`STORAGE_UNAVAILABLE`);
- runtime configuration failures (`RUNTIME_CONFIGURATION_INVALID`);
- invalid request precondition headers, which are contract validation
  failures.

**Classification.** One shared classifier SHALL own the mapping from failure
to transport envelope for every transport:

- validation failures carrying issues SHALL map to `422 VALIDATION_FAILED`
  with their issues;
- any other failure whose code is a documented transport code SHALL map to
  that code's single status and sanitized message;
- every other failure, including configuration, block-definition,
  block-migration, stale-synchronization, storage, runtime-configuration and
  internal-invariant failures and errors without a code, SHALL map to `500
  INTERNAL_ERROR` with the generic message.

The documented status and code pairs SHALL be exactly:

| Status | Codes |
|---|---|
| `422` | `VALIDATION_FAILED`, `CONTENT_INVALID_STATE` |
| `403` | `AUTHORIZATION_DENIED` |
| `400` | `INVALID_CREDENTIALS` |
| `404` | `NOT_FOUND` |
| `410` | `INVITATION_INVALID`, `RESET_INVALID` |
| `413` | `PAYLOAD_TOO_LARGE` |
| `429` | `RATE_LIMITED` |
| `409` | `BUILD_EXPORT_VERSION_CHANGED`, `CONFLICT`, `CONTENT_LINKS_IN_USE`, `CONTENT_LINK_IMPACT_CHANGED`, `CONTENT_MODEL_CARDINALITY_CONFLICT`, `CONTENT_NOT_PUBLISHED`, `CONTENT_PAGE_SINGLETON`, `CONTENT_PUBLISHED_IMMUTABLE`, `CONTENT_REVISION_CONFLICT`, `CONTENT_ROUTE_CONFLICT`, `LAST_ADMIN_PROTECTED`, `MEDIA_IN_USE`, `MEDIA_UPDATE_CONFLICT` |

**Preserved details and headers.**

- An exhausted account or request limit SHALL keep its `Retry-After` header of
  at least one whole second. The classifier SHALL be the only producer of the
  `429 RATE_LIMITED` envelope and its header for non-protocol paths, including
  the request rate-limit middleware.
- A stale build export SHALL keep its documented version details.
- A block order failure SHALL keep its bounded ordering message.
- No envelope SHALL expose the internal message of a failure the table does
  not mark safe.

**Code preservation.**

- A persistence or runtime layer that re-throws expected failures SHALL
  preserve every failure carrying the shared base, not only domain failures,
  so its code reaches the classifier unchanged.
- The server SHALL recognize an authorization failure by its code.
- The server SHALL only catch the contract validation failure of a header
  parser, and SHALL let any other failure reach the classifier.

**Pinned matrix.** The status, code, message, details and headers the REST API
returns for each failure SHALL equal those it returned before this
requirement, except that an unexpected failure while submitting browser setup
is reported as `500 INTERNAL_ERROR` instead of `404`. A repository test SHALL
pin that matrix for every portable error class the shared and runtime packages
export.

#### Scenario: An account failure is classified from its code
- **WHEN** an account operation fails because an invitation has expired
- **THEN** the API returns status `410` with code `INVITATION_INVALID` and the
  sanitized invitation message, exactly as before

#### Scenario: A rate-limited account operation keeps its retry hint
- **WHEN** a sensitive account operation is refused because its limit is
  exhausted with 1.2 seconds remaining
- **THEN** the API returns status `429` with code `RATE_LIMITED` and the header
  `Retry-After: 2`

#### Scenario: The request rate limiter uses the classifier
- **WHEN** the request rate-limit middleware refuses a non-protocol request
  with 30 seconds remaining
- **THEN** the API returns the classifier's `429 RATE_LIMITED` envelope with
  `Retry-After: 30`, identical to a use-case rate-limit failure

#### Scenario: A configuration failure is internal
- **WHEN** a request reaches a block definition or configuration failure
- **THEN** the API returns status `500` with code `INTERNAL_ERROR` and the
  generic message, without the definition detail

#### Scenario: An internal invariant failure is sanitized
- **WHEN** a media binary request finds that the stored object is unavailable
- **THEN** the API returns status `500` with code `INTERNAL_ERROR` and the
  generic message, without the storage key or internal message

#### Scenario: A lower-layer failure keeps its code
- **WHEN** a persistence write raises an internal invariant failure or an
  account failure inside a pass-through guard
- **THEN** the failure reaches the classifier with its own code instead of
  `CONTENT_INVALID_STATE`

#### Scenario: An invalid precondition header is a validation failure
- **WHEN** a client sends `If-Match: W/"3"` to a mutation that requires a
  strong revision
- **THEN** the API returns `422 VALIDATION_FAILED` with the existing message,
  and an unrelated failure inside the same handler is not converted to a
  validation failure

#### Scenario: The matrix covers every exported error class
- **WHEN** a shared or runtime package exports a new error class that the
  status matrix does not list
- **THEN** the repository test fails and names that class
