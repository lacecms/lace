# Authentication and authorization

Part of the [Lace architecture](README.md).

## 14. Authentication and authorization

Better Auth provides sign-in, sessions, account records and password hashing
([ADR 0025](../adr/0025-better-auth-role-permissions.md)). Its Drizzle SQLite schema is managed alongside the application
schema. Invitations, password resets and account self-service are Lace routes
over the same tables. Domain and application code receive an `Actor` value
from the auth adapter and never import Better Auth session types. The security
tables appear in the [data model](data-model.md) table diagram (§9.10).

### Roles and permissions

Roles are global to the installation. The role is a validated field on the
Better Auth user record and defaults to `viewer`. Authorization is
permission-based internally over the roles `admin`, `editor` and `viewer`:

| Permission | Admin | Editor | Viewer |
| --- | ---: | ---: | ---: |
| `content:read` | yes | yes | yes |
| `content:write`, `media:write` | yes | yes | no |
| `content:publish`, `users:manage`, `settings:manage` | yes | no | no |

Handlers check permissions; code never compares role strings to authorize.
`GET /api/v1/admin/session` returns the permission list computed on the server
by `permissionsFor(role)`, the function that also backs `hasPermission`. The
admin decides every guard and affordance through one `can(session,
permission)` check over that list and uses the role only for presentation; a
repository test fails when admin source compares it with role names
([authentication-and-actor-boundary](../../openspec/specs/authentication-and-actor-boundary/spec.md),
[admin-application-shell](../../openspec/specs/admin-application-shell/spec.md)).

### Accounts and the first administrator

Public sign-up is disabled. Only the bootstrap flow creates an account
directly; every other account is created when its invitee accepts an
invitation from an administrator with `users:manage`, who also changes roles.
No administrator ever chooses another person's password, and there is no
hard-coded default password.

The first administrator comes from a one-time setup token, so the flow is the
same against local Node and remote Cloudflare: `lace auth bootstrap` prints it
once and stores only its hash and expiry. `POST /api/v1/setup/admin` claims the
token atomically for a hash of the email, creates the admin, completes the
`installation_state` singleton and consumes every outstanding token; a retry
with the same token and email resumes, and the endpoint returns `404` after
completion. This guarded protocol avoids assuming that Better Auth user
creation can join a D1 transaction
([ADR 0002](../adr/0002-d1-batches-and-node-transactions.md),
[bootstrap-user-token-abuse-controls](../../openspec/specs/bootstrap-user-token-abuse-controls/spec.md)).

### Credentials

- Setup and API tokens are 32 cryptographically random bytes encoded as
  base64url; invitation and reset tokens are also 32 random bytes. Lace stores
  only SHA-256 digests, which suffice because the tokens have high entropy,
  compares them in constant time and shows a plaintext token only once.
- Human passwords stay wholly inside Better Auth's password hashing; Lace
  routes call its `hashPassword`/`verifyPassword`, so provider sign-in keeps
  working.
- `api_tokens` holds automation credentials apart from human users. Build and
  import tokens share it and every verifier filters by kind. A build token
  carries exactly `content:build:read` and authenticates only the build
  export. An import token carries `content:import`, optionally with
  `content:publish` ([ADR 0016](../adr/0016-import-credentials.md)).
- An import token lives 1 to 7 days and is issued with `settings:manage`;
  publication is granted only when the creator holds `content:publish`.
  `Authorization: Bearer` below `/api/v1/admin/` or `/api/v1/account/` is an
  import request: it never falls back to a session cookie, is accepted only on
  a literal route allowlist
  ([hono-app-factory](../../openspec/specs/hono-app-factory/spec.md)), and
  resolves the creator's current enabled account attenuated to content and
  media writing (plus publication). An explicit untrusted `Origin` is refused.
  The creator's account-security events revoke their import tokens, and
  re-enabling does not restore them.

### Invitations, resets and self-service

