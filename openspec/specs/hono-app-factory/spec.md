# hono-app-factory Specification

## Purpose

Defines the portable HTTP content boundary that gives Node and Cloudflare the
same validated API, operational behavior, and safe static-admin fallback.

## Requirements

### Requirement: Runtime-neutral API composition
The system SHALL construct the versioned HTTP application from normalized
configuration, portable content and public-read capabilities, actor resolution,
rate limiting, structured logging, health checks, environment metadata, and an
optional admin-asset responder supplied by the runtime composition root. The
HTTP package SHALL not require database, object-storage, Node, or Cloudflare
types. The application SHALL expose generated OpenAPI at
`/api/v1/openapi.json`, with the versioned content routes and their shared
request, response, and error representations.

#### Scenario: Equivalent runtimes compose one API surface
- **WHEN** Node and Cloudflare composition roots provide equivalent portable
  capabilities and environment metadata
- **THEN** each application exposes the same versioned routes and contract
  representations without the HTTP package importing either runtime adapter

#### Scenario: Documentation is requested
- **WHEN** a client requests `/api/v1/openapi.json`
- **THEN** it receives generated OpenAPI describing the versioned content
  routes from the shared transport contracts

### Requirement: Operational request boundary is safe and observable
The system SHALL assign every request a request identifier, include it in the
response, and emit one structured completion record containing the request
identifier, route, status, duration, and authenticated actor identifier when
available. It SHALL apply configured request-rate limits and JSON/body-size
limits before protected or mutation work runs. It SHALL return the shared
sanitized error envelope for contract validation, authorization, known
application failures, malformed bodies, body-limit failures, and unexpected
exceptions; no response or log record SHALL disclose stack traces, SQL text,
credentials, or raw request bodies.

#### Scenario: A malformed oversized mutation arrives
- **WHEN** a request exceeds the configured body limit or cannot be decoded as
  JSON for a content mutation
- **THEN** it is rejected before a mutation capability runs with a sanitized
  stable error envelope and is recorded with its request identifier

#### Scenario: A request fails unexpectedly
- **WHEN** an unclassified exception escapes route processing
- **THEN** the client receives only the stable internal-error envelope while
  the completion record contains the request identifier and no secret or raw
  exception content

### Requirement: Liveness and readiness stay separate from content routes
The system SHALL expose unauthenticated `GET /health/live` and
`GET /health/ready` endpoints. Liveness SHALL confirm that the HTTP process can
serve requests without checking dependencies. Readiness SHALL use the supplied
cheap readiness capability to report unavailable configuration or required
dependencies without performing an expensive external operation. Health
endpoints SHALL not be handled by the admin fallback or versioned API router.

#### Scenario: A dependency is unavailable
- **WHEN** the readiness capability reports configuration or database
  unavailability
- **THEN** `GET /health/ready` reports failure while `GET /health/live`
  continues to report that the HTTP process is alive

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
- **THEN** the request returns the shared authorization error before a content
  read or mutation capability runs

#### Scenario: A public collection page is requested
- **WHEN** a caller requests a configured collection with a valid opaque cursor
- **THEN** the response contains only that collection's published entries and
  a continuation cursor that can be supplied to the same collection route

### Requirement: Build export supports version-derived conditional reads
The system SHALL derive the build-export ETag from the current published-state
version. On a matching `If-None-Match` value, it SHALL return `304 Not
Modified` with the ETag and SHALL not load the complete export. On a missing or
non-matching value, it SHALL return the validated build-export representation
and its version-derived ETag. A malformed conditional tag SHALL be rejected as
a shared validation error.

Both Node and Worker composition roots SHALL accept strong and weak version-derived `If-None-Match` values and compare their encoded versions. The origin SHALL return a strong current ETag on both `200` and `304`. Authorization SHALL be checked before a conditional response, and a `200` ETag SHALL encode the version of the returned export, including if publication occurs after the initial version lookup.

