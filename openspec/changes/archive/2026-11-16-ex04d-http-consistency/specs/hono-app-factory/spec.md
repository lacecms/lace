## ADDED Requirements

### Requirement: Entry detail tags are issued after authorization
The admin detail route SHALL return the REST draft tag on successful reads
through the existing session or import credential path. Missing, forbidden
and not-found responses SHALL contain the existing sanitized envelope
without a draft tag. The HTTP adapter SHALL resolve the revision from the
existing JSON and header inputs and pass one revision to the application
command. The application and persistence SHALL retain their existing
authorization, atomic concurrency checks and idempotency behavior.

#### Scenario: Import clients and session clients see the same tag
- **WHEN** an authorized import client and an authorized session reader
  each load the same entry revision
- **THEN** both successful reads carry the same draft tag and revision

#### Scenario: An entry is unavailable
- **WHEN** a caller lacks access or an authorized caller requests an
  unknown entry ID
- **THEN** the response uses the existing authentication, authorization or
  not-found outcome without revealing a tag

## MODIFIED Requirements

### Requirement: Versioned build read routes expose persisted history
The HTTP application SHALL expose authenticated `GET /api/v1/admin/site-builds`
and `GET /api/v1/admin/site-builds/:buildId` routes with shared validated
response contracts. History SHALL return cursor pages in descending order of
request time then build ID, under the existing session `content:read`
permission. A missing build SHALL return the standard not-found envelope.
Existing administrator build request and retry routes SHALL remain compatible.

#### Scenario: History request
- **WHEN** an authenticated actor requests the list and follows its
  continuation
- **THEN** the route returns successive bounded newest-first pages of
  validated build records, including records older than the initial page

#### Scenario: Missing detail
- **WHEN** an authenticated actor requests an unknown build ID
- **THEN** the route returns the standard 404 response
