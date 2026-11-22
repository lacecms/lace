## MODIFIED Requirements

### Requirement: Delete and unpublish accept an explicit link impact acknowledgment
Existing delete and unpublish requests SHALL accept optional
`linkImpact: {receipt, acknowledgePublishedLinks: true}` in their strict command
body. Delete alone SHALL also accept optional
`referenceImpact: {receipt, acknowledgeDraftReferences: true}` to acknowledge
external draft typed selections. Unpublish SHALL reject this delete-only
option. Each receipt SHALL identify its distinct purpose, and both options
SHALL be accepted together when both reviews are required. Delete SHALL retain its existing precondition transport, accepting an
optional strict JSON body without requiring one for unreferenced entries.
Unpublish SHALL retain its expected published snapshot and idempotency rules.
The receipt SHALL bind action, target, actor, existing target guards and incoming
dependency revision; it SHALL grant no authorization. Missing URL acknowledgment
when required for URL usages SHALL return 409 `CONTENT_LINKS_IN_USE`; a stale/cross-target/
cross-action receipt SHALL return 409 `CONTENT_LINK_IMPACT_CHANGED`. Validation
and authorization errors SHALL remain sanitized. A delivered published typed
usage SHALL take precedence over either acknowledgment and yield 409
`CONTENT_REFERENCES_IN_USE`. For deletion with draft typed usages a missing
acknowledgment SHALL return 409 `CONTENT_REFERENCE_REVIEW_REQUIRED`; a
stale or foreign reference acknowledgment SHALL return 409
`CONTENT_REFERENCE_IMPACT_CHANGED`. All failures SHALL leave storage unchanged. OpenAPI SHALL describe the
queries, DTOs, new issue/error codes and recovery.

#### Scenario: Legacy unreferenced request
- **WHEN** a valid existing client deletes or unpublishes an entry without a URL acknowledgment requirement, typed blocker or draft reference acknowledgment requirement and sends no new option
- **THEN** the command retains its existing response and precondition behavior

#### Scenario: A receipt cannot authorize another command
- **WHEN** a receipt for target A/unpublish is submitted for target B/delete
- **THEN** the request fails without any mutation

#### Scenario: Independent acknowledgments
- **WHEN** a target has incoming delivered URL links and draft typed usages, with no delivered published typed use
- **THEN** deletion requires both current reviews; supplying only the URL receipt fails to acknowledge the draft usages and supplying only the draft receipt fails to acknowledge the URLs

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
| `401` | `AUTHENTICATION_REQUIRED` |
| `403` | `AUTHORIZATION_DENIED` |
| `400` | `INVALID_CREDENTIALS` |
| `404` | `NOT_FOUND` |
| `410` | `INVITATION_INVALID`, `RESET_INVALID` |
| `413` | `PAYLOAD_TOO_LARGE` |
| `429` | `RATE_LIMITED` |
| `409` | `BUILD_EXPORT_VERSION_CHANGED`, `CONFLICT`, `CONTENT_LINKS_IN_USE`, `CONTENT_LINK_IMPACT_CHANGED`, `CONTENT_MODEL_CARDINALITY_CONFLICT`, `CONTENT_NOT_PUBLISHED`, `CONTENT_PAGE_SINGLETON`, `CONTENT_PUBLISHED_IMMUTABLE`, `CONTENT_REFERENCES_IN_USE`, `CONTENT_REFERENCE_REVIEW_REQUIRED`, `CONTENT_REFERENCE_IMPACT_CHANGED`, `CONTENT_REVISION_CONFLICT`, `CONTENT_ROUTE_CONFLICT`, `LAST_ADMIN_PROTECTED`, `MEDIA_IN_USE`, `MEDIA_UPDATE_CONFLICT` |

**Preserved details and headers.**

- An exhausted account or request limit SHALL keep its `Retry-After` header of
  at least one whole second. The classifier SHALL be the only producer of the
  `429 RATE_LIMITED` envelope and its header for non-protocol paths, including
  the request rate-limit middleware.
- A stale build export SHALL keep its documented version details.
- In authenticated reference validation responses, bounded actionable graph
  evidence SHALL follow the entry-reference-fields contract; other issue and
  public-error response shapes SHALL retain their current behavior.
- A block order failure SHALL keep its bounded ordering message.
- An authentication failure SHALL keep its `WWW-Authenticate` challenge
  header.
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
returns for each previously supported failure SHALL equal those it returned before this
requirement, except that an unexpected failure while submitting browser setup
is reported as `500 INTERNAL_ERROR` instead of `404`, and a request without
a credential that resolves to an actor is reported as `401
AUTHENTICATION_REQUIRED` instead of `403 AUTHORIZATION_DENIED`. A repository test SHALL
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

#### Scenario: A missing credential is classified as authentication
- **WHEN** an admin route is requested without a session
- **THEN** the API returns status `401` with code `AUTHENTICATION_REQUIRED`,
  the sanitized authentication message and a `WWW-Authenticate` header

#### Scenario: A missing permission stays an authorization denial
- **WHEN** a viewer requests an operation that needs `content:publish`
- **THEN** the API returns status `403` with code `AUTHORIZATION_DENIED`

## ADDED Requirements

### Requirement: Reference target discovery and resolution are route-independent

