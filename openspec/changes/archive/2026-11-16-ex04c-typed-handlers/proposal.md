## Why

[EX4C — Typed handlers](../../../../docs/extensibility-roadmap.md#session-ex4c--typed-handlers)
follows the archived [EX4B security use cases](../2026-11-16-ex04b-security-use-cases/).
The versioned routes validate requests at runtime, but the untyped validation
hook, handler casts and erased router return types stop TypeScript from
checking the whole path from the REST contract to the Hono client.

## What Changes

- Type `validationHook` against Standard Schema and infer handler inputs from
  the existing validators. Pass validated values through the existing
  application and domain boundaries without route-level escape casts.
- Preserve response body and literal status types through the shared response
  helpers, individual registrations and the mounted `/api/v1` app. A Hono
  client can infer the versioned product routes from
  `ReturnType<typeof createLaceApp>`.
- Clear the roadmap's route cast baseline: zero production `as never` casts
  in `packages/server/src/routes` or in the shared validation hook.
- Keep HTTP requests, responses, failure ordering, route availability and
  generated OpenAPI identical on Node and Cloudflare. EX4D owns pagination,
  ETag and precondition changes; migrating Admin, SDK or CLI clients to Hono
  RPC and reworking the MCP or Better Auth protocols are out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a behavior-preserving change and uses `skip_specs: true`.
The accepted [Hono app factory](../../../specs/hono-app-factory/spec.md),
[REST contracts](../../../specs/rest-contracts/spec.md) and
[authentication and actor boundary](../../../specs/authentication-and-actor-boundary/spec.md)
remain the acceptance baseline.

## Impact

The work is centered in `@lacecms/server`: shared HTTP and OpenAPI helpers,
versioned route modules, app composition and type tests. It retains the
package direction in [architecture §6](../../../../docs/architecture/workspace.md#6-repository-structure),
the runtime contracts and v1 mount in [§12](../../../../docs/architecture/api.md#12-rest-api)
and EX4B's authorization boundary in
[§14](../../../../docs/architecture/security.md#14-authentication-and-authorization).
The existing factory gains an inferred TypeScript return type; package
entry points and runtime exports stay the same. Both runtimes keep their
current composition inputs. There is no migration or new dependency.
