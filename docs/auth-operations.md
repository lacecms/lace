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

Only administrators can create, list, disable, or change users. Lace refuses
to disable or demote the final active administrator. Build credentials are
created at the admin token endpoint, reveal their plaintext value once, and
can only read the published build export with `Authorization: Bearer <token>`.
Revoke a suspected credential immediately; listing never reveals it again.
In the browser, open `/admin/users` to manage accounts and `/admin/settings`
to inspect API readiness and configured models, create a named build token,
and revoke it later. Copy the new token before dismissing it; Settings cannot
retrieve its plaintext again. The root
[README](../README.md#show-published-content-on-the-local-site) also documents
the same-origin API request and ignored server-side environment setup.

## Request limits

Sensitive authentication, setup, token-management, and upload operations use
fixed windows. A `429` includes `Retry-After`; retry only after that duration.
Persistence records HMAC bucket identities, never raw emails or client IPs.

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
