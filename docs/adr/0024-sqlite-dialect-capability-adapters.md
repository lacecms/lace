# ADR 0024: One SQLite dialect with capability adapters

- Status: Accepted
- Date: 2026-11-08
- Governing architecture: [section 4.5](../architecture/README.md#45-portable-capabilities-explicit-adapters),
  [section 15](../architecture/runtimes.md#15-infrastructure-ports) and
  [section 16](../architecture/runtimes.md#16-database-portability-and-d1-constraints)

This record states a decision taken with the MVP baseline. It was previously
listed in architecture §24 and is recorded here retroactively.

## Context

Lace runs on Cloudflare (Worker, D1, R2, KV) and on a VPS (Node, SQLite,
MinIO). Domain behavior must be identical on both, while each platform keeps
its native services.

## Decision

- Drizzle uses the SQLite dialect for both Cloudflare D1 and Node SQLite; no
  other database dialect is supported.
- Node uses SQLite and MinIO; Cloudflare uses D1 and R2.
- Domain and application code depend on narrow capability ports (repositories,
  object storage, cache, build trigger, dispatch, email, clock, ids);
  platform packages implement them. Lace adds no custom abstraction over
  Hono, Drizzle, React or every Web API.
- Transaction strategy per runtime is governed by
  [ADR 0002](0002-d1-batches-and-node-transactions.md).

## Consequences

- Schema and queries stay within the SQL subset both engines support, and the
  D1 free-plan limits shape the data model.
- Shared repository contract tests run against both adapters.

## Alternatives considered

- **PostgreSQL on the VPS.** Rejected: two dialects for one model doubles
  migrations and contract surface.
- **An S3 client for R2.** Rejected: the native binding is the Worker's
  supported path; MinIO keeps its own adapter.