#### Scenario: A build consumer already has the current export
- **WHEN** `If-None-Match` encodes the current published-state version
- **THEN** the build-export endpoint returns `304` without loading the full
  export payload

#### Scenario: Publication has advanced the version
- **WHEN** `If-None-Match` encodes an older valid version
- **THEN** the endpoint loads and returns the current export with the new ETag

#### Scenario: Weak conditional read skips export loading
- **WHEN** an authorized consumer sends a weak tag encoding the current version
- **THEN** each runtime returns an empty `304` without loading the export

#### Scenario: A publication follows a weak conditional read
- **WHEN** a consumer received `304` for a weak tag and another publication advances the version
- **THEN** its next read with that tag returns `200`, the new published content and its new strong version tag

#### Scenario: A conditional read lacks authorization
- **WHEN** a caller without a valid build credential supplies the current weak tag
- **THEN** the protected export denies access rather than returning `304`

### Requirement: Admin assets cannot mask API or health failures
The system SHALL delegate a non-API, non-health request to the supplied
built-admin responder when one is configured. It SHALL never delegate paths
under `/api/` or either health endpoint to that responder; unmatched paths in
those namespaces SHALL retain their API or health failure response.

#### Scenario: A browser loads an admin client-side route
- **WHEN** the built-admin responder is configured and the browser requests a
  non-API, non-health client-side route
- **THEN** the application delegates the request to that responder

#### Scenario: An unknown API path is requested
- **WHEN** a request under `/api/` does not match a versioned endpoint
- **THEN** it receives an API failure response and never receives the admin
  application fallback

### Requirement: Authentication routes and protected routes have separate boundaries
The system SHALL dispatch `/api/auth/*` to the configured authentication
provider before catch-all API and admin-asset fallback routes. It SHALL resolve
an actor only for protected routes and SHALL leave health endpoints and
documented public content routes unauthenticated. Route handlers SHALL pass
the resolved actor to application use cases, which retain responsibility for
permission checks; handlers SHALL NOT compare role strings.

#### Scenario: Authentication route is not masked
- **WHEN** a request targets a known authentication-provider route below
  `/api/auth/`
- **THEN** the provider handles it rather than an API catch-all or admin asset
  responder

#### Scenario: Public route remains anonymous
- **WHEN** an unauthenticated caller requests a documented public content or
  health route
- **THEN** it receives that route's normal response without an actor-resolution
  attempt

#### Scenario: Protected route delegates authorization
- **WHEN** a validated editor requests an admin mutation that requires a
  permission the editor lacks
- **THEN** the route passes the actor to the application boundary and returns
  its shared authorization failure without comparing the role in the handler

### Requirement: Setup, security administration, and build export have distinct HTTP boundaries
The HTTP application SHALL expose setup-admin only while setup remains
incomplete, resolve an administrator actor for user and build-token
administration, and accept a build credential only at build export. It SHALL
run the applicable rate-limit check before setup, authentication, token, or
upload work; an exhausted result SHALL return the shared `RATE_LIMITED` error
with `Retry-After`. Route handlers SHALL pass portable commands and actors to
the supplied boundaries and SHALL NOT query persistence or compare role
strings.

#### Scenario: A build credential is used at an admin route
- **WHEN** a caller supplies a valid build credential to an administrative
user or token-management route
- **THEN** the route denies the request because build credentials do not
provide a browser actor

### Requirement: Media HTTP routes separate draft administration from public delivery
The HTTP application SHALL expose authenticated `GET` and `POST`
`/api/v1/admin/media`, authenticated `DELETE /api/v1/admin/media/:mediaId`,
authenticated `POST /api/v1/admin/media/:mediaId/retry-deletion`, and
authenticated `GET /api/v1/admin/media/:mediaId/preview` routes. The list and
preview routes SHALL require the media lifecycle read permission, while upload,
deletion, and retry deletion SHALL retain the media lifecycle write permission. It SHALL expose
anonymous `GET /api/v1/public/media/:mediaId` only when the supplied public-read
capability finds a reference from a current published snapshot. A non-existent,
draft-only, deleting, or unreferenced media ID SHALL have the same public
not-found response and SHALL not be probed through object storage.

