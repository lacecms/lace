## Context

See proposal.md for why. Current state that shapes the approach:

- **Accounts.** Accounts live in Better Auth's tables (`user`, `account` with `provider_id = 'credential'`, `session`, `verification`).
  - Lace already writes them directly in its security adapters: `NodeSecurityService` (`platform-node/src/security.ts`) and `D1SecurityService` (`platform-cloudflare/src/d1-security.ts`).
  - Passwords are hashed with `hashPassword` from `better-auth/crypto`, which also exports `verifyPassword`.
  - `bootstrap` already shows the claim-then-create protocol that is safe on D1.
- **Auth boundary.** `@lacecms/auth` wraps Better Auth 1.7.3 and forwards every `/api/auth/*` request to it. The repository itself only uses `sign-in/email`, `sign-out` and `get-session` (plus negative `sign-up` tests). Better Auth's own `disabledPaths` is a denylist of exact paths.
- **Actor resolution.** The resolver returns `Actor { id, role }` and discards the provider session, so its id is unavailable to use cases.
- **Change 1 foundations.**
  - `EmailSender` with closed outcomes and `renderEmail`.
  - `readUserProfile`, the `can()` admin check, and the copy-once pattern of the build-token dialog.
  - Actor-scoped rate-limit operations (`token`, `upload`, `email`) in both runtimes.
- **Existing callers of password-based creation.** `POST /api/v1/admin/users` and `security.createUser` are used by:
  - the admin Create user dialog;
  - the test-utils security contract and `tests/security-boundary.test.mjs`;
  - `tests/support/cross-runtime-fixture.mjs`;
  - `scripts/generated-project-acceptance.mjs`, `scripts/consumer-34b-security.mjs` and `scripts/cross-runtime-api.mjs`;
  - the admin `acceptance.e2e.ts` and `accessibility.e2e.ts`.
- **Maintenance.** There is no scheduled cleanup job for expired rows.

## Goals / Non-Goals

**Goals:**
- One Lace-owned token lifecycle for invitations and resets, with Node and D1 parity, closed DTOs and copy-once links.
- No provider route that can change credentials or reveal session tokens outside Lace policy.
- Self-service that works for every role without new permissions.

**Non-Goals:**
- Purging expired token rows. The tables stay small and hold only digests; a cleanup job can come later.
- Email change and verification.
- Device naming.
- IP display.
- Revoking build tokens on password change.

## Decisions

### D1. Lace-owned tokens instead of Better Auth's reset flow
Invitations and resets use Lace tables and the security port, following the setup-token pattern:
- 32 random bytes as base64url, stored as SHA-256 digests;
- constant-time comparison;
- guarded single-row updates.

The plaintext token returns from issue commands exactly once. The use case either renders it into the email or, when delivery is not `sent`, into the administrator's response.

- *Alternative: Better Auth `requestPasswordReset` with a `sendResetPassword` callback.* Rejected for three reasons:
  - The token is only visible inside a global callback, so returning a copy-once link to an administrator would need per-request smuggling.
  - Invitations would still need their own mechanism.
  - Behavior on D1 would depend on provider internals that change across releases.

### D2. Allowlist provider routes in the auth boundary
`createBetterAuthBoundary().fetch` forwards only:
- `POST /api/auth/sign-in/email`;
- `POST /api/auth/sign-out`;
- `GET /api/auth/get-session`.

Everything else returns a plain `404` before Better Auth runs.

- *Alternative: `disabledPaths`.* Rejected because it is a denylist. Every provider upgrade could silently expose new routes, such as `change-password` or `list-sessions`, which returns session tokens.

### D3. Credentials and sessions through the security port
`SecurityService` gains the following commands, implemented in both adapters with parameterized SQL on the existing tables:

| Area | Commands |
| --- | --- |
| Invitations | `createInvitation`, `listInvitations`, `inspectInvitation`, `acceptInvitation`, `reissueInvitation`, `revokeInvitation` |
| Reset | `issuePasswordReset`, `confirmPasswordReset` |
| Own account | `updateDisplayName`, `changePassword` |
| Sessions | `listSessions`, `deleteSession`, `deleteOtherSessions`, `deleteUserSessions` |

Public `createUser` is removed. A test-utils helper, `createUserByInvitation`, replaces it in fixtures.

Passwords use `hashPassword` and `verifyPassword` from `better-auth/crypto`, the same hashing Better Auth sign-in verifies against.

`mutateUser(disabled: true)` also deletes the user's sessions in the same transaction on Node, or the same batch on D1.

### D4. Atomic acceptance on D1 and Node
**Node** runs one `better-sqlite3` transaction:
1. Select the active invitation by digest.
2. Check that no user exists with that email.
3. Insert the user and the credential account.
4. Set `accepted_at` and `accepted_user_id`.

**D1** runs one `batch`, which is atomic. The user insert is conditional:
```sql
insert into user (...) select ?,... where exists (
  select 1 from invitations
  where token_hash = ? and accepted_at is null and revoked_at is null and expires_at > ?
)
```
It is followed by the account insert, selected from the inserted user, and the invitation update guarded by the same predicate.
- Zero inserted rows means the invitation was invalid.
- A unique violation on `user.email` means a conflict.
- Concurrent batches serialize, so exactly one acceptance wins.

