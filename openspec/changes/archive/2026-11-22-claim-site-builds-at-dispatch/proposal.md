## Why

After a VPS restart, the site-build dispatcher can reserve several due events and spend the next 60 seconds building only the first. The [pre-1.0 audit, item 3](page://page_422b3a21dfd08191b6efbf905d01ba3b) reproduced two external calls for the second build because its first call ran on an expired lease and its result could not be recorded.

## What Changes

- Claim one build when the production VPS poller is ready to call the builder. Other due builds remain available while that call runs.
- Require the sequential dispatcher to have a current claim at the external call boundary, including when a caller requests a batch and a lease has waited behind another build.
- Exercise the restart case with two distinct due events, a long first build, a controlled clock and the production SQLite repository. Check external calls, durable outcomes and recovery after actual owner loss.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-build-dispatch` — Define when a sequential dispatcher can start an external build under its lease. [Accepted specification](../../../specs/site-build-dispatch/spec.md)

## Impact

This is one pre-1.0 audit correction, independent of the extensibility roadmap sessions. It touches the VPS dispatcher composition, portable site-build dispatcher and their tests. It relies on the existing guarded claim, renewal and completion operations in the Node and D1 repositories. [Architecture §10](../../../../docs/architecture/publication.md) · [Architecture §§15–16](../../../../docs/architecture/runtimes.md) · [Outbox lease contract](../../../specs/outbox-dispatch/spec.md)

The Worker already requests one build per scheduled or post-commit pass. Its invocation budgets and provider tracking remain applicable. Builder-side idempotency across crashes, media dispatch, retry policy, public endpoints and schema migrations are outside this correction.
