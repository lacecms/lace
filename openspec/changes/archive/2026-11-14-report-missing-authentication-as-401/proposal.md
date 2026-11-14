## Why

The 2026-11-14 owner-requested architecture audit found that the REST API
reports every credential failure as `403 AUTHORIZATION_DENIED`. A missing
session, an expired session, a revoked import token and an editor who lacks
`content:publish` all get the same answer. A client cannot tell "sign in
again" from "you may not do this":

- the admin treats every `403` as a possibly expired session and re-reads the
  session after each permission denial;
- the SDK, CLI import client and doctor probes accept both statuses;
- a future SDK, mobile or third-party client would have to guess.

`align-openapi-contract` documented this behavior and deferred the fix,
because it changes the HTTP contract and the `hono-app-factory` spec. The
change should land before external clients depend on the `403` mapping.

This is not a roadmap session. It is an owner-requested audit follow-up,
delivered as one just-in-time change outside the RF steps.

## What Changes

- **BREAKING (HTTP):** A new transport code `AUTHENTICATION_REQUIRED` maps to
  `401`. A protected REST route returns it before application work when the
  request has no accepted credential or its credential resolves to no active
  actor:
  - a session that is absent, expired, revoked, of a disabled account or with
    an invalid role;
  - an import Bearer that is unknown, expired, revoked, of the wrong kind or
    malformed;
  - a missing or rejected build token on the build export.
- The `401` carries `Cache-Control: no-store` and a `WWW-Authenticate`
  challenge:
  - `Session realm="lace"` on session routes;
  - `Bearer realm="lace"` on the build export;
  - both on routes on the import allowlist.
- `403 AUTHORIZATION_DENIED` stays for:
  - an authenticated actor without the permission;
  - a credential kind the route never accepts: a Bearer on a non-import
    management route, or a session on the import-token description route;
  - a session-only operation reached by a non-session actor;
  - origin, Fetch Metadata and CSRF refusals.
- The classification table, the error-code schema and the OpenAPI document
  gain `401`. Protected operations document `401`. Operations that can refuse
  an authenticated actor also document `403`.
- The admin starts session recovery only on `401`. A `403` stays on screen as
  an error.
- Node and the Worker return identical statuses, messages and challenges.

Non-goals:

- MCP. It already answers OAuth `401` and `403` challenges.
- Better Auth `/api/auth/*` endpoints.
- Changing which requests are refused. Only the status, code and challenge of
  credential failures change.
- Requiring clients to drop `403` handling. The SDK, CLI and loader already
  treat `401` and `403` alike, so older generated projects keep working.
- Fail-closed build export without a configured security port. In production
  both runtimes configure it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authentication-and-actor-boundary`: adds a requirement separating
  authentication failures (`401`) from authorization denials (`403`). Updates
  the disabled-account and import-credential requirements to `401`.
- `rest-contracts`: the classification table gains `401
  AUTHENTICATION_REQUIRED`, and the pinned matrix records the change.
- `hono-app-factory`: an unauthenticated admin content request returns `401`.
  The generated OpenAPI documents `401` and `403` separately.
- `admin-remote-state-and-lists`: only `401` starts session recovery.

## Impact

- `packages/contracts`:
  - `errorCodeSchema` gains `AUTHENTICATION_REQUIRED`;
  - the classifier maps it to `401` and exposes the error's challenge header.
- `packages/auth`: session and import actor resolvers distinguish origin and
  Fetch Metadata refusals from credentials that do not resolve, preserving the
  existing trusted-origin and no-fallback rules.
- `packages/server`:
  - `shared/http.ts` gets a new `AuthenticationRequiredError`;
  - every throw site moves to it or deliberately keeps `AuthorizationError`:
    `composition/actor-context.ts`, `composition/capabilities.ts` (session
    summary), the import-token middleware in `app/create-app.ts`, the
    import-token description in `routes/credentials.ts` and the build export
    in `routes/public.ts`;
  - `shared/openapi.ts` helpers;
  - the regenerated `openapi.json`.
- `apps/admin`: `isSessionExpiredError` accepts only `401`.
- Tests:
  - the server error matrix;
  - route tests asserting `403` for missing credentials;
  - the OpenAPI contract test;
  - Node and Worker HTTP fixtures;
  - admin session-recovery tests.
- Root and journey probes that assert `403` for anonymous requests:
  `tests/security-boundary.test.mjs`, `scripts/cross-runtime-browser.mjs`,
  `scripts/journeys/consumer-security-probes.mjs`.
- Docs:
  - the `apps/docs` API reference, which currently says the REST API never
    answers `401`;
  - the authorization boundaries in `docs/architecture/api.md`, which gain a
    `401`/`403` rule.
- No schema, migration or runtime-delta change.
