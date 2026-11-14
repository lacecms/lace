## MODIFIED Requirements

### Requirement: Public and admin content routes honor shared contracts
The system SHALL provide the `/api/v1` public content endpoints for configured
pages, configured collection lists and items, lookup by public path, and build
export, plus the authenticated admin endpoints for content-model metadata,
model entry listing and creation, entry loading, complete-draft save,
publication, and deletion. Requests and responses SHALL validate against the
shared REST contracts before dispatch and serialization. Admin routes SHALL
resolve an actor before application work and preserve the shared authorization,
revision-precondition, and idempotency behavior. Public routes SHALL return
only immutable published content and SHALL not require an admin actor.

#### Scenario: An editor saves a complete draft through HTTP
- **WHEN** an authenticated editor sends a valid complete-draft request with a
  valid revision precondition to an entry they may write
- **THEN** the application receives the normalized actor and complete draft,
  and the response contains the updated entry DTO rather than persistence data

#### Scenario: An unauthenticated caller requests an admin entry
- **WHEN** a caller has no resolved actor and requests an admin content route
- **THEN** the request returns `401` `AUTHENTICATION_REQUIRED` before a
  content read or mutation capability runs

#### Scenario: A public collection page is requested
- **WHEN** a caller requests a configured collection with a valid opaque cursor
- **THEN** the response contains only that collection's published entries and
  a continuation cursor that can be supplied to the same collection route

### Requirement: Generated OpenAPI matches enforced HTTP behavior

The generated OpenAPI document SHALL describe, for every versioned product
operation the server registers, the status codes and bodies the server
actually returns:

- Every operation SHALL have a summary, a tag and its success status with
  the response schema the handler validates.
- An operation that validates path, query, header or body input SHALL
  document `422` with the shared error envelope. No operation SHALL document
  any other validation-error body or status.
- Query parameters that the handler reads SHALL appear as documented
  parameters with their bounds, even when the handler parses them itself.
- Every operation that requires a credential SHALL document `401` with the
  shared error envelope for a missing or unresolvable credential. An operation
  that can also refuse an authenticated actor SHALL document `403` with the
  shared envelope. Public operations SHALL document neither.

The document SHALL declare security schemes for the browser session cookie,
the build token and the import token. Each operation SHALL state which of
them it accepts:

- public routes: no credential;
- the build export: build token;
- admin and account routes: session;
- routes on the import allowlist: session or import token, except the route
  that describes the presented import token, which accepts only the import
  token.

Documenting these facts SHALL NOT change any route's runtime behavior. A test
SHALL fail when the generated document breaks any of these rules or omits a
registered product route.

#### Scenario: Validation failure is documented as the server returns it

- **WHEN** a client reads the generated document for an operation that
  validates a JSON body
- **THEN** the operation documents `422` with the shared error envelope, and
  no operation documents a `"Validation Error"` body or a `400` validation
  response

#### Scenario: Created token is documented with its status

- **WHEN** a client reads the operation that creates a build token
- **THEN** it documents `201` with the created-token schema, including the
  one-time token value

#### Scenario: Hand-parsed public query parameters are documented

- **WHEN** a client reads the public collection, record and by-path
  operations
- **THEN** `after` and `limit` (1 to the maximum page size) or the required
  `path` appear as query parameters

#### Scenario: Denial status matches the classifier

- **WHEN** a client reads an admin operation that requires a session
- **THEN** it documents `401` with the shared error envelope for a missing
  credential and `403` for an insufficient permission

#### Scenario: Credentials are declared per operation

- **WHEN** a client reads the generated document
- **THEN** it finds security schemes for the session cookie, build token and
  import token. Public reads require none, the build export requires a build
  token, and allowlisted import routes accept a session or an import token

#### Scenario: Drift is caught

- **WHEN** a route is registered without a description, or an operation
  documents the default validation response
- **THEN** the OpenAPI contract test fails and names the method and path