Invitations and password resets use Lace-owned tokens rather than the
provider's reset flow, so Node and D1 share one lifecycle and an administrator
can receive a link once when email is not delivered. Acceptance is atomic (one
`better-sqlite3` transaction on Node, one guarded D1 batch on Cloudflare), so
concurrent acceptances create exactly one account. Links carry the token in
the URL fragment (`/admin/accept-invite#token=…`, `/admin/reset-password#token=…`),
which keeps it out of server logs and `Referer`. A reset request never reveals
whether an account exists, and confirming a reset deletes every session of the
account. Users manage their own name, password and sessions; session lists
never show tokens or IP addresses. Disabling an account deletes its sessions
and fails actor resolution
([account-invitations](../../openspec/specs/account-invitations/spec.md),
[password-recovery](../../openspec/specs/password-recovery/spec.md),
[account-self-service](../../openspec/specs/account-self-service/spec.md)).

### Provider route boundary

The auth boundary forwards only `POST /api/auth/sign-in/email`,
`POST /api/auth/sign-out` and `GET /api/auth/get-session` to Better Auth.
Every other `/api/auth/*` path returns `404` before the provider runs, so
provider routes cannot bypass Lace rules or reveal session tokens. Only an
enabled MCP adds a literal, tested OAuth method/path allowlist. Exposing any
other provider route is an explicit, tested change.

### MCP OAuth delegation

Browser REST actors require sessions, except the import token above. Only MCP
resolves resource-bound OAuth credentials, into the current persisted enabled
user and role attenuated by an immutable, provider-neutral permission and
content-operation ceiling
([mcp-oauth-delegation](../../openspec/specs/mcp-oauth-delegation/spec.md),
[mcp-content-server](../../openspec/specs/mcp-content-server/spec.md),
[ADR 0015](../adr/0015-mcp-publication-scope.md)).

- Issuer and resource URLs derive from validated `LACE_PUBLIC_BASE_URL`, never
  from forwarding headers. Flows use S256 PKCE, explicit first consent and the
  existing sign-in form through a short-lived, server-bound continuation; no
  client-controlled URL metadata is fetched.
- The shared application authorizer checks every operation before protected
  work; delegated operations default to deny. Publication needs the publish
  scope and the current role permission. Unpublishing, deletion, revert,
  duplicate, media and administrative operations are never grantable, even to
  an administrator.
- Credentials do not cross boundaries: a cookie, build token or import token
  does not authenticate MCP, and an MCP token does not authenticate admin REST.
- Grant state and current roles are checked on every request and refresh
  without positive cross-request caching. Code redemption and refresh have one
  winner; refresh replay revokes the family. Credentials are hashed or
  encrypted at rest and signing keys are durable.
- Account-security events invalidate grants alongside sessions even while MCP
  is disabled, and re-enabling cannot revive them; ordinary sign-out leaves
  connections independent. Additive migrations and bounded indexed cleanup
  reuse existing infrastructure.
- Host and Origin policy stays explicit, permitting origin-less native clients
  without widening cookie trust. Logs exclude credentials, tool arguments and
  authorization query strings. Disabling MCP blocks issuance, renewal and use
  without dropping tables.

### Rate limits

Rate limits use a portable fixed-window SQL projection (`rate_limit_buckets`),
so behavior does not depend on one process or Worker isolate. The key is an
HMAC of the operation plus the relevant actor, email or client IP; raw IPs and
emails are never stored. Successful requests count too, and refusals carry
`Retry-After`. The defaults are stated by
[bootstrap-user-token-abuse-controls](../../openspec/specs/bootstrap-user-token-abuse-controls/spec.md)
(10 sensitive auth attempts per 15 minutes, 5 setup attempts per hour,
20 token-management attempts per hour per administrator, 30 uploads per minute
per actor) and by the invitation, password-recovery, self-service, MCP and
OAuth specs. Invitation inspection and acceptance and reset requests and
confirmations count against the per-client sensitive auth limit; password
changes count against it per actor. Deployments may lower these limits.
Expired buckets are removed by the same scheduled maintenance as expired
idempotency rows.

### Security requirements

- secure, HTTP-only cookies in production;
- CSRF and origin protection according to Better Auth requirements, with
  explicit trusted origins;
- rate limiting for authentication and upload endpoints;
- MIME type, file-size and filename validation for uploads;
- no secrets in generated client bundles;
- same-origin admin and API deployment by default;
- audit-friendly actor IDs on all content mutations;
- the Cloudflare bundle enables the Better Auth compatibility flag required
  for `AsyncLocalStorage`, covered by the Cloudflare smoke test.
