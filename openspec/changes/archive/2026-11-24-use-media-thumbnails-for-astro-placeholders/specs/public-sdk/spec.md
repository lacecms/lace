## MODIFIED Requirements

### Requirement: Build credentials are isolated to authenticated build reads
The SDK SHALL accept an optional build token and send it as a bearer credential
only on build-export and build thumbnail requests to the configured API base.
Page, collection, path, and public original media requests SHALL be anonymous
regardless of whether a build token is configured.

#### Scenario: A build reads its authenticated export
- **WHEN** a client with a build token requests the build export
- **THEN** it sends that token only in the export request's Authorization header

#### Scenario: A public content read follows an export read
- **WHEN** the same configured client subsequently reads a page, collection,
  path, or media URL
- **THEN** that request contains no build-token Authorization header

## ADDED Requirements

### Requirement: The SDK reads bounded build thumbnail responses
The SDK SHALL provide a build thumbnail read with an optional prior strong validator. It SHALL build the URL from the configured API base and media identifier, preserve the path prefix, send credentials only as the Bearer header, and reject redirects. It SHALL distinguish a validated `image/webp` response with its derivative ETag from a bodyless 304. It SHALL reject a 304 without a prior validator, invalid media type, missing or invalid validator, empty or oversized responses, including streamed bodies exceeding 96 KiB without a usable length. The SDK SHALL apply its cancellation and timeout to the entire response, including body reads. Transport and response failures SHALL use the SDK's typed errors without exposing the token.

#### Scenario: The API and public media have different origins
- **WHEN** the SDK reads a thumbnail for an item whose public URL points at a different origin or the API responds with a redirect
- **THEN** the initial request targets the configured API path and the SDK sends no request to the redirected or public media origin

#### Scenario: An intermediary sends an invalid thumbnail
- **WHEN** the thumbnail read receives HTML, a body that exceeds 96 KiB during streaming, or an unsolicited 304
- **THEN** the SDK reports a typed failure and yields no image bytes

## RENAMED Requirements

- FROM: `### Requirement: Build credentials are isolated to build exports`
- TO: `### Requirement: Build credentials are isolated to authenticated build reads`
