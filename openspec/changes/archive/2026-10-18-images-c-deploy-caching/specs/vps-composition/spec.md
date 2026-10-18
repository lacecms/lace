## ADDED Requirements

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
