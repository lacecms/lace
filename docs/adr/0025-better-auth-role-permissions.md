# ADR 0025: Better Auth with role-mapped permissions

- Status: Accepted
- Date: 2026-11-08
- Governing architecture: [section 14](../architecture/security.md#14-authentication-and-authorization)

This record states a decision taken with the MVP baseline. It was previously
listed in architecture §24 and is recorded here retroactively.

## Context

Lace needs session authentication for a small editorial team on both runtimes,
and an authorization model simple enough to audit.

## Decision

- Better Auth provides email/password authentication and sessions.
- Authorization uses three roles, `admin`, `editor` and `viewer`, each mapped
  to a fixed set of permissions; use cases check permissions, not roles.
- Only `admin` holds `content:publish` by default.

## Consequences

- No per-entry or per-collection access control lists.
- Delegated clients (import tokens, MCP) receive scopes that are subsets of
  these permissions ([ADR 0015](0015-mcp-publication-scope.md),
  [ADR 0016](0016-import-credentials.md)).

## Alternatives considered

- **Custom authentication.** Rejected: password, session and token handling
  are security-critical and already solved by the library on both runtimes.
- **Configurable roles.** Rejected for the MVP: harder to reason about than a
  fixed mapping.
