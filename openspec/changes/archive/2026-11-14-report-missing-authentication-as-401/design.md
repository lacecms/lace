## Context

See proposal.md for the motivation. Current state:

- `packages/server/src/shared/http.ts` defines `AuthorizationError`
  (`AUTHORIZATION_DENIED`). The shared classifier
  (`packages/contracts/src/errors/classification.ts`) maps it to `403`.
  `TransportErrorCode`, `errorCodeSchema` and the error matrix tests list
  every transport code.
- Server throw sites of `AuthorizationError`:

  | Site | Cause | Target |
  | --- | --- | --- |
  | `composition/actor-context.ts` `actor()` | no session actor resolved | `401` |
  | `app/create-app.ts` import middleware: Bearer on a non-allowlisted route, or `importActors` undefined | credential kind refused | `403` |
  | `app/create-app.ts` import middleware: `resolve()` returned `null` | import credential unresolvable | `401` |
  | `composition/capabilities.ts` `sessionSummary`: profile missing or disabled | session no longer identifies an active account | `401` |
  | `composition/capabilities.ts` `requireSecurity` and `accounts()` without security | composition without security (tests) | `403` (unchanged) |
  | `routes/credentials.ts`: import-token description without an import token | wrong kind, or no credential | `403`; `401` when no actor resolves |
  | `routes/accounts.ts`: foreign `Origin` on revoke | origin rule | `403` |
  | `routes/public.ts` build export: missing or invalid bearer | build token unresolvable | `401` |

- Domain and application `AUTHORIZATION_DENIED` failures always come from a
  resolved actor and stay `403`. This includes `oauth.ts` "A browser session
  is required".
- `apps/admin/src/shared/api/admin-client.ts` `isSessionExpiredError` accepts
  `401 || 403`. `useSessionRecovery` re-reads the session before redirecting.
- The SDK (`LaceHttpError` with tolerant `ReportedLaceErrorCode`), the CLI
  import client, the doctor probes and the published-site loader already
  treat `401` like `403`.

## Goals / Non-Goals

**Goals:**

- One error class and one classifier mapping for authentication failures,
  identical on Node and the Worker, because both serve the same Hono app.
- The challenge header is chosen where the accepted credentials are known,
  never by path regex inside the classifier.

**Non-Goals:**

- Moving authorization out of routes into use cases (audit wave 2).
- Changing which requests succeed.

## Decisions

### D1. `AuthenticationRequiredError` lives in `@lacecms/contracts`

`packages/contracts/src/errors/authentication.ts` exports
`AuthenticationRequiredError extends LaceError<"AUTHENTICATION_REQUIRED">`
with `readonly challenge: "bearer" | "session" | "session-or-bearer"`.

Contracts owns the classifier. The `expose` hook needs an `instanceof` check,
in the same way `RateLimitExceededError` is checked from `@lacecms/domain`.
Domain is the wrong home: authentication is a transport concern, and domain
codes describe actors that already exist.

The classifier entry:

```ts
AUTHENTICATION_REQUIRED: {
  status: 401,
  message: "Authentication is required.",
  expose: (error) => ({ headers: { "cache-control": "no-store",
    "www-authenticate": challengeHeader(error) } }),
}
```

`challengeHeader` maps the three challenge values:

- `session` → `Session realm="lace"`;
- `bearer` → `Bearer realm="lace"`;
- `session-or-bearer` → `Session realm="lace", Bearer realm="lace"`.

`errorCodeSchema` and `TransportErrorCode` gain the code. The message does
not say which check failed.

Alternative rejected: a server middleware that rewrites `403` to `401` when
`lace.actor` is unset. It would also rewrite origin and CSRF denials, and it
hides the decision from the throw sites.

### D2. Challenge selection at the throw sites

- `actor()` throws with `session-or-bearer` when `isImportRoute(method,
  path)` holds for the request, and with `session` otherwise. Import routes
  that reach `actor()` without a Bearer header are session requests that
  could also have used a token.
- The import middleware throws `session-or-bearer` when the presented
  credential does not resolve.
- The build export throws `bearer`.
- `sessionSummary` throws `session`.

### D2a. Preserve origin and Fetch Metadata denials at actor resolution

The session and import actor resolvers currently return `null` both for a
credential that does not resolve and for an unsafe request refused by their
origin checks. Replacing every `null` with `401` would change an existing
origin or Fetch Metadata refusal from `403` to `401`.

Make the resolver boundary distinguish a request refused by those checks from
an unresolved credential. The shared server maps the former to
`403 AUTHORIZATION_DENIED` and the latter to `401 AUTHENTICATION_REQUIRED`
with the route's challenge. Preserve the existing trusted-origin rules,
including development loopback aliases, and the import resolver's current
Fetch Metadata behavior. Apply the distinction before actor-keyed rate
limiting and do not fall back from a rejected import Bearer to a session.
Test the decisions on both Node and Cloudflare, including foreign origins,
origin-less cross-site session mutations, invalid credentials, and unchanged
protected state.

### D3. Import-token description route ordering

The route resolves the actor first. No credential then gives `401`. A
resolved session actor without `lace.importToken` gives `403`. Today the
`403` check runs first, so an anonymous call would otherwise still get `403`.

### D4. Unchanged `403` sites stay explicit

Each kept `AuthorizationError` site gets a one-line comment naming why it is
a denial rather than a missing credential. The error-matrix test pins both
classes.

### D5. OpenAPI

`shared/openapi.ts` gains `authenticationFailure()`, a `401` envelope
response, and `authorizationFailure()` loses the "no Lace error maps to 401"
wording:

- every operation whose `security` is not `security.none` spreads
  `authenticationFailure()`;
- operations that can refuse an authenticated actor keep
  `authorizationFailure()`.

The OpenAPI contract test (`routes/openapi-contract.test.ts`) changes its
rule from "no `401`" to two checks:

- every credentialed operation documents `401`;
- no public operation documents `401` or `403`.

The checked-in `openapi.json` is regenerated.

### D6. Admin recovery

`isSessionExpiredError` returns `error.status === 401`. `403` handling falls
through to each query's existing error state. No new UI is needed: access
denied states already exist for role-gated screens.

### D7. Compatibility

Older SDK and loader builds accept the new code through
`ReportedLaceErrorCode` and map `401` to `rejected_token`. Older CLI import
clients already treat `401` like `403`. Generated projects need no upgrade
step, so `create-lace` upgrade fixtures stay unchanged.

## Risks / Trade-offs

- [A third-party client relied on `403` for "sign in"] → The change is marked
  BREAKING and the API reference states the new mapping. Every first-party
  client already accepts both statuses.
- [A missed throw site keeps returning `403` for a missing credential] → Node
  and Worker fixture tests probe one route of each credential class without
  credentials and assert `401`. The error matrix pins the new code.
- [`WWW-Authenticate: Session` is a non-registered scheme] → It is allowed by
  RFC 9110 syntax. Browsers ignore unknown schemes and show no dialog.

## Migration Plan

Code and contract change only. Deploy server and admin together, as they are
already shipped together. To roll back, revert the change.