Reset confirmation uses the same shape: guarded consume, password update, and session delete.

### D5. Current session identifier
`SessionActorResolver` gains `sessionId(request): Promise<string | null>`. The Better Auth boundary caches the `getSession` result per `Request` in a `WeakMap`, so resolving both the actor and the session id costs one provider lookup.

The server stores the id beside `lace.actor`. It is passed only to session use cases, and the domain `Actor` is unchanged.

User-agent summaries come from a small internal parser in `@lacecms/application`, with no dependency:
- browsers: Edge, Chrome, Firefox, Safari, Opera;
- operating systems: Windows, macOS, iOS, Android, Linux;
- anything else: `Unknown`.

### D6. Deferred delivery for uniform responses
`LaceAppInput` gains `defer(task: Promise<unknown>): void`:
- **Node** attaches a catch that reports through the email failure reporter.
- **Worker** composes it from `executionCtx.waitUntil` through Hono's context, with a fallback to the same catch.

The public reset request and the password-changed notice use `defer`, so their latency does not depend on delivery. Administrator invite and reset sends are awaited, because the administrator needs the outcome.

### D7. Links never leave the fragment
Links are built as `new URL("admin/accept-invite", publicBaseUrl)` or `new URL("admin/reset-password", publicBaseUrl)`, with `#token=…` appended. They are never derived from `Host`.

The admin screens read `location.hash`, call `history.replaceState` to drop it, and keep the token in component state. API calls carry the token only in JSON bodies. The server logger already records only paths, never queries or bodies.

### D8. Rate limits
| Operation | Applies to | Scope | Limit |
| --- | --- | --- | --- |
| existing `auth` | `/api/v1/invitations/*`, `/api/v1/password-reset/*` | per client | existing auth limit |
| existing `auth` | `POST /api/v1/account/password` | per actor | existing auth limit |
| new `invite` | invitation create, resend and revoke; admin reset | per actor | 20/hour |
| new `reset` | reset request, inside the use case after validation | HMAC of the normalized email | 3/hour |

The `auth` subject for `POST /api/v1/account/password` is the actor rather than the client address, so the check needs the resolved actor. The `reset` check runs through the existing `SensitiveRateLimiter` port.

### D9. HTTP status mapping
| Outcome | Status |
| --- | --- |
| Invalid token | `410 INVITATION_INVALID` / `RESET_INVALID` |
| Account or invitation conflict | `409 CONFLICT` |
| Wrong current password | `400 INVALID_CREDENTIALS` |
| Current session targeted by delete | `409` |
| Foreign or unknown session | `404` |

The new codes join the closed error-code list in contracts.

### D10. Admin structure
| Layer | Additions |
| --- | --- |
| Features | `invite-user` (`InviteUserDialog`), `manage-invitation` (`ResendInvitationButton`, `RevokeInvitationDialog`), `reset-user-password` (`SendPasswordResetDialog`), `sign-out-user` (`SignOutUserDialog`), `update-profile` (`ProfileForm`), `change-password` (`ChangePasswordForm`), `manage-sessions` (`SessionList`) |
| Shared UI | `OnceShownSecret` (copy, feedback, Done, "cannot be shown again"), extracted from the build-token dialog and reused |
| Pages | `account`, `accept-invite`, `forgot-password`, `reset-password` |
| Routes | public routes beside `/login`; `/account` under the protected route with no permission guard |

The user menu gains Account. The tour's Users step text changes from creating accounts to inviting people.

### D11. Templates and copy
Email templates are plain functions in `@lacecms/application`, like `testEmailTemplate`:
- invitation;
- password reset;
- password changed.

Every paragraph is escaped. Expiry is stated in hours, never as a local time.

## Risks / Trade-offs

- [Response timing could still hint at account existence: the token insert happens only for real accounts] → Delivery is deferred and the database work is a single indexed write. This is accepted for a single-site admin and documented.
- [The allowlist blocks a provider route a future feature needs] → Adding a route is an explicit, reviewed change in `@lacecms/auth` with a test.
- [Deleting sessions on disable is irreversible] → Re-enabling requires a fresh sign-in, which is the intended security outcome.
- [Older admin bundles call the removed `POST /api/v1/admin/users`] → API and admin ship together. Upgrade instructions say so.
- [Acceptance tooling depends on Mailpit] → The acceptance state records the Mailpit port. Generated-project acceptance runs with provider `none` and uses the returned link.
- [D1 `insert … select` with a conditional predicate] → Covered by the shared security contract on both runtimes, including the concurrent-acceptance case.

## Migration Plan

1. Update the architecture (§12 routes, §14 invitations/reset/sessions/allowlist, §17 screens).
2. Generate migration `0004` with Drizzle, check it in, and apply it on SQLite and D1 in tests.
3. Release notes and template `0.22.0`: back up, run `0004`, then deploy API and admin together.
4. Rollback: the tables are additive, and older engines' readiness checks only that their own checked-in migrations are applied, so redeploying the previous API and admin works without restoring. Invitations and reset links issued meanwhile stop working, and users can no longer self-manage until the new engine returns. A backup is still taken first, per the operations guide.

## Open Questions

- Exact invitation and reset email wording is settled during implementation. It must state the site URL, role, expiry and what to do if the mail was unexpected.
