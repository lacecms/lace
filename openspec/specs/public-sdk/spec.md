# public-sdk Specification

## Purpose

Defines the public, build-time Lace client so static sites consume validated
published content without access to administrative or mutable CMS operations.

## Requirements

### Requirement: Public SDK exposes only published-content operations
The SDK SHALL expose typed operations to read a published page, one cursor page
of a published collection, a published collection entry by model key and slug,
and published content by resolved path. It SHALL expose a separately named
operation that follows collection cursors until all items are collected, and
single-page collection reads SHALL NOT automatically follow cursors. The SDK
SHALL expose a public-media URL helper and a build-export read operation. It
SHALL NOT expose draft, admin-session, mutation, or token-administration
operations.

#### Scenario: A static-site build reads published content
- **WHEN** a build calls the page, collection, slug, path, or media helper with
  valid public identifiers
- **THEN** the SDK requests only the matching `/api/v1/public` resource and
  returns data typed from the shared public DTO contract

#### Scenario: A build explicitly requests every collection item
- **WHEN** a collection response supplies a next cursor and a caller invokes
  the all-items collection operation
- **THEN** the SDK requests each successive cursor in order and returns the
  concatenated published items without decoding or altering the cursor value

#### Scenario: A one-page collection read preserves pagination control
- **WHEN** a caller invokes the one-page collection operation and the response
  supplies a next cursor
- **THEN** the SDK returns that cursor with the current items and makes no
  additional request

### Requirement: Public SDK normalizes safe client transport
The SDK SHALL accept an absolute HTTP(S) API base URL with or without a trailing
slash and preserve an intentional path prefix when forming public API URLs. It
SHALL use an injected fetch implementation when provided and otherwise the
runtime global fetch. Each request SHALL apply the SDK's stable user-agent when
the runtime permits that header, and SHALL combine a configured timeout with a
caller-supplied abort signal without discarding either cancellation cause.

#### Scenario: An API runs beneath a base path
- **WHEN** a client is configured with `https://cms.example/lace` or
  `https://cms.example/lace/`
- **THEN** its public-content and media URLs retain `/lace/` exactly once before
  `/api/v1/public/`

#### Scenario: A timed-out request is cancelled
- **WHEN** a public SDK operation exceeds its configured timeout
- **THEN** the request is aborted and the caller receives a typed transport
  error that identifies cancellation rather than a fabricated HTTP response

#### Scenario: A caller cancels an in-flight request
- **WHEN** a caller-supplied abort signal aborts before a response completes
- **THEN** the SDK stops the request and preserves that abort as the failure
  cause

### Requirement: Build credentials are isolated to build exports
The SDK SHALL accept an optional build token and send it as a bearer credential
only when reading the build-export resource. Page, collection, path, and public
media requests SHALL be anonymous regardless of whether a build token is
configured.

#### Scenario: A build reads its authenticated export
- **WHEN** a client with a build token requests the build export
- **THEN** it sends that token only in the export request's Authorization header

#### Scenario: A public content read follows an export read
- **WHEN** the same configured client subsequently reads a page, collection,
  path, or media URL
- **THEN** that request contains no build-token Authorization header

### Requirement: Public SDK validates responses and reports typed failures
The SDK SHALL validate successful JSON responses with the shared public DTO
schemas before returning them. It SHALL map a valid Lace error envelope on a
non-success response to a typed HTTP error containing its status and stable
error code. It SHALL report an invalid JSON body, an invalid success DTO, or a
non-success response without a valid error envelope as a typed contract error;
it SHALL NOT return unchecked JSON.

#### Scenario: A server returns malformed published content
- **WHEN** a successful public response is not valid for its shared DTO schema
- **THEN** the SDK rejects it with a typed contract error and exposes no
  partially validated content to the caller

#### Scenario: A server rejects a public request
- **WHEN** a public resource responds with a valid Lace error envelope such as
  `NOT_FOUND` or `AUTHORIZATION_DENIED`
- **THEN** the SDK rejects it with a typed HTTP error carrying that status and
  stable error code

### Requirement: Build export supports conditional retrieval
The SDK build-export operation SHALL accept an optional prior entity tag and
send it in `If-None-Match`. On a `304` response it SHALL return an unchanged
result with the response entity tag and SHALL NOT parse a response body. On a
successful export response it SHALL validate the build-export DTO and return
the validated export with its entity tag.

The operation SHALL validate strong and weak version-derived tags, return the received validator unchanged and send a supplied validator unchanged. Missing and malformed ETag headers on `200` or `304` SHALL raise distinct `LaceContractError` messages naming the expected `"N"` or `W/"N"` format and advising a compatible API/SDK upgrade and proxy/header configuration check. A malformed value SHALL be displayed as an escaped preview of at most 80 characters after build-token redaction; diagnostics SHALL contain neither the build credential nor the export body. A changed response tag SHALL encode the export version; a `304` tag SHALL encode the supplied prior version when a prior tag was supplied.

#### Scenario: The published version is unchanged
- **WHEN** a caller supplies an entity tag for the current published version
  and the build-export endpoint returns `304`
- **THEN** the SDK reports that the export is unchanged and makes no JSON parse
  attempt

#### Scenario: The published version has changed
- **WHEN** the caller supplies a stale entity tag and the endpoint returns a
  successful build export with a replacement entity tag
- **THEN** the SDK returns the validated export and replacement entity tag

#### Scenario: A compressed response has a weak validator
- **WHEN** compression rewrites an export tag to `W/"7"`
- **THEN** the SDK accepts and returns that exact tag and can send it on the next read

#### Scenario: Header diagnostics are actionable and safe
- **WHEN** an export response lacks an ETag or carries a malformed one containing controls, a long value or the configured token
- **THEN** a distinct bounded contract error explains the expected format and recovery, escapes controls and redacts the token without including the export body

#### Scenario: A response validator disagrees with its version
- **WHEN** a `200` tag encodes a different version than its export or a `304` tag differs from the prior version
- **THEN** the SDK rejects the response as a contract violation