`GET /api/v1/admin/reference-targets` SHALL require one `modelKey` per
lookup, accept optional literal title-prefix `search` (up to 100 characters),
`after` and `limit` (1–50, default 20), and return draft-only and published
entries of that page or collection model. Search SHALL use the URL picker's
trimmed, ASCII-case-insensitive prefix semantics and indexed stable
continuation. A cursor SHALL be bound to its model and search. The picker
can switch among the field's configured models. Returned items SHALL carry
entry ID, model key and kind, authorized display title and publication state,
with an optional published path. Publication state SHALL follow the current
published snapshot independently of routing. Write admission SHALL always
check the declaring field's own model constraint.

`POST /api/v1/admin/reference-targets/resolve` SHALL accept a strict
`{ids}` body with at most 200 distinct valid IDs and return keyed
`published`, `unpublished`, `missing` or `ineligible` results in a bounded
batch. Missing items SHALL have no synthetic title. Global entries SHALL be
ineligible. Both operations SHALL require a browser session, `content:read` and validated
inputs before catalog reads. Invalid shapes, unsupported filters and
foreign search cursors SHALL be rejected. Existing URL target endpoints
SHALL retain their separate semantics.

#### Scenario: A published review has no public path
- **WHEN** a viewer searches the route-less reviews model and resolves a batch of previously selected IDs
- **THEN** published reviews are returned as published without paths, unpublished reviews as unpublished and absent IDs as missing; the legacy URL catalog still excludes reviews

#### Scenario: Catalog selection does not authorize a write
- **WHEN** a writer submits an existing post ID to a reviews-only field after discovering the post in another model
- **THEN** the write fails at the submitted location and no snapshot changes

### Requirement: Reference impact exposes bounded direct sources and locations

`GET /api/v1/admin/entries/:entryId/reference-impact` SHALL require
a browser session with `content:read` and an `action` of `delete` or `unpublish`. It SHALL page
direct source groups using optional `after` and `limit` (1–50, default 20).
Each group SHALL distinguish the source entry, title, model, phase/snapshot
and at most ten initial locations. Locations SHALL distinguish `sourceKey`,
`area`, relative RFC 6901 pointer and delivery status. To continue one
group, location-page mode SHALL instead accept `sourceEntryId`, `snapshotId`
and `locationsAfter` with the same `action` and `limit`. Modes SHALL be
exclusive. Results SHALL distinguish any delivered published blocker and any
draft use across the whole result even if it is outside the current page.
A deletion warning receipt SHALL bind the reference-review purpose, target,
action, actor, guarded target revision/publication and reviewed graph state.
Cursors SHALL be bound to their modes, target, action, snapshot scope where
applicable and dependency revision. Cursors and receipts SHALL be bounded to
4096 characters. Changed impact during paging SHALL return 409
`CONTENT_REFERENCE_IMPACT_CHANGED` and require a fresh view. Responses
SHALL NOT traverse upstream sources or include unrelated source data.

#### Scenario: Many incoming references span both levels of pagination
- **WHEN** a target has more than fifty current source groups and one contains more than ten locations
- **THEN** an authorized reader can visit every direct group and location in bounded pages, and the current-page summary cannot hide a blocker on a later page

#### Scenario: Automation credentials do not open browser management reads
- **WHEN** a client presents only a build, import or delegated MCP credential to a reference picker, batch resolve or impact route
- **THEN** the configured authentication policy denies the request before returning any titles, locations or receipts

#### Scenario: A location changes between pages
- **WHEN** a cursor for the review's second location page is replayed after its source is edited and the reviewed dependency graph changes
- **THEN** the server returns a conflict instead of mixing locations from different graph revisions

### Requirement: Reference admission reports stable actionable failures

A proven cycle SHALL yield HTTP 422 `VALIDATION_FAILED` with issue code
`reference_cycle` and the candidate field/block location. When bounded proof
cannot be completed the issue SHALL instead be `reference_graph_limit`.
Absent, disallowed-model and unpublished required targets SHALL yield
location-addressed issues `reference_target_missing`, `reference_target_model`
and `reference_target_unpublished`, respectively. “Required” here means the
selected occurrence must be available for the requested operation, regardless
of whether the descriptor itself is optional. Cycle details SHALL identify a
bounded witness and, when verified, the prerequisite entry to publish, using
authorized entry IDs suitable for ordinary editor links. Details SHALL
exclude raw values, unrelated content, SQL and internal exception strings.
Existing source-revision conflicts SHALL keep their code. If graph evidence
changes before commit and fresh proof is unavailable, the command SHALL return
409 `CONFLICT` with retry guidance and commit no mutation. The generated
OpenAPI contract SHALL document the request, response, authorization, closed
issue details, stated bounds and recovery semantics.

#### Scenario: An authorized publisher attempts a staged reversal out of order
- **WHEN** saving B → A succeeds but publishing it would close the old published edge A → B, which A's saved draft has removed
- **THEN** the failure identifies the initiating field, the cycle and A as the entry to publish first; it returns no source JSON dump and retains both drafts

#### Scenario: Authorization precedes graph details
- **WHEN** a viewer attempts a publication that would expose a cycle
- **THEN** the endpoint returns its ordinary authorization failure without entry IDs, cycle witnesses or graph details
