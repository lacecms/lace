## ADDED Requirements

### Requirement: Build thumbnails have an authenticated published-media route
On Node and Cloudflare, the HTTP application SHALL register `GET /api/v1/public/build-media/:mediaId/thumbnail` when the published-media capability and build-token verifier are configured. It SHALL require the same verified Bearer credential and 401 challenge as build export, before any eligibility lookup or storage read. For eligible media, it SHALL return the same validated static `image/webp` bytes and strong derivative ETag as the admin route, with `Cache-Control: private, no-cache`. A matching strong, weak or wildcard `If-None-Match` SHALL return a bodyless 304 with the same cache headers only after verifying the token, current published eligibility and derivative availability. Malformed validators SHALL be ignored.

An eligible item with an unavailable derivative SHALL receive the sanitized `503 MEDIA_THUMBNAIL_UNAVAILABLE` response with `Cache-Control: no-store`. Unknown and ineligible items SHALL receive the same 404 as the public original route. Responses SHALL expose no storage location or credential and SHALL never redirect. The route SHALL follow the existing build-route policy and SHALL NOT grant new access to the session-only admin route.

#### Scenario: A valid build token fetches or revalidates a thumbnail
- **WHEN** a valid build token requests an eligible thumbnail and then requests it with its ETag
- **THEN** the first response is a bounded WebP and the second is a private bodyless 304

#### Scenario: A shared or unsigned client cannot probe the derivative
- **WHEN** an anonymous caller, session-only caller, import token, or revoked build token requests the route, even with a matching or wildcard validator
- **THEN** the server returns the build-token authentication response without checking media or contacting storage

#### Scenario: An unpublish invalidates eligibility
- **WHEN** an authorized caller uses a previously valid thumbnail ETag after the media loses its last published reference
- **THEN** the response is 404 and the server does not check derivative storage

#### Scenario: An eligible thumbnail cannot be generated
- **WHEN** a valid build caller requests eligible media and the derivative is unavailable, even with `If-None-Match: *`
- **THEN** the route responds with a sanitized and non-cacheable 503

#### Scenario: Build authentication is unavailable
- **WHEN** the server is composed without a build-token verifier
- **THEN** no build thumbnail route is registered

## MODIFIED Requirements

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

- anonymous public reads require no credential.
- the build export and build media thumbnail require a build token.
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
  import token. Anonymous public reads require no credentials. The build export and
  build media thumbnail require a build token. Allowlisted import routes
  accept a session or an import token

#### Scenario: Drift is caught

- **WHEN** a route is registered without a description, or an operation
  documents the default validation response
- **THEN** the OpenAPI contract test fails and names the method and path

### Requirement: Setup, security administration, and build export have distinct HTTP boundaries
The HTTP application SHALL expose setup-admin only while setup remains
incomplete, resolve an administrator actor for user and build-token
administration, and accept a build credential only at build export or the
build thumbnail route. It SHALL
run the applicable rate-limit check before setup, authentication, token, or
upload work; an exhausted result SHALL return the shared `RATE_LIMITED` error
with `Retry-After`. Route handlers SHALL pass portable commands and actors to
the supplied boundaries and SHALL NOT query persistence or compare role
strings.

On Node and Cloudflare, the HTTP application SHALL register build export only
when its composition provides a callable build-token verifier. Without the
verifier, requests to the export path SHALL receive the standard API
not-found response for the request method, generated OpenAPI SHALL omit the
operation, and the application SHALL continue serving its other configured
routes. With the verifier, the application SHALL require successful build-token
authorization before reading the published-state version, reading any export
page or returning a conditional `304`. Missing or rejected credentials SHALL
receive the existing `401 AUTHENTICATION_REQUIRED` response with
`Cache-Control: no-store` and `WWW-Authenticate: Bearer realm="lace"`.

#### Scenario: A build credential is used at an admin route
- **WHEN** a caller supplies a valid build credential to an administrative
  user or token-management route
- **THEN** the route denies the request because build credentials do not
  provide a browser actor

#### Scenario: Build verification is unavailable
- **WHEN** the app is composed without a callable build-token verifier
- **THEN** `GET` and `HEAD /api/v1/public/build-export` return the API `404`,
  no export work runs, generated OpenAPI omits build export and ordinary
  public routes remain available

#### Scenario: Conditional export requires authentication
- **WHEN** a caller without a valid build token requests a configured export
  with a matching `If-None-Match` or asks for a continuation page
- **THEN** the request receives `401` with the Bearer challenge before any
  published-state version or export page is read

#### Scenario: Verified build export keeps its contract
- **WHEN** a caller supplies a valid build token to a configured export
- **THEN** the export retains its published-only paging and conditional read
  behavior, and generated OpenAPI documents the operation with build-token
  security
