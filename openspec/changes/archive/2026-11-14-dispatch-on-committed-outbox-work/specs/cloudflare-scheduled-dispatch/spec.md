## MODIFIED Requirements

### Requirement: Post-commit dispatch is best-effort only
The Worker SHALL register one best-effort `waitUntil` dispatch pass for a
request exactly when that request committed outbox work: at least one
committed statement inserted a `site.build.requested` or
`media.delete.requested` event, or coalesced a new request into a pending
`site.build.requested` event. The trigger SHALL NOT depend on the request
method, path or transport, so admin REST, import-token REST, MCP tool calls,
setup and configuration synchronization behave alike. A request that committed
no outbox work, including an idempotent replay, a rejected or conflicting
mutation and a metadata update of media that no publication uses, SHALL NOT
register a pass. A request that queued several events SHALL register one pass.
Scheduled invocations SHALL NOT register a post-commit pass.

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

#### Scenario: MCP publication triggers a pass
- **WHEN** an MCP client with `content:publish` calls `publish_entry` and the
  publication commits on the Worker
- **THEN** the Worker registers exactly one post-commit dispatch pass for that
  `POST /mcp` request

#### Scenario: Media deletion triggers a pass
- **WHEN** a deletion or a deletion retry of unreferenced media is accepted on
  the Worker
- **THEN** the Worker registers the post-commit dispatch pass for that request

#### Scenario: Nothing queued, no pass
- **WHEN** a publication request replays a stored idempotency result, or a
  metadata update succeeds for media that no publication uses
- **THEN** the response is unchanged and the Worker registers no post-commit
  dispatch pass

#### Scenario: Failed mutation registers no pass
- **WHEN** a publication fails with `CONTENT_REVISION_CONFLICT` and its batch
  commits no statement
- **THEN** the Worker registers no post-commit dispatch pass

#### Scenario: Concurrent requests are attributed separately
- **WHEN** a publication and a read-only request run concurrently in one
  Worker isolate
- **THEN** only the publication request registers a post-commit dispatch pass
