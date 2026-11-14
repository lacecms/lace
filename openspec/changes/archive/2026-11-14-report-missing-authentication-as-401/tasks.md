## 1. Contract and classifier

- [x] 1.1 Add `AuthenticationRequiredError` with its `challenge` in
  `packages/contracts/src/errors/authentication.ts`. Add
  `AUTHENTICATION_REQUIRED` to `errorCodeSchema` and `TransportErrorCode`.
  Map it in the classifier to `401` with the sanitized message,
  `Cache-Control: no-store` and the `WWW-Authenticate` value for each
  challenge. Verify: `classification.test.ts` covers the three challenges.
  The contracts and test-utils error-matrix tests pin the new row and fail
  when it is removed.

## 2. Server throw sites

- [x] 2.0 Distinguish origin and Fetch Metadata refusals from unresolved
  credentials at the session and import actor resolver boundaries. Preserve
  existing trusted-origin and development loopback behavior, import Fetch
  Metadata behavior and the no-fallback rule. Map request-shape refusals to
  `403 AUTHORIZATION_DENIED` before actor-keyed rate limiting; map unresolved
  credentials to `401 AUTHENTICATION_REQUIRED`. Verify on Node and Cloudflare
  that foreign-origin and origin-less cross-site session mutations retain
  `403`, invalid credentials receive `401`, and protected state is unchanged.
- [x] 2.1 Make `actor()` in `composition/actor-context.ts` throw
  `AuthenticationRequiredError`: `session-or-bearer` on import-allowlisted
  routes, `session` elsewhere. Do the same for `sessionSummary` in
  `composition/capabilities.ts` with `session`. Verify: server route tests
  assert `401` and the challenge for these anonymous requests:
  - an admin entry read;
  - `GET /api/v1/admin/session`;
  - `GET /api/v1/account/sessions`;
  - an allowlisted import route.

  A viewer publishing still gets `403`.
- [x] 2.2 In the import middleware of `app/create-app.ts`, throw
  `AuthenticationRequiredError("session-or-bearer")` for an unresolved
  credential. Keep `AuthorizationError` with a reason comment for a Bearer
  outside the allowlist. Verify:
  - `import-routes.test.ts` gets `401` for unknown, expired, revoked and
    wrong-kind tokens, and for a disabled creator;
  - it gets `403` for a valid token on `/api/v1/admin/users`;
  - a valid cookie plus an invalid Bearer gets `401` without using the
    session.
- [x] 2.3 Reorder the import-token description route so that the actor
  resolves first. Make the build export throw
  `AuthenticationRequiredError("bearer")` for a missing, malformed or
  rejected token. Add reason comments to the kept `403` sites in
  `capabilities.ts` and `routes/accounts.ts`. Verify:
  - the credentials route tests get `401` with no credential and `403` with
    a session only;
  - `public.test.ts` gets `401` with `WWW-Authenticate: Bearer realm="lace"`
    for each build-export failure;
  - the foreign-origin revoke still gets `403`.
- [x] 2.4 Update the other server and runtime tests that assert `403` for
  anonymous requests:
  - `protocol`, `setup-session`, `media`, `content` and `builds` route tests;
  - `packages/platform-node/src/index.test.ts`;
  - `platform-cloudflare/src/worker.test.ts`;
  - `apps/api/src/server/node-server.test.ts`.

  Permission denials keep `403`. Verify: `pnpm --filter @lacecms/server
  test` and the platform package tests pass.

## 3. OpenAPI

- [x] 3.1 Add `authenticationFailure()` to `shared/openapi.ts` and fix the
  `authorizationFailure()` wording:
  - spread `authenticationFailure()` into every operation whose `security`
    is not `none`;
  - keep `authorizationFailure()` only where an authenticated actor can be
    refused.

  Update `openapi-contract.test.ts`: credentialed operations document `401`,
  and public operations document neither `401` nor `403`. Verify: the
  contract test passes. Temporarily removing one `authenticationFailure()`
  makes it fail and name the route; revert after checking.
- [x] 3.2 Regenerate the artifact with `pnpm build` and `pnpm
  openapi:generate`. Verify:
  - `pnpm openapi:check` passes;
  - the diff shows `401` on credentialed operations only.

## 4. Admin and clients

- [x] 4.1 Make `isSessionExpiredError` accept only `401`. Verify: admin
  session-recovery tests show
  - a `401` save redirects to login with the leave confirmation intact;
  - a `403` keeps the screen and makes no session re-read.
- [x] 4.2 Update the root and journey probes that expect `403` for anonymous
  or invalid-credential requests:
  - `tests/security-boundary.test.mjs`;
  - `scripts/cross-runtime-browser.mjs`;
  - `scripts/journeys/consumer-security-probes.mjs`;
  - `scripts/fixtures/oauth-mcp` REST assertions.

  Foreign-origin and permission probes keep `403`. Verify:
  - the root security-boundary test passes;
  - `pnpm verify:security` passes where the environment allows.

## 5. Documentation and gates

- [x] 5.1 Update the error and credential paragraph of the `apps/docs` API
  reference (`reference/api.md`): `401 AUTHENTICATION_REQUIRED` with its
  challenges, and `403` for permission. Add the `401`/`403` rule below the
  authorization-boundaries table in `docs/architecture/api.md`. Verify:
  - `pnpm docs:check` passes;
  - the architecture document tests pass.
- [x] 5.2 Run the root gates: `pnpm typecheck`, `pnpm lint`, `pnpm
  format:check` and `pnpm exec openspec validate
  report-missing-authentication-as-401 --type change --strict`. Verify: all
  succeed.
