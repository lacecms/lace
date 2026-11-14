## Why

The 2026-11-14 owner-requested architecture audit found that the generated
OpenAPI document (`apps/api/openapi/api-v1.json`, served at
`/api/v1/openapi.json`) describes HTTP behavior the server does not have. The
mismatches:

- **Validation errors.** 36 operations advertise hono-openapi's default `400
  "Validation Error"` body `{success,error,data}`. The server answers
  validation failures with `422 VALIDATION_FAILED` in the shared
  `{error:{code,message,details}}` envelope (ADR 0019).
- **Untyped responses.** Three operations have no route description:
  - `POST /admin/api-tokens` is documented as an untyped `200`, but it returns
    `201` with the token secret;
  - `PATCH /admin/users/{userId}`;
  - `POST /setup/admin`.
- **Missing query parameters.** Public collection, record and by-path reads do
  not document `after`, `limit` or `path`.
- **Wrong denial status.** Seven operations document `401 "Session
  required"`. The server returns `403 AUTHORIZATION_DENIED` for a missing
  session.
- **No security schemes.** The document declares none, so a reader cannot
  tell which credential an operation accepts.

ADR 0022 and architecture §12 require OpenAPI generated from the same
contracts the server enforces. Clients generated from today's document for
other frontends or mobile apps would mishandle every validation failure.

## What Changes

- Turn off hono-openapi's default validation response. Every operation that
  validates input documents `422` with a shared `ErrorEnvelope` component.
- Every product operation carries a route description with its real success
  status and response schema.
- Document query parameters that are parsed by hand, without changing how
  they are parsed.
- Document missing or invalid sessions and credentials as `403` with the
  envelope. This matches current behavior.
- Declare security schemes for the session cookie, build tokens and import
  tokens. Annotate each operation with the credentials it accepts.
- Add a server test that fails when the generated document drifts from these
  rules, then regenerate the committed artifact.

The documentation changes. Runtime behavior does not. Not **BREAKING** for
HTTP clients. A client generated from the old document changes its error
types.

## Non-goals

- Introducing `401 AUTHENTICATION_REQUIRED`. That changes runtime behavior and
  `hono-app-factory` ("the shared authorization error"), and needs its own
  change.
- Removing the `validationHook` `as never` cast and the handler input casts.
- Making the build export fail closed when build-token verification is not
  wired.
- Moving routes to per-version sub-apps or route metadata.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hono-app-factory`: the generated OpenAPI document must match the enforced
  status codes, error envelope, parameters and credentials of every product
  operation, and a test must guard it.

## Impact

This change comes from the owner-requested audit and sits outside the RF
roadmap, so it has no roadmap step or session. It does not depend on
`harden-persistence-hygiene`; the two can be applied in either order.
Architecture §12 and §14 apply, along with ADR 0019, ADR 0022 and ADR 0016.

Affected code:

- `packages/server`: the docs route, the route descriptions and a new test.
- `packages/contracts`: an OpenAPI component for the error envelope, if it is
  not already exported.
- `apps/api/openapi/api-v1.json`: regenerated.

Documentation: `apps/docs` API reference, only where it repeats a status
code. No database, runtime adapter, SDK or admin change.
