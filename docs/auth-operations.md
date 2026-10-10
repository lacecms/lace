# Authentication operations

## First administrator

`lace auth bootstrap` mints an expiring setup token only while installation is
incomplete. Store it in a secret manager and reveal it once to the operator
completing setup at the configured API origin’s `/admin/` URL. The setup
form accepts the token, email, and a password of 12–1024 characters, then
continues to ordinary sign-in. The token expires after one hour; an expired
unused token can be reissued only before completion. The API alternative is
`POST /api/v1/setup/admin` with `token`, `email`, and `password`; after successful completion it returns `404` permanently. If a
request is interrupted, repeat it with the same token and normalized email.

For the repository's local Docker workflow, use `pnpm dev:bootstrap` after
`pnpm dev:node` becomes healthy. It runs against the configured local SQLite
database, prints the token once to its invoker, and persists only its hash. No
Compose service seeds an account or a default password. The root README has the
complete first-run browser flow, API alternative, and sign-in path.

`GET /api/v1/setup/state` is anonymous and read-only. It returns only
`setupComplete`, never users or token metadata, and grants no account-creation
permission. The browser rechecks it after a setup `404` or lost response;
confirmed completion closes stale forms, while incomplete setup permits an
explicit same-token/email retry. A failed state read offers a read-only retry.
Completed setup cannot be reopened by the browser.

## Users and build credentials

Only administrators can list, invite, disable, or change users. Lace never
lets an administrator choose another person's password: `POST
/api/v1/admin/users` no longer exists. Lace refuses to disable or demote the
final active administrator, and disabling an account also deletes its
sessions, so re-enabling it requires a fresh sign-in. Build credentials are
created at the admin token endpoint, reveal their plaintext value once, and
can only read the published build export with `Authorization: Bearer <token>`.
Revoke a suspected credential immediately; listing never reveals it again.
In the browser, open `/admin/users` to manage accounts and invitations and
`/admin/settings` to inspect API readiness and configured models, create a
named build token, and revoke it later. Copy the new token before dismissing
it; Settings cannot retrieve its plaintext again. The root
[README](../README.md#show-published-content-on-the-local-site) also documents
the same-origin API request and ignored server-side environment setup.

## Invitations

Administrators add people with Users → Invite user (`POST
/api/v1/admin/invitations` with `email` and `role`). Nothing is created until
the invitee opens the single-use link,
`<LACE_PUBLIC_BASE_URL>admin/accept-invite#token=…`, and chooses a password of
12–1024 characters (`POST /api/v1/invitations/accept`); they then sign in
normally. A link stays valid for 72 hours. An address that already has an
account, or that has an unexpired pending invitation, is refused with
`409 CONFLICT`. Pending invitations are listed with `GET
/api/v1/admin/invitations` (never with tokens or links), resent with `POST
/api/v1/admin/invitations/:invitationId/resend` (which replaces the link and
restarts the expiry), and revoked with `DELETE
/api/v1/admin/invitations/:invitationId`. An unknown, expired, revoked, or
used link returns one `410 INVITATION_INVALID`.

When email delivery is configured the link is emailed and the response only
reports `sent`. When the provider is `none`, or delivery fails, the response
reports the closed failure reason and contains the link once; the admin dialog
shows it with Copy so you can hand it over another way. Later listings never
show it again.

## Password recovery and account self-service

"Forgot password?" on the sign-in screen calls `POST
/api/v1/password-reset/request`, which always returns the same `202` whether the
address belongs to an enabled account, a disabled account, or no account. Only
an enabled account receives a one-hour link,
`<LACE_PUBLIC_BASE_URL>admin/reset-password#token=…`; delivery happens after the
response, and a newer request supersedes older links. `POST
/api/v1/password-reset/confirm` sets the new password and deletes every
session of the account; an invalid link returns `410 RESET_INVALID`.
Administrators can send a reset from the Users list (`POST
/api/v1/admin/users/:userId/password-reset`), which follows the same copy-once
link rule as invitations, and sign a user out everywhere (`POST
/api/v1/admin/users/:userId/sessions/revoke`).

Every signed-in user manages their own account at `/admin/account`:

- `PATCH /api/v1/account` changes the display name (1–120 characters);
- `POST /api/v1/account/password` requires the current password, can sign out
  every other session, and sends a password-changed notice when email is
  configured; a wrong current password returns `400 INVALID_CREDENTIALS`;
- `GET /api/v1/account/sessions` lists sessions with a browser and operating
  system summary, creation and last-active times, and the current session
  marked, never session tokens or IP addresses;
- `DELETE /api/v1/account/sessions/:sessionId` and `POST
  /api/v1/account/sessions/revoke-others` end other sessions; the current one
  is ended by signing out (`409` here), and another user's session id is `404`.

Invitation and reset tokens are 32 random bytes stored only as SHA-256
digests in the `invitations` and `password_reset_tokens` tables from migration
`0004_account_tokens`. They travel only in the URL fragment and JSON request
bodies, never in paths, queries, logs, or error responses, and the admin
removes the fragment from the address bar as soon as it reads it.

## Provider routes

Lace forwards only `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`,
and `GET /api/auth/get-session` to Better Auth. Every other `/api/auth/*` path,
including the provider's sign-up, change-password, password-reset,
update-user, and list-sessions routes, returns `404` before the provider runs,
so account changes always go through the Lace routes above.

## Request limits

Sensitive authentication, setup, token-management, invitation, and upload
operations use fixed windows. Invitation inspection and acceptance, reset
requests and confirmations count against the per-client authentication limit
(10 per 15 minutes); password changes count against the same limit per
signed-in user. Invitation create, resend and revoke, plus administrator
resets, share a limit of 20 per hour per administrator, and reset requests are
also limited to 3 per hour per email address. A `429` includes `Retry-After`;
retry only after that duration. Persistence records HMAC bucket identities,
never raw emails or client IPs.

## Optional admin introduction

Every authenticated role can choose **Start tour** from the first-use welcome
panel, or **Introduction** in the account menu to replay from the beginning.
Back/Next move between steps; Finish records completion, while Skip, Close, or
Escape records dismissal. The offer never blocks work or steals focus. The tour
stays over the current route and preserves an unsaved draft. On mobile, open
navigation to reach the account menu; the sheet closes before the tour opens.

Guidance follows current navigation and role: admin/editor can edit drafts and
upload media, viewer can inspect, and only admin receives publication, build
request/retry, Users/Settings, and build-token creation instructions. Build tokens
read published exports only and reveal their plaintext once in their existing
creation dialog. The tour never creates a token. Publishing content does not
guarantee immediate site refresh or successful deployment; Step 29 owns verified
mode-specific instructions and must reconcile this copy when implemented.

Tour status is local to the browser, installation origin and admin base path,
user ID, and tour version. Sign-out preserves a saved record, role changes reuse
it, and replay reflects resolved current permissions. Different users/addresses
and tour versions are separate; clearing local storage resets the offer. There
is no device/browser synchronization or server onboarding record. If local
storage cannot be read/written, an in-memory record lasts for the current document
and shell remounts, but reload may offer again. Replacing a database behind the
same address and same user ID cannot be distinguished without clearing storage.
No email, password, session credential, build token, or content enters tour storage.

## Local operations evidence

See [34C local operations verification](local-operations-verification.md) for coordinated database/object restore, credential rotation, health/log interpretation and the running CMS version in administrator Settings. Remote deployment, D1 capacity/restore and provider permissions remain owner checks; local evidence does not close them.
