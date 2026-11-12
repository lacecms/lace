# Authentication operations (internal)

Engineering notes for setup, sessions, invitations, password recovery, import
credentials and request limits. User procedures are public:
[Users, roles and accounts](../apps/docs/src/content/docs/en/latest/editing-content/accounts.md)
(invitations, password recovery, account self-service, build and import
tokens, request limits),
[Getting started](../apps/docs/src/content/docs/en/latest/getting-started/index.md)
(first administrator) and
[Import content](../apps/docs/src/content/docs/en/latest/editing-content/import.md).
Accepted behavior lives in the `browser-first-admin-setup`,
`account-invitations`, `password-recovery`, `account-self-service` and
`authentication-and-actor-boundary` specs.

## First administrator

`lace auth bootstrap` mints an expiring (one hour) setup token only while
installation is incomplete and persists only its hash; an expired unused token
can be reissued only before completion. `POST /api/v1/setup/admin` accepts
`token`, `email` and `password` and returns `404` permanently after successful
completion. An interrupted request is repeated with the same token and
normalized email.

`GET /api/v1/setup/state` is anonymous and read-only. It returns only
`setupComplete`, never users or token metadata, and grants no account-creation
permission. The browser rechecks it after a setup `404` or lost response;
confirmed completion closes stale forms, while incomplete setup permits an
explicit same-token/email retry. A failed state read offers a read-only retry.

For the repository's local Docker workflow, run `pnpm dev:bootstrap` after
`pnpm dev:node` becomes healthy. It targets the configured local SQLite
database and prints the token once to its invoker. No Compose service seeds an
account or a default password. [DEVELOPMENT.md](../DEVELOPMENT.md) has the
contributor first-run flow.

## Users and sessions

`POST /api/v1/admin/users` does not exist: administrators invite users and
never choose another person's password. Disabling the final active
administrator or demoting them is refused. Disabling an account deletes its
sessions. Build credentials authenticate only the published build export with
`Authorization: Bearer <token>`; listing never reveals plaintext.

## Invitations

Invitation and reset tokens are 32 random bytes stored only as SHA-256 digests
in the `invitations` and `password_reset_tokens` tables. They travel only in
the URL fragment (`<LACE_PUBLIC_BASE_URL>admin/accept-invite#token=…`,
`…admin/reset-password#token=…`) and JSON request bodies, never in paths,
queries, logs or error responses, and the admin removes the fragment as soon
as it reads it. Every invalid invitation state returns one `410
INVITATION_INVALID`. When the provider is `none` or delivery fails, invitation
and administrator reset responses contain the closed failure reason and the
link exactly once; later listings never show it.

## Password reset

Every invalid reset returns `410 RESET_INVALID`. Public reset requests always
return the same `202` whether or not the account exists or is enabled, and
delivery happens after the response.

## Import credentials

Import tokens follow [ADR 0016](adr/0016-import-credentials.md). A request with
a Bearer credential on any `/api/v1/admin/` or `/api/v1/account/` route is an
import request: it never falls back to a session cookie, and only these routes
accept it:

- `GET /api/v1/admin/content-models`
- `GET` and `POST /api/v1/admin/models/:modelKey/entries`
- `GET /api/v1/admin/entries/:entryId`, `PUT …/draft`, `POST …/publish`
- `GET` and `POST /api/v1/admin/media`, `GET` and `PATCH /api/v1/admin/media/:mediaId`
- `GET /api/v1/admin/import-credential`, which returns the token's metadata and
  its effective `permissions`

Every other route answers `403 AUTHORIZATION_DENIED`, including the tag
catalog. The token acts as its creator with the creator's current role,
narrowed to `content:read`, `content:write` and `media:write`, plus
`content:publish` only when the token carries it. An explicit foreign `Origin`
on a write is refused; command-line clients send none. Import tokens never
authenticate MCP or the build export, and build tokens never authenticate admin
routes. Token management (`GET`/`POST /api/v1/admin/import-tokens`,
`DELETE /api/v1/admin/import-tokens/:tokenId`) requires a browser session with
`settings:manage`; the API accepts lifetimes of 1–7 days, while Admin offers 1,
3 and 7.

Two list parameters keep imports idempotent:

- `GET /api/v1/admin/models/:modelKey/entries?slug=<slug>` (collections only)
  matches the current draft slug exactly; a differing published slug never
  matches. Draft slugs are not unique, so the page can hold several entries.
- `GET /api/v1/admin/media?sha256=<64 lowercase hex>` returns active items
  whose stored bytes have that SHA-256. Every upload records the hash, shown as
  `sha256` in admin media DTOs.

Both combine with the other list options and bind continuation cursors.
Invalid values return `422` with the pointer `/slug` or `/sha256`.

## Provider routes

Lace forwards only `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`
and `GET /api/auth/get-session` to Better Auth. Every other `/api/auth/*` path,
including the provider's sign-up, change-password, password-reset,
update-user and list-sessions routes, returns `404` before the provider runs,
so account changes always go through the Lace routes.

## Request limits

Sensitive authentication, setup, token-management, invitation and upload
operations use fixed windows; the public account page lists the user-visible
limits. Persistence records HMAC bucket identities, never raw emails or client
IPs. A `429` includes `Retry-After`.

## Admin introduction storage

Tour status is local to the browser, installation origin and admin base path,
user ID and tour version. Sign-out preserves a saved record, role changes
reuse it, and replay reflects current permissions. There is no device
synchronization or server onboarding record. If local storage cannot be read
or written, an in-memory record lasts for the current document and shell
remounts. Replacing a database behind the same address and user ID cannot be
distinguished without clearing storage. No email, password, session
credential, build token or content enters tour storage.

## Local operations evidence

See [owner checks on real infrastructure](verification.md#owner-checks-on-real-infrastructure)
for deployment, restore, rotation and provider evidence beyond local
verification.

## Optional MCP delegation

User and operator setup, consent, revocation and limits are public:
[MCP](../apps/docs/src/content/docs/en/latest/operations/mcp.md). Ordinary
browser sign-out leaves independent grants intact; disable, reset and
revoke-others invalidate them.
