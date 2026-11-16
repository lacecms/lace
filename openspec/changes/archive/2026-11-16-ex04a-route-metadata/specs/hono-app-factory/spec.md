## MODIFIED Requirements

### Requirement: Setup, security administration, and build export have distinct HTTP boundaries
The HTTP application SHALL expose setup-admin only while setup remains
incomplete, resolve an administrator actor for user and build-token
administration, and accept a build credential only at build export. It SHALL
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
