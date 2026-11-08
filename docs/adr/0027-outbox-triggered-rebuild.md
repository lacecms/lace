# ADR 0027: Publication through an outbox-triggered rebuild

- Status: Accepted
- Date: 2026-11-08
- Governing architecture: [section 9.8](../architecture/data-model.md#98-outbox-and-site-builds) and
  [section 10](../architecture/publication.md#10-content-publication)

This record states a decision taken with the MVP baseline. It was previously
listed in architecture §24 and is recorded here retroactively.

## Context

The public site is static ([ADR 0021](0021-single-site-static-architecture.md)),
so publication is only visible after a rebuild. Calling a build hook inside the
publication request would lose the trigger on a crash or provider outage.

## Decision

Publishing writes an outbox event in the same atomic mutation as the
publication. A dispatcher claims events with leases and triggers the static
rebuild through the runtime's build-trigger port (deploy hook on Cloudflare,
the fixed-command builder on Node, [ADR 0004](0004-fixed-command-vps-builder.md)),
retrying until it succeeds or the event is exhausted.

## Consequences

- A committed publication always eventually requests a build.
- Build state is tracked separately from content state.
- Recovery runs on a schedule on both runtimes.

## Alternatives considered

- **Synchronous build trigger in the request.** Rejected: loses work on
  failure and couples publication latency to the build provider.