#### Scenario: An administrator uploads and previews media
- **WHEN** an actor with the required permissions sends one valid multipart
  `file` and then requests its admin preview
- **THEN** the API returns validated media metadata for upload and streams the
  verified binary only to that authenticated actor

#### Scenario: Anonymous draft probing is denied without disclosure
- **WHEN** an anonymous caller requests a media ID used only by a draft or not
  present in a current published snapshot
- **THEN** the public route returns the stable not-found response without
  resolving the object or revealing whether the ID exists

#### Scenario: A deletion request is accepted for asynchronous processing
- **WHEN** an authorized writer deletes an eligible active media item
- **THEN** the API returns its deleting metadata with an accepted status and
  does not synchronously delete its binary object

#### Scenario: An authorized administrator retries terminal deletion failure
- **WHEN** an actor with media lifecycle write permission posts a retry request
  for an unreferenced `delete_failed` media item
- **THEN** the API returns accepted deleting metadata and does not synchronously
  access or delete the binary object

### Requirement: Media ingestion has an independent streaming size boundary
The HTTP application SHALL consume a multipart media upload as a bounded binary
stream and reject it at the 10 MiB media limit even when its request has no
trustworthy content length or the general JSON body limit is lower. It SHALL
reject missing, duplicate, or non-file multipart parts before creating metadata,
and shall discard/cancel a rejected stream without forwarding bytes beyond the
media limit to object storage.

#### Scenario: Streaming upload crosses the media limit
- **WHEN** a multipart file's cumulative bytes cross 10 MiB while arriving from
  a chunked request
- **THEN** the route returns the stable payload-too-large error and does not
  create a stored object or media metadata row

### Requirement: Administrator can read a small operational status
The server SHALL expose `GET /api/v1/admin/settings/status` to an authorized administrator. Its validated response SHALL report readiness, the number of configured content models, and `engineVersion`, the complete running CMS release supplied by the runtime composition. It SHALL reveal no connection string, credential, or private configuration value. An editor or viewer SHALL receive the standard authorization denial. Build credentials and anonymous callers SHALL NOT gain access to this response. Existing readiness semantics SHALL remain unchanged; the version SHALL NOT imply successful publication or deployment.

#### Scenario: Administrator reads status
- **WHEN** an authenticated administrator requests settings status
- **THEN** the response reports current readiness, configured-model count and the complete running CMS release, including its prerelease suffix

#### Scenario: Editor requests status
- **WHEN** an authenticated editor requests settings status
- **THEN** the response denies access without returning operational status

#### Scenario: Non-administrator credentials request status
- **WHEN** a viewer, anonymous caller or build credential requests settings status
- **THEN** the standard authorization boundary rejects the request without returning operational status

### Requirement: Administrator build routes preserve the actor boundary
The HTTP application SHALL expose versioned authenticated administrator routes for manual build request and failed-build retry. Routes SHALL validate the shared request and response contracts and call actor-checked application commands. They SHALL not synchronously run a build.

#### Scenario: Administrator queues a build
- **WHEN** an authenticated administrator posts a valid manual build request
- **THEN** the route returns the durable queue receipt without waiting for a build trigger

#### Scenario: Editor attempts retry
- **WHEN** an authenticated editor posts a retry for a failed build
- **THEN** the route denies the action without enqueueing work

### Requirement: Versioned build read routes expose persisted history
The HTTP application SHALL expose authenticated `GET /api/v1/admin/site-builds` and `GET /api/v1/admin/site-builds/:buildId` routes with shared validated response contracts. A missing build SHALL return the standard not-found envelope. Existing administrator build request and retry routes SHALL remain compatible.

#### Scenario: History request
- **WHEN** an authenticated actor requests the list
- **THEN** the route returns a bounded newest-first list of validated build records

#### Scenario: Missing detail
- **WHEN** an authenticated actor requests an unknown build ID
- **THEN** the route returns the standard 404 response

