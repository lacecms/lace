# ADR 0032: Share durable outbox contracts through a dedicated subpath

- Status: Accepted
- Date: 2026-11-16
- Governing architecture: [section 6](../architecture/workspace.md#6-repository-structure)

`application` and `db` share durable event identities and versioned payload
schemas through `@lacecms/contracts/outbox`. The boundary checker allows
exactly that subpath for these consumers. The entry uses portable validation
and is independent of REST and MCP DTOs and application code. This extends
the dependency graph in [ADR 0001](0001-package-dependency-boundaries.md).

A registry in `application` would place durable storage schema alongside use
cases. A new workspace package would add a published artifact for two
schemas. The dedicated subpath lets write plans validate and atomically
enqueue events while the application resolves handlers and each runtime
retains its existing transaction and lease protocols.
