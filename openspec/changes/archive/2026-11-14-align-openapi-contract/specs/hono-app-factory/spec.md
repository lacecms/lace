## ADDED Requirements

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
- Credential and authorization failures SHALL be documented with the status
  and envelope the classifier produces.

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
- **THEN** it documents `403` with the shared error envelope for a missing or
  insufficient credential, and documents no `401`

#### Scenario: Credentials are declared per operation

- **WHEN** a client reads the generated document
- **THEN** it finds security schemes for the session cookie, build token and
  import token. Public reads require none, the build export requires a build
  token, and allowlisted import routes accept a session or an import token

#### Scenario: Drift is caught

- **WHEN** a route is registered without a description, or an operation
  documents the default validation response
- **THEN** the OpenAPI contract test fails and names the method and path
