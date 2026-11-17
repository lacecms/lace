# vps-composition Specification

## Purpose

Defines the deployable single-site VPS topology and recovery behavior that keeps the API, media, builder, and static site available across process restarts.

## Requirements

### Requirement: VPS composition isolates persistent services
The production deployment SHALL provide API, object storage, static serving
and a dedicated dispatcher with persistent database, object and release
storage. It SHALL provide a builder when a site is configured. Services
SHALL have health checks and deterministic startup dependencies. API,
storage and builder communication SHALL use private Compose networks.
Neither the repository production example nor the generated production
definition SHALL publish a host port for the API, object store, dispatcher or
builder. Nginx SHALL reach the API on the Compose network.

With default settings Nginx SHALL publish its HTTP port on IPv4 loopback
(`127.0.0.1`) for a host TLS proxy. The host port SHALL default to 8080 and
remain configurable through `LACE_HTTP_PORT`. An operator SHALL explicitly
configure any alternate Nginx binding or proxy network topology. The public
HTTPS origin SHALL serve the admin, API and configured static site through
Nginx. The Compose builder SHALL access the API at `http://api:3000/`.

#### Scenario: Production stack starts
- **WHEN** an operator supplies valid settings and starts the production stack with a host TLS proxy
- **THEN** the HTTPS origin serves the API, admin and current static release through Nginx, and the Compose port mappings expose only Nginx on the configured loopback port

#### Scenario: Production starts without a site
- **WHEN** a generated no-site project starts its production stack
- **THEN** Nginx provides the same admin and API ingress, the API has no host mapping, and the stack requires no builder

#### Scenario: An operator configures an alternate Nginx bind
- **WHEN** a deployment explicitly selects an alternate host interface for a controlled proxy
- **THEN** the resolved Nginx mapping uses that interface and the API still has no host port

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

### Requirement: Node Compose selects a pinned private storage image

The repository development and VPS Compose configurations and the generated Node Compose configuration SHALL select the same prebuilt PGSTY SILO release pinned to its multi-platform manifest digest for Linux amd64 and arm64. An absent or empty `LACE_MINIO_IMAGE` SHALL select the pinned default. A nonempty `LACE_MINIO_IMAGE` in the Compose environment, including the operator's `.env`, SHALL select the supplied full image reference. The storage service SHALL retain the `minio` service name, the private `http://minio:9000` endpoint, existing credential and bucket inputs, and the existing `minio-data` mount at `/data`. Its health check and idempotent private bucket initializer SHALL gate normal API startup. A storage image change SHALL preserve the production network isolation and host port bindings required by this capability.

#### Scenario: The default is consistent and private
- **WHEN** Compose resolves the repository development stack, repository VPS stack, or a generated Node stack with `LACE_MINIO_IMAGE` unset or empty
- **THEN** the `minio` service resolves to the same pinned SILO image, uses the existing private endpoint and volume mapping, and has no published host port

#### Scenario: An operator selects an alternate compatible image
- **WHEN** an operator sets `LACE_MINIO_IMAGE` to a compatible full image reference in `.env`
- **THEN** Compose selects that image and retains the service name, private network access, initializer dependency, and volume mapping

#### Scenario: The configured object store cannot start
- **WHEN** the image cannot be pulled and is unavailable locally, or the replacement cannot become healthy or initialize the bucket
- **THEN** a fresh stack cannot become ready, and the operator can diagnose the failed Compose dependency without recreating the data volumes

### Requirement: Operator storage migration preserves persisted media

Deployment guidance SHALL describe switching an existing supported MinIO volume to SILO under the same Compose project, with writes paused and a consistent pre-switch backup. It SHALL require readback of representative existing Lace media by identifier or key with byte comparison, a new write/read verification, and persistence after restarting storage. Recovery guidance SHALL use the previous image and pre-switch backup when reverting a failed migration. Normal startup and template upgrades SHALL preserve the named volume and SHALL NOT reset its contents.

#### Scenario: A previously shipped MinIO volume is reused
- **WHEN** an operator switches an isolated stack from the previously shipped MinIO release to SILO using the same named volume, bucket, and credentials
- **THEN** Lace reads the previously recorded media with unchanged bytes and media identifiers, can write and read new media, and still reads both after a storage restart

#### Scenario: A migrated volume fails validation
- **WHEN** startup or historical media readback fails during the migration
- **THEN** the documented recovery path restores the saved volume and corresponding pre-switch state for the previous image before resuming writes
