# published-site-loader Specification

## Purpose
Defines the framework-neutral loader that turns the authenticated published build export into a validated, published-only site view, so every Lace site reads content, checks consistency, and reports failures the same way.

## Requirements

### Requirement: Loader configuration is explicit and framework-neutral
The SDK SHALL provide a published-site loader factory that takes its configuration only from its arguments: an optional environment record (`LACE_API_BASE_URL`, `LACE_BUILD_TOKEN`, `LACE_PUBLIC_BASE_URL`, `LACE_EXPECTED_PUBLISHED_VERSION`) and optional explicit API base URL, build token, public media base URL, and expected published version values that take precedence over the record. Empty or whitespace-only values SHALL count as absent. The loader SHALL NOT read process or bundler environment globals itself and SHALL NOT import any UI framework. Configuration SHALL be resolved when the loader is first called, not when it is created, and a missing API base URL, a missing build token, an invalid API base URL, or an expected version that is not a non-negative integer SHALL fail with the `missing_configuration` code and name the setting without revealing the token.

#### Scenario: Explicit values override the environment record
- **WHEN** a loader is created with an environment record naming one API origin and an explicit base URL naming another
- **THEN** the build-export request goes to the explicit base URL

#### Scenario: A build token is missing
- **WHEN** a loader is called without a configured build token
- **THEN** it fails with `missing_configuration` naming `LACE_BUILD_TOKEN` and sends no request

#### Scenario: A loader is created before configuration exists
- **WHEN** a loader is created with an empty environment record but never called
- **THEN** creation succeeds and no error is raised

### Requirement: Static mode reads one export per loader
By default the loader SHALL read the build export once and return the same site view to every later and concurrent call. Concurrent first calls SHALL share one request. A failed read SHALL NOT be cached; the next call SHALL retry.

#### Scenario: A static build renders many pages
- **WHEN** a static-mode loader is called several times, including concurrently
- **THEN** exactly one build-export request is made and every call receives the same site view

#### Scenario: A static read fails transiently
- **WHEN** the first call fails because the API is unavailable and a later call succeeds
- **THEN** the later call issues a new request and returns the site view

### Requirement: Revalidate mode issues conditional reads
When revalidation is enabled the loader SHALL issue a build-export request on every call, sending the entity tag of the last successful export. Concurrent calls SHALL share one in-flight request. A `304` response SHALL return the previous site view, and a changed export SHALL replace it. A failed revalidation SHALL fail that call and keep the previous entity tag for the next call. A `304` received without any previous export SHALL fail with `invalid_export`.

The loader SHALL preserve the validator from the latest successful `200` or `304`, including its weak prefix, for subsequent requests. The standard published-site and Astro loaders SHALL support normal fetch compression negotiation without a custom fetch override.

#### Scenario: A publication appears on reload
- **WHEN** a revalidating loader returned version 3 and the API now serves version 4
- **THEN** the next call sends the version-3 entity tag and returns the version-4 view

#### Scenario: Unchanged content is reused
- **WHEN** a revalidating loader calls the API and receives `304`
- **THEN** it returns the previous site view without parsing a response body

#### Scenario: Concurrent dev requests share one read
- **WHEN** several calls start while a revalidation request is in flight
- **THEN** they all resolve from that single request

#### Scenario: Development reloads through compression
- **WHEN** a standard loader receives a compressed export with a weak tag, then a matching `304`, then a new publication
- **THEN** reload reuses the prior site on `304` and replaces it with the new publication on `200` without overriding fetch

### Requirement: Expected published version is enforced
When an expected published version is configured, the loader SHALL fail with `version_mismatch` if a received export has a different version, naming both versions. Without an expected version, any export version SHALL be accepted.

#### Scenario: Content changes during a build
- **WHEN** the expected published version is 7 and the API returns an export with version 8
- **THEN** the loader fails with `version_mismatch` and returns no site view

### Requirement: The site view exposes only published content
The loader SHALL return a site view with the export `version` and lookups by resolved path, by model key, and by model key and slug, plus a public media URL builder. Each entry SHALL expose its identifier, model key, CMS-resolved path, optional slug, title, field values, and blocks ordered by position, all taken from the published snapshot; the view SHALL expose no draft snapshot, draft-shaped property, or editorial metadata. Lookups SHALL return no entry rather than fail when nothing matches, and listing an unknown model SHALL return an empty list. Entries listed by model SHALL be ordered by path. The view SHALL use each entry's CMS-resolved path as-is and SHALL NOT derive routes from patterns or depend on particular model keys. Media URLs SHALL use the public media base URL when configured and the API base URL otherwise, and the view SHALL be immutable.

#### Scenario: A page looks up its entry by path
- **WHEN** a site requests the entry at `/` and a published entry has that resolved path
- **THEN** the view returns that entry's published title, fields, and ordered blocks and no draft data

#### Scenario: A route is not published
- **WHEN** a site requests a path, slug, or model with no published entry
- **THEN** the path and slug lookups return no entry and the model listing is empty

#### Scenario: Any model key can be listed
- **WHEN** an export contains published entries of a model named `recipes`
- **THEN** listing `recipes` returns those entries ordered by path without any loader change

#### Scenario: Media URLs use the public origin
- **WHEN** a public media base URL differs from the API base URL
- **THEN** media URLs from the view use the public media base URL and contain no build token

### Requirement: Inconsistent exports are rejected
The loader SHALL fail with `invalid_export` when an export contains two entries with the same path, two entries of the same model with the same slug, or an entry without a published snapshot, naming the conflicting path, model and slug, or entry.

#### Scenario: Duplicate slugs in a model
- **WHEN** two published entries of model `posts` share the slug `hello`
- **THEN** the loader fails with `invalid_export` naming `posts` and `hello`

#### Scenario: Duplicate paths across models
- **WHEN** two published entries of different models resolve to the same path
- **THEN** the loader fails with `invalid_export` naming that path

### Requirement: Loader failures carry stable codes and hints
Loader failures SHALL be SDK errors with a stable code: `missing_configuration`, `rejected_token` for HTTP 401 or 403 from the build export, `api_unavailable` for transport failures including timeouts, `version_mismatch`, and `invalid_export`. Other SDK failures, such as other HTTP errors and contract violations, SHALL propagate unchanged. Messages SHALL be project-neutral, SHALL never contain the build token, and SHALL preserve the underlying failure as the cause. A caller-supplied hint for a code SHALL be appended to that code's message.

#### Scenario: The API rejects the token
- **WHEN** the build export responds with HTTP 401
- **THEN** the loader fails with `rejected_token`, the message omits the token, and the HTTP error is the cause

#### Scenario: A generated project names its commands
- **WHEN** a loader created with a hint for `api_unavailable` cannot reach the API
- **THEN** the `api_unavailable` message ends with that hint

#### Scenario: An unrelated HTTP failure
- **WHEN** the build export responds with HTTP 500 and a valid error envelope
- **THEN** the loader rethrows the SDK HTTP error unchanged
