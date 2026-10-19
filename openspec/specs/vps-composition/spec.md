# vps-composition Specification

## Purpose

Defines the deployable single-site VPS topology and recovery behavior that keeps the API, media, builder, and static site available across process restarts.

## Requirements

### Requirement: VPS composition isolates persistent services
The production deployment SHALL provide API, object storage, builder, static serving, and a dedicated dispatcher with persistent database, object, and release storage. Only the reverse proxy SHALL publish a public port; API, storage, and builder communication SHALL use private networks. Services SHALL have health checks and deterministic startup dependencies.

#### Scenario: Production stack starts
- **WHEN** an operator supplies valid secrets and starts the stack
- **THEN** the public origin serves API, admin, and the current static release while internal endpoints are not published directly

### Requirement: Recovery dispatcher survives API restarts
The production dispatcher SHALL poll durable outbox work independently of the API server, including expired site-build leases, and SHALL not discard publication when the builder is unavailable.

#### Scenario: API restarts during queued work
- **WHEN** the API stops after publication commits and the dedicated dispatcher remains running
- **THEN** the event is dispatched after its debounce or lease expiry without another API request

#### Scenario: Builder is offline
- **WHEN** a publication commits while the builder is offline
- **THEN** publication succeeds, the previous release remains online, and the durable event follows the retry policy

### Requirement: The VPS proxy forwards media uploads up to the API limit
The VPS reverse proxy SHALL accept on `POST /api/v1/admin/media` a request
body at least as large as the API's media upload ceiling plus a multipart
allowance of no more than 1 MiB, and SHALL forward that body to the API as it
arrives instead of buffering it first, so the API's own streaming size
boundary decides. Every other request SHALL keep a body limit equal to the
API's default JSON body limit of 1 MiB. The repository's and the generated
project's proxy configurations SHALL be identical.

#### Scenario: An image above 1 MiB passes the proxy
- **WHEN** an editor uploads a valid 8 MiB JPEG through the VPS public origin
- **THEN** the proxy forwards all of its bytes and the API creates the media
  item

#### Scenario: An upload above the ceiling is refused
- **WHEN** a client sends a 12 MiB body to the media upload route
- **THEN** the proxy or the API refuses it with `413` and no media is created

#### Scenario: Other API routes keep the JSON limit
- **WHEN** a client sends a 2 MiB body to an entry save route through the
  proxy
- **THEN** the proxy refuses it with `413`

#### Scenario: Proxy configurations cannot drift
- **WHEN** the API's media upload ceiling changes or one proxy configuration
  is edited without the other
- **THEN** the repository test suite fails until both configurations allow
  the new ceiling and are identical again

### Requirement: The VPS proxy caches content-hashed site assets for 30 days
The VPS reverse proxy SHALL serve successful responses for files of the
current release under `/_astro/` with `Cache-Control: public,
max-age=2592000, immutable`. A request under `/_astro/` for a file that does
not exist SHALL receive `404` without that header. Every other site response,
including HTML and the no-release response, SHALL keep `Cache-Control:
no-cache`. A request for `/_headers` SHALL receive `404` even when the release
contains that file. The repository's and the generated project's proxy
configurations SHALL remain identical.

#### Scenario: A hashed asset is cached
- **WHEN** a browser requests an existing file under `/_astro/` of the
  current release
- **THEN** the proxy answers `200` with `Cache-Control: public,
  max-age=2592000, immutable`

#### Scenario: A missing asset is not cached
- **WHEN** a browser requests a file under `/_astro/` that the current
  release does not contain
- **THEN** the proxy answers `404` without the 30-day cache header

#### Scenario: Pages still revalidate
- **WHEN** a browser requests `/` or any page of the current release
- **THEN** the response carries `Cache-Control: no-cache`

#### Scenario: Pages header rules stay private
- **WHEN** the release contains a `_headers` file and a client requests
  `/_headers`
- **THEN** the proxy answers `404`

#### Scenario: Cache rules cannot drift
- **WHEN** one proxy configuration changes the asset cache rule or the
  configurations differ
- **THEN** the repository test suite fails

### Requirement: VPS composition persists the builder cache
The production Compose definitions SHALL mount a dedicated named volume for
the builder's build cache wherever a builder service exists. The volume SHALL
be separate from the release output, database and media volumes, and SHALL NOT
be mounted by any other service.

#### Scenario: Builder restarts keep the cache
- **WHEN** the builder container is recreated with the same Compose project
- **THEN** the next build finds the cache written by earlier builds

#### Scenario: No-site project
- **WHEN** a generated project without a site starts its stack
- **THEN** it defines neither a builder nor a builder cache volume
