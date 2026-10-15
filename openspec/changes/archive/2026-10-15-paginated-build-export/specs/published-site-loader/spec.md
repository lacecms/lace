## MODIFIED Requirements

### Requirement: Static mode reads one export per loader
By default the loader SHALL read the build export once, as one complete page
traversal, and return the same site view to every later and concurrent call.
Concurrent first calls SHALL share one traversal. A failed traversal SHALL NOT
be cached; the next call SHALL start a new one.

#### Scenario: A static build renders many pages
- **WHEN** a static-mode loader is called several times, including
  concurrently, for an export of three pages
- **THEN** exactly one traversal of three page requests is made, and every
  call receives the same site view

#### Scenario: A static read fails transiently
- **WHEN** the first call fails because the API is unavailable during the
  second page and a later call succeeds
- **THEN** the later call starts a new traversal from the first page and
  returns the site view

### Requirement: Revalidate mode issues conditional reads
When revalidation is enabled, the loader SHALL issue a first-page build-export
request on every call, sending the entity tag of the last successful export.
Concurrent calls SHALL share one in-flight read.

- A `304` response SHALL return the previous site view without further page
  requests.
- A changed first page SHALL start a complete traversal whose assembled export
  replaces the view.
- A failed revalidation SHALL fail that call and keep the previous entity tag
  for the next call.
- A `304` received without any previous export SHALL fail with
  `invalid_export`.

The loader SHALL preserve the validator from the latest successful first-page
`200` or `304`, including its weak prefix, for subsequent requests. The
standard published-site and Astro loaders SHALL support normal fetch
compression negotiation without a custom fetch override.

#### Scenario: A publication appears on reload
- **WHEN** a revalidating loader returned version 3 and the API now serves version 4
- **THEN** the next call sends the version-3 entity tag, follows every
  version-4 page and returns the version-4 view

#### Scenario: Unchanged content is reused
- **WHEN** a revalidating loader calls the API and receives `304`
- **THEN** it returns the previous site view without parsing a response body
  or requesting another page

#### Scenario: Concurrent dev requests share one read
- **WHEN** several calls start while a revalidation read is in flight
- **THEN** they all resolve from that single read

#### Scenario: Development reloads through compression
- **WHEN** a standard loader receives a compressed export with a weak tag, then a matching `304`, then a new publication
- **THEN** reload reuses the prior site on `304` and replaces it with the new publication on `200` without overriding fetch

### Requirement: Expected published version is enforced
When an expected published version is configured, the loader SHALL compare
it with the first page's version before requesting any continuation page. On
a difference it SHALL fail with `version_mismatch`, naming both versions. In
this mode the loader SHALL disable traversal restarts. A
`BUILD_EXPORT_VERSION_CHANGED` failure on any page SHALL fail with
`version_mismatch`, naming the expected and the received version.

Without an expected version, any export version SHALL be accepted, and
traversal restarts SHALL be enabled. When restarts are exhausted, the loader
SHALL fail with `version_mismatch`, stating that published content kept
changing during the export.

#### Scenario: Content changes during a build
- **WHEN** the expected published version is 7 and the first page reports
  version 8
- **THEN** the loader fails with `version_mismatch`, requests no continuation
  page and returns no site view

#### Scenario: A publication lands between pages of an expected build
- **WHEN** the expected version is 7, the first page reports 7 and the second
  page fails with `BUILD_EXPORT_VERSION_CHANGED` for actual version 8
- **THEN** the loader fails with `version_mismatch` naming 7 and 8, without
  restarting

#### Scenario: A development export keeps changing
- **WHEN** no expected version is configured and two traversals are each
  interrupted by `BUILD_EXPORT_VERSION_CHANGED`
- **THEN** the loader fails with `version_mismatch` explaining that content
  kept changing
