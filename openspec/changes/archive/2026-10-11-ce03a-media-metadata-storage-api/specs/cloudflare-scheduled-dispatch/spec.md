## MODIFIED Requirements

### Requirement: Post-commit dispatch is best-effort only
After a successful publication, unpublication, entry deletion, media deletion
or deletion retry, media metadata update, or build request or retry, the Worker
SHALL register a best-effort `waitUntil` dispatch pass that may reduce latency.
That pass SHALL swallow and log its own failures, SHALL NOT change the
already-committed response, and SHALL NOT be the only recovery path: an event
it fails to process remains recoverable by scheduled dispatch.

#### Scenario: waitUntil dispatch fails
- **WHEN** the post-commit dispatch pass throws or exhausts its query budget
- **THEN** the client response is unchanged and the event is processed by a
  later scheduled invocation

#### Scenario: Requests that may queue builds trigger a pass
- **WHEN** an unpublication or a metadata update of media used by a
  publication succeeds on the Worker
- **THEN** the Worker registers the post-commit dispatch pass for that request
