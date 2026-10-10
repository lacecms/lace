## Why

Lace accounts can be created only by an administrator who types the new user's password, and nobody can recover a forgotten password, change their own password, rename themselves or end a session on another device. This is the second post-MVP "Accounts" change. It builds on the email port, server-derived permissions and the admin `can()` check delivered by the archived `admin-permissions-and-email-delivery` change, and completes the agreed plan: invite instead of registration, password reset, profile and session management.

## What Changes

- **Invitations replace direct account creation.**
  - An administrator (`users:manage`) invites an email address with a role. The invitee opens a single-use link, valid for 72 hours, and chooses their own password; the account is created only at that point.
  - Pending invitations can be listed, resent (which rotates the link) and revoked. One email address can have at most one active invitation, and an address that already belongs to an account cannot be invited.
  - **BREAKING:** `POST /api/v1/admin/users` (create with password) and its contract are removed. The admin Create user dialog becomes Invite user.
- **Password reset.**
  - Anyone can request a reset link by email. The response is identical and immediate whether or not the account exists, and email delivery never delays it.
  - A link is valid for 1 hour, single-use, and superseded by a newer request. Using it sets the new password and ends every session of that account. Disabled accounts receive nothing.
  - An administrator can also send a reset to any user.
- **Copy-link fallback.** When email is not configured or delivery fails, the invite or reset response gives the administrator the link once, so they can deliver it by other means. Links carry the token in the URL fragment, so it never reaches server logs or `Referer`.
- **Account page for every signed-in user (`/account`).**
  - Change the display name.
  - Change the password: the current password is required, and other sessions can optionally be signed out. A "password changed" notice is emailed when delivery is configured.
  - List own sessions (browser and OS, created, last active, current marked), end any other session, or sign out everywhere else.
- **Administrator session controls.** An administrator can sign a user out everywhere. Disabling an account now deletes its sessions immediately instead of only rejecting them at actor resolution.
- **Authentication surface narrowed.** Lace forwards only sign-in, sign-out and get-session to Better Auth, so provider routes such as change-password or list-sessions cannot bypass Lace rules or expose session tokens. All new account flows are Lace routes with closed, validated DTOs.
- **Public screens.** New `/accept-invite`, `/forgot-password` and `/reset-password` screens, and a "Forgot password?" link on sign-in.
- **Persistence.** Migration `0004` adds the `invitations` and `password_reset_tokens` tables on SQLite and D1. Tokens are 32 random bytes stored only as SHA-256 digests.
- **Rate limits.**
  - Reset requests: per client and per email address.
  - Invitation inspect and accept: per client.
  - Invite, resend and admin reset: per administrator.
- **Generated project.** Template `0.22.0` gives upgrade instructions for migration `0004` and the coordinated API and admin deployment.
- **Architecture.** §12, §14 and §17 describe invitations, reset, account and session management and the narrowed provider surface.
- **Unchanged and covered by regression scenarios:** first-administrator setup through `POST /api/v1/setup/admin`, sign-in, and role and disable management.

Non-goals: public sign-up, email-address change and email verification, MFA, OAuth or SSO, showing session IP addresses, account deletion, invitation or token cleanup jobs, per-user email preferences, and changes to the role matrix.

## Capabilities

### New Capabilities
- `account-invitations`: invitation lifecycle (create, inspect, accept, resend, revoke, expiry and conflicts), copy-link fallback, invitation email, rate limits.
- `password-recovery`: self-service and administrator-initiated reset, uniform responses, token lifecycle, session termination on reset.
- `account-self-service`: profile name, password change with notice, own session listing and revocation, administrator sign-out-everywhere, session deletion on disable.
- `admin-account-screens`: the accept-invite, forgot-password, reset-password and account screens, and the sign-in "Forgot password?" link.

### Modified Capabilities
- `authentication-and-actor-boundary`: only sign-in, sign-out and get-session reach the provider; the current session is identifiable for session listing.
- `admin-users-and-settings`: Users invites instead of creating accounts with a password, lists pending invitations, and offers Send password reset and Sign out everywhere.
- `rest-contracts`: invitation, reset, account and session DTOs; the user-create contract is removed.
- `hono-app-factory`: public account routes, self-service routes and administrator routes with their actor and rate-limit boundaries.
- `application-ports-and-commands`: the security port gains invitation, reset, profile, password and session commands, and loses password-based user creation.
- `sqlite-schema-and-migrations`: migration `0004` with the invitation and reset tables.
- `local-product-acceptance`: the browser acceptance invites the editor and viewer through Mailpit.
- `project-generator`: template `0.22.0` instructions for the new migration and coordinated deployment.

## Impact

- **Packages.**
  - `@lacecms/db`: schema and migration `0004`.
  - `@lacecms/application`: commands, use cases and email templates.
  - `@lacecms/auth`: path allowlist and current-session lookup.
  - `@lacecms/server`: routes and deferred delivery.
  - `@lacecms/platform-node`, `@lacecms/platform-cloudflare`: security adapters and rate-limit operations.
  - `@lacecms/contracts`: new DTOs.
  - `@lacecms/test-utils`: the security contract.
  - `@lacecms/create-lace`: template `0.22.0`.
- **Admin.**
  - Users page: Invite dialog, invitations table, reset and sign-out actions.
  - New `/account`, `/accept-invite`, `/forgot-password` and `/reset-password` routes; a user-menu Account item; the sign-in link.
  - `CreateUserDialog` and `createUser` in the admin client are removed.
- **APIs.**
  - New public `/api/v1/invitations/*` and `/api/v1/password-reset/*`.
  - New `/api/v1/account*` for the signed-in user.
  - New `/api/v1/admin/invitations*` and `/api/v1/admin/users/:userId/{password-reset,sessions/revoke}`.
  - Removed `POST /api/v1/admin/users`.
  - Better Auth routes other than sign-in, sign-out and get-session return `404`.
- **Tests and tooling.** The security contract, cross-runtime fixture, security-boundary tests, generated-project acceptance, consumer 34B security script and admin e2e move from direct creation to invitations.
- **Operations.** Migration `0004` must run before the new engine starts. Deploy API and admin together. No new environment variables.
