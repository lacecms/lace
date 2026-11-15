## Why

In roadmap session EX6A, the application loses its trusted client address when
Hono buffers a streamed body and replaces the request. Lace's client-scoped
limits and Better Auth sign-in can then charge separate clients to the same
fallback identity.

## What Changes

- Preserve the ingress-resolved client address for the lifetime of the HTTP
  request on Node and Cloudflare, including after body processing.
- Use the same address for Lace client-scoped limits and Better Auth sign-in.
  Preserve actor-scoped limits, input validation, the body-size limit and the
  existing conservative fallback.
- Verify trusted ingress, independent client budgets, caller-supplied forwarding
  headers, missing identity and oversized requests through runtime entry points.
- Keep proxy trust configuration, OAuth policy, the provider route allowlist,
  persistence and production Compose topology outside this session.

## Capabilities

### New Capabilities

### Modified Capabilities

- `bootstrap-user-token-abuse-controls` requires the same trusted identity
  throughout body processing and defines parity scenarios for both limiters.

## Impact

The change affects the shared Hono application, Node and Worker composition,
and the Better Auth adapter. Architecture §14 and auth operations guidance
record the request-lifetime rule. EX6A has no implementation dependencies.
EX4A should retain its regression coverage.

[Roadmap EX6A](../../../docs/extensibility-roadmap.md#session-ex6a--preserve-trusted-client-identity-through-body-handling) ·
[Architecture §14](../../../docs/architecture/security.md) ·
[Accepted abuse controls](../../specs/bootstrap-user-token-abuse-controls/spec.md)
