# ADR 0023: Admin single-page application stack

- Status: Accepted
- Date: 2026-11-08
- Governing architecture: [section 17](../architecture/admin.md#17-admin-application)

This record states a decision taken with the MVP baseline. It was previously
listed in architecture §24 and is recorded here retroactively.

## Context

The admin is a credentialed client of the REST API that must be served as
static assets from either runtime, with no server rendering of its own.

## Decision

- The admin is a React single-page application built with Vite.
- TanStack Router owns routing and TanStack Query owns all server state; the
  admin reaches the API only through its own transport client.
- Component source is governed by
  [ADR 0005](0005-admin-owned-component-source.md); the layer order
  (`app → pages → widgets → features → entities → shared`) is stated in
  [architecture §17](../architecture/admin.md#17-admin-application).

## Consequences

- The admin depends on contracts and content metadata, never on database
  schemas or runtime packages.
- The same build is deployed with the Worker assets and the Node server.

## Alternatives considered

- **A server-rendered admin framework.** Rejected: it would add a second
  server runtime beside the API on both platforms.
