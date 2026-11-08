# ADR 0022: Hono REST API with Valibot schemas

- Status: Accepted
- Date: 2026-11-08
- Governing architecture: [section 12](../architecture/api.md#12-rest-api) and
  [section 19](../architecture/workspace.md#19-dependency-policy)

This record states a decision taken with the MVP baseline. It was previously
listed in architecture §24 and is recorded here retroactively.

## Context

The same API must run in a Cloudflare Worker and a Node server, and its
contracts are shared by the admin, the SDK, the CLI and MCP. One schema must
validate configuration, content, blocks, transport and forms without drifting
between runtimes or documentation.

## Decision

- Hono exposes a versioned REST API (`/api/v1`) on both runtimes.
- Valibot is the canonical runtime schema library for REST contracts,
  configuration, content, blocks and admin forms.
- Hono validates requests through Standard Schema, and the OpenAPI document is
  derived from the same Valibot schemas through Valibot's JSON Schema
  conversion; it is checked in and compared in CI.

## Consequences

- Transport DTOs live in `@lacecms/contracts` and are reused by every client.
- Documentation cannot describe a shape the validator does not enforce.
- Schema features that do not convert to JSON Schema need explicit handling.

## Alternatives considered

- **Zod or a second schema library for forms.** Rejected: two schema sources
  for one contract drift.
- **Hand-written OpenAPI.** Rejected: unverifiable against the validators.
