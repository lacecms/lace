## 1. Architecture

- [x] 1.1 Update `docs/mvp-architecture.md` before code, then verify with `grep -n "invitations\|password_reset_tokens\|/api/v1/account\|accept-invite" docs/mvp-architecture.md` and confirm that no text still describes administrators creating users with passwords:
  - §12: replace `POST /api/v1/admin/users` with the invitation, reset, account and session routes;
  - §14: describe invitations, Lace-owned reset tokens, session deletion on disable and reset, and the provider route allowlist; replace "may create users" with invite wording;
  - §17: add the public account screens, `/account`, and Users invitation management.

## 2. Persistence

- [x] 2.1 Add the `invitations` and `password_reset_tokens` tables to `packages/db/src/schema.ts`, with the role check, the partial unique active-email index and the user index. Generate and check in migration `0004`. Verify that the db migration tests apply it on SQLite and on the D1 harness, and that the duplicate-active-invitation insert fails.

## 3. Domain, contracts and application

- [x] 3.1 Add the account DTOs, the error codes `INVITATION_INVALID`, `RESET_INVALID`, `INVALID_CREDENTIALS` and `CONFLICT`, and the `invite` and `reset` rate-limit operations to `@lacecms/contracts` and `@lacecms/application`. Remove `userCreateRequestSchema`. Verify with contract tests that cover:
  - link presence only when delivery is not `sent`;
  - rejection of tokens or IPs in session records;
  - password and display-name bounds;
  - unknown fields.
- [x] 3.2 Extend `SecurityService` with the invitation, reset, profile, password and session commands from design D3, and remove `createUser`. Add the user-agent summary parser and the invitation, reset and password-changed email templates. Verify with unit tests for parser classifications and HTML escaping in templates.
- [x] 3.3 Implement the account use cases: invite, list, resend, revoke, inspect, accept, reset request and confirm, admin reset, update name, change password, list sessions, delete one session, delete other sessions, and admin sign-out. Verify with in-memory unit tests for:
  - permission denial;
  - copy-once link only when delivery is not `sent`;
  - uniform reset-request outcome for unknown and disabled accounts;
  - per-email reset limit;
  - refusal to delete the current session;
  - a deferred password-changed notice.

## 4. Runtime adapters

- [x] 4.1 Implement the new commands in `NodeSecurityService` and `D1SecurityService`, following the atomic acceptance and reset protocol from D4, and delete sessions on disable. Extend `packages/test-utils/src/security-contract.ts` with cases for:
  - invitation conflicts, expiry, resend invalidation, revoke and reuse;
  - concurrent acceptance;
  - reset expiry, supersession and session deletion;
  - wrong current password;
  - foreign session ids;
  - disable deleting sessions.

  Replace `createUser` uses with a `createUserByInvitation` helper. Verify that the security contract passes on both runtimes.
- [x] 4.2 Add the `invite` (20/hour per actor) and `reset` (3/hour per email subject) limits to both limiters. Map the public account paths to `auth` per client, `POST /api/v1/account/password` to `auth` per actor, and the administrator invitation and reset paths to `invite` per actor. Verify with the runtime limiter tests.

## 5. Authentication boundary and HTTP

- [x] 5.1 Allowlist `sign-in/email`, `sign-out` and `get-session` in `@lacecms/auth` `fetch`, returning `404` for every other `/api/auth/*` path. Add `sessionId(request)` with per-request caching. Verify with auth tests showing that `change-password`, `list-sessions` and `sign-up/email` return `404`, that sign-in still works, and that only one provider session lookup happens per request.
- [x] 5.2 Add the public, account and administrator routes from the hono-app-factory delta, remove `POST /api/v1/admin/users`, and add `defer` to `LaceAppInput`: Node via a caught promise, Worker via `executionCtx.waitUntil`. Verify with server tests for:
  - `404` on the removed route;
  - the `202` reset response without awaiting a slow sender;
  - a uniform `410` for invalid tokens;
  - tokens absent from logs;
  - rate limiting before lookup;
  - the actor boundary on every route.
- [x] 5.3 Compose the new routes and `defer` in both runtimes and regenerate the OpenAPI document. Verify that the OpenAPI currency test and the Worker bundle smoke pass, with the smoke extended to: invite with link fallback → accept → sign in as the invitee → list sessions → reset request returns `202`.

## 6. Admin

- [x] 6.1 Extract `OnceShownSecret` from `CreateBuildTokenDialog` into `shared/ui` and reuse it there. Verify that the existing build-token dialog tests pass unchanged.
- [x] 6.2 Replace `CreateUserDialog` and the `createUser` client method with `InviteUserDialog`. On the Users page, add the Pending invitations list with Resend and Revoke, and add the Send password reset and Sign out everywhere row actions, following the admin-users-and-settings delta. Verify with component and page tests for:
  - sent versus link-once outcomes;
  - conflicts;
  - own-row restrictions;
  - cancellation focus return;
  - editor access denied without requests.
- [x] 6.3 Add the `/accept-invite`, `/forgot-password` and `/reset-password` routes and pages, and the sign-in "Forgot password?" link. Verify with page tests for:
  - fragment token reading and removal, and absence from storage;
  - invalid-link states;
  - uniform forgot confirmation;
  - accept-then-sign-in navigation;
  - reset success notice on sign-in.
- [x] 6.4 Add `/account` with `ProfileForm`, `ChangePasswordForm` and `SessionList`, the user-menu Account item, and the tour's Users wording update. Verify with tests for:
  - name update reflected in the user menu;
  - wrong current password;
  - sign-out-others defaulting on;
  - the "This device" marker;
  - ending one session and all other sessions with confirmation;
  - viewer access.
- [x] 6.5 Update the admin e2e mocks and add the accessibility audits for the four new screens and the invite and once-shown dialogs in both themes, the 375 px checks and keyboard paths. Verify with `pnpm --filter @lacecms/app-admin test` and `pnpm --filter @lacecms/app-admin test:e2e`.

## 7. Acceptance and tooling

- [x] 7.1 Record the Mailpit port in the acceptance state. Change `acceptance.e2e.ts` to invite the editor and viewer and accept them from the Mailpit message links, and update the acceptance documentation. Verify with `pnpm acceptance:start`, `pnpm --filter @lacecms/app-admin test:acceptance` and `pnpm acceptance:stop` on an isolated stack.
- [x] 7.2 Move `tests/security-boundary.test.mjs`, `tests/support/cross-runtime-fixture.mjs`, `scripts/cross-runtime-api.mjs`, `scripts/consumer-34b-security.mjs` and `scripts/generated-project-acceptance.mjs` from `POST /api/v1/admin/users` to invite plus accept, using the returned link with provider `none`. Verify with root `pnpm test` and the generated-project snapshot and acceptance checks that run without published artifacts.

## 8. Documentation and generated project

- [x] 8.1 Update `docs/auth-operations.md`, `docs/node-api.md` and `docs/cloudflare-worker.md` for invitations, password reset, account self-service, the provider route allowlist and migration `0004`. Verify that the documented routes match the OpenAPI document.
- [x] 8.2 Advance the template to `0.22.0`: add the `.lace/upgrade-instructions.json` database and configuration entries for `0004` and coordinated deployment, the version references in managed guides, `TEMPLATE_VERSION`, the generator and upgrade test expectations, and the regenerated fixtures. Verify that the generator, upgrade-command and snapshot checks pass.

## 9. Verification

- [x] 9.1 Run the narrowest package tests touched, then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, the security-static suite, `pnpm openapi:check` after committing, and `pnpm exec openspec validate account-invitations-reset-profile-sessions --type change --strict`. Verify that all pass.
