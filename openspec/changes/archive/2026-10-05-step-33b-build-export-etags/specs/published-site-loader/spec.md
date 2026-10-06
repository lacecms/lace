## MODIFIED Requirements

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

