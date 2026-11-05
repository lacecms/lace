## ADDED Requirements

### Requirement: Setup outcomes share one ambiguous response
Every setup submission outcome that depends on installation state SHALL
answer with the same `404 NOT_FOUND` envelope, so an unauthenticated client
cannot distinguish them. These outcomes are:

- an unknown, expired, consumed or foreign-email setup token;
- setup that is already complete;
- setup that is unavailable.

The persistence adapters SHALL raise these outcomes as typed account failures
with the not-found code, on Node and Cloudflare, and the server SHALL map them
through the shared classifier.

An unexpected failure during setup, such as an unavailable database, SHALL
NOT be presented as one of these outcomes. It SHALL return `500
INTERNAL_ERROR` with the generic message. An inconsistent stored setup state
SHALL be an internal invariant failure.

#### Scenario: A completed installation stays ambiguous
- **WHEN** a client submits setup after another client completed it
- **THEN** the API returns the same `404` envelope as for an unknown token,
  and no user is created

#### Scenario: A database outage is not reported as a bad token
- **WHEN** the database is unavailable while a setup submission runs
- **THEN** the API returns `500 INTERNAL_ERROR`, and the admin shows its
  existing sanitized server-failure state instead of token guidance