### Requirement: Session-summary and email-test routes keep the actor boundary
`GET /api/v1/admin/session` SHALL resolve the actor through the protected
actor boundary, SHALL return the validated session summary for any
authenticated Lace role, and SHALL return the sanitized unauthenticated
envelope without a valid session. `POST /api/v1/admin/settings/email-test`
SHALL accept no request body fields. It SHALL require `settings:manage`
through the application use case, address the message only to the acting
user's persisted email, and return the validated email-test result with
status `200` for both `sent` and `failed` outcomes. It SHALL apply a portable
per-actor rate limit of at most 5 requests per hour, after which it SHALL return
the sanitized rate-limit envelope without contacting the provider.
`GET /api/v1/admin/settings/status` SHALL include the email status computed
from the composed provider without contacting it. Settings status, build-token
routes and build request/retry SHALL authorize `settings:manage`, the same
permission that gates the admin Settings and build actions. Both runtimes SHALL
expose identical routes and responses.

#### Scenario: Viewer requests a test email
- **WHEN** a viewer calls `POST /api/v1/admin/settings/email-test`
- **THEN** the response is the authorization-denied envelope and no message is
  sent

#### Scenario: Request names another recipient
- **WHEN** an administrator calls the email-test route with a body naming a
  recipient
- **THEN** the request is rejected by validation and no message is sent

#### Scenario: Test emails exceed the limit
- **WHEN** an administrator sends a sixth test email within one hour
- **THEN** the response is the rate-limit envelope and the provider is not
  contacted

#### Scenario: Editor requests settings administration
- **WHEN** an editor, who lacks `settings:manage`, requests settings status or
  creates a build token
- **THEN** each request receives the authorization-denied envelope

#### Scenario: Anonymous visitor requests the session summary
- **WHEN** a request without a session calls `GET /api/v1/admin/session`
- **THEN** the response is the unauthenticated envelope

### Requirement: Account routes keep their actor, token and rate-limit boundaries
The HTTP application SHALL expose these routes on both runtimes with identical
responses:

- **Public, without a session:**
  - `POST /api/v1/invitations/inspect` and `POST /api/v1/invitations/accept`;
  - `POST /api/v1/password-reset/request`, which always returns `202` with an
    empty accepted body and schedules delivery without awaiting it;
  - `POST /api/v1/password-reset/confirm`, which returns `204`.
- **Any authenticated actor:**
  - `PATCH /api/v1/account` and `POST /api/v1/account/password`;
  - `GET /api/v1/account/sessions` and `DELETE /api/v1/account/sessions/:sessionId`;
  - `POST /api/v1/account/sessions/revoke-others`.
- **Requiring `users:manage` through the use cases:**
  - `GET` and `POST /api/v1/admin/invitations`;
  - `POST /api/v1/admin/invitations/:invitationId/resend` and
    `DELETE /api/v1/admin/invitations/:invitationId`;
  - `POST /api/v1/admin/users/:userId/password-reset` and
    `POST /api/v1/admin/users/:userId/sessions/revoke`.

`POST /api/v1/admin/users` SHALL no longer exist. Tokens SHALL be accepted only
in JSON bodies, never in paths or queries, and request logs SHALL contain no
token. Invalid invitation and reset tokens SHALL return a single `410` invalid
envelope without distinguishing unknown, expired, consumed or revoked tokens.
Rate-limit checks SHALL run before token lookups and email delivery.

#### Scenario: Removed creation route
- **WHEN** an administrator posts an email, password and role to
  `/api/v1/admin/users`
- **THEN** the response is `404` and no user is created

#### Scenario: Anonymous account request
- **WHEN** a request without a session calls `GET /api/v1/account/sessions`
- **THEN** the response is the unauthenticated envelope

#### Scenario: Reset request response is immediate
- **WHEN** a reset is requested for an existing account and the email provider
  is slow
- **THEN** the `202` response is returned without waiting for delivery
