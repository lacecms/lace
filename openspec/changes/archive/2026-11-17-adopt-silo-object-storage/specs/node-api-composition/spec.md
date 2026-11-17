## MODIFIED Requirements

### Requirement: Node runtime composes portable API capabilities

The system SHALL provide a Node composition root that supplies the normalized
configuration, SQLite-backed content capabilities, system UTC clock, unique-ID
generation, non-authoritative no-op cache, configured private S3-compatible
object storage, no-op site-build trigger, request IDs, logging, rate limiting,
health checks, and environment metadata required by the portable HTTP
application. It SHALL construct the portable media lifecycle use cases with the
Node object store and expose only contract DTOs or verified binary responses
through HTTP; database rows, SQLite driver objects, and object-store credentials
SHALL remain inside the Node boundary.

#### Scenario: A seeded Node service serves the content lifecycle
- **WHEN** a Node service is seeded with synchronized configuration and a
  test-authorized actor creates, saves, and publishes an entry through HTTP
- **THEN** public HTTP reads return the published DTO, while subsequent draft
  changes remain absent from the public response until another publication

#### Scenario: A configured Node service serves an uploaded published image
- **WHEN** a Node service has passed its private bucket startup check and an authorized
  actor uploads media that is referenced by a current published snapshot
- **THEN** the public stable media route serves that verified object while the
  Node composition keeps its object key and object-store credentials private

#### Scenario: A conditional build export reaches the Node boundary
- **WHEN** a client requests the Node build export with the ETag returned for
  the current published-state version
- **THEN** the service returns `304 Not Modified` and does not load the full
  export payload
