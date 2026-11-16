## ADDED Requirements

### Requirement: Operational list ports return bounded authorized pages
Application list operations for users, invitations, build history and OAuth
connections SHALL consume a numeric limit and optional opaque continuation
and return a bounded page. These operations SHALL enforce their existing
session and permission checks before protected reads. The OAuth owner SHALL
come from the current session actor, and persistence SHALL scope every
connection page to that owner. User totals SHALL use the same account
population and read snapshot as the user page.

Persistence SHALL apply eligibility and a deterministic keyset boundary
before the page limit. Users SHALL sort by email ascending and ID ascending.
Invitations SHALL include unaccepted, unrevoked rows, including expired
ones, in descending creation time and ID. Builds SHALL sort by request time
and ID descending. Connections SHALL retain ascending creation time and ID.
Traversals SHALL read current records with each request. With static data,
each eligible record SHALL appear exactly once, including rows with equal
timestamps. The next cursor SHALL use the last returned row's boundary.

#### Scenario: Direct callers must have session permission
- **WHEN** a direct application caller uses a delegated actor, or an actor
  without `users:manage` requests a user or invitation page
- **THEN** it returns the existing denial before reading the port

#### Scenario: Timestamp ties cross a page boundary
- **WHEN** three qualifying rows share a timestamp and the requested page
  size is one
- **THEN** both runtimes traverse them once in the endpoint's specified
  ID direction

#### Scenario: A processed invitation is absent from the next page
- **WHEN** an invitation is accepted or revoked after the first page
  and before a subsequent request that would otherwise include it
- **THEN** it is excluded and the continuation traverses the remaining
  qualifying older invitations

#### Scenario: Connection ownership is enforced on every page
- **WHEN** two owners have connections at interleaved timestamps and one
  owner follows a continuation returned to that owner
- **THEN** every page contains only that owner's connections
