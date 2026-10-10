## 1. Architecture

- [x] 1.1 Update `docs/mvp-architecture.md` before any code. Verify with `grep -n "EmailSender\|LACE_EMAIL_PROVIDER\|admin/session\|Mailpit\|nodemailer" docs/mvp-architecture.md`, which must match in each updated section:
  - §3: optional transactional email through a provider port;
  - §12: `GET /api/v1/admin/session`, `POST /api/v1/admin/settings/email-test`;
  - §14: the session summary carries server-derived permissions, and the admin decides affordances only from them;
  - §15: the `EmailSender` port and its adapter table;
  - §17: permission-gated navigation, plus the Settings email card;
  - §18: Mailpit in `dev:node`, `log` in `dev:cloudflare`;
  - §19: `nodemailer` in `@lacecms/platform-node` only.

## 2. Domain, contracts and application

- [x] 2.1 Add `permissionsFor(role)` to `@lacecms/domain` and make `hasPermission` delegate to it; verify domain unit tests cover all three roles in policy order and frozen results
- [x] 2.2 Add `permissionSchema`, `adminSessionSchema`, the `email` field of `adminSettingsStatusSchema` (`from` present exactly when provider ≠ `none`) and `emailTestResultSchema` to `@lacecms/contracts`; verify contract tests reject unknown permissions, unknown fields, `none` with `from`, and accept every closed failure reason
- [x] 2.3 Add the `EmailSender` port, `EmailMessage`, `EmailDeliveryOutcome`, shared `validatedMessage()` (single address, no CR/LF, length bounds) and `testEmailTemplate` (text plus escaped minimal HTML) to `@lacecms/application`; verify unit tests for header-injection rejection, multi-recipient rejection and HTML escaping
- [x] 2.4 Add a security-port read returning a user's email and name by id to Node and D1 security services and the shared security contract test; verify `packages/test-utils` security contract passes on both
- [x] 2.5 Add the `sendTestEmail({ actor })` use case (requires `settings:manage`, recipient from the security port); verify tests for viewer/editor denial, admin `sent`, and propagated `failed` reasons with an in-memory sender

## 3. Email settings and adapters

- [x] 3.1 Implement pure `parseEmailSettings(env, { production, runtime })` in `@lacecms/server` per design D5; verify table tests cover:
  - the default `none`;
  - missing `LACE_EMAIL_FROM`;
  - `log` rejected in production;
  - `smtp` security `none` rejected in production;
  - incomplete SMTP credentials;
  - an invalid port or timeout;
  - `smtp` on the Worker and `cloudflare` on Node;
  - a non-HTTPS Resend base URL outside development;
  - errors that never contain supplied values.
- [x] 3.2 Implement `none`, `log` and `resend` senders in `@lacecms/server`; verify with a stubbed `fetch`:
  - the request shape: Bearer header, Idempotency-Key, JSON body;
  - status mapping: 422/403 → `rejected`, 429 → `rate_limited`, 5xx, network errors and timeouts → `unavailable`;
  - failure logs contain the provider and reason, but no recipient, subject or key.
- [x] 3.3 Add `nodemailer` to `@lacecms/platform-node` (exact pinned version) and implement the `smtp` sender; verify tests against a local in-process SMTP test server:
  - `starttls` refuses a server without STARTTLS;
  - `tls` and `none` work as configured;
  - authentication failures and timeouts map to `unavailable`;
  - a recipient rejection maps to `rejected`.
- [x] 3.4 Implement the `cloudflare` sender with the `EMAIL` binding validation in `@lacecms/platform-cloudflare`; verify a fake-binding test maps every documented error code to its closed reason, and that a missing or malformed binding fails settings parsing, naming `EMAIL`
- [x] 3.5 Wire email settings into `parseNodeRuntimeSettings` and `parseCloudflareSettings` and compose the selected sender into both runtimes; verify the existing Node and Worker settings tests plus new cases for each provider, and that the worker bundle test still finds no Node built-ins

## 4. HTTP routes

- [x] 4.1 Add `GET /api/v1/admin/session` to `@lacecms/server`; verify app tests:
  - each role receives its exact permission list and its email;
  - an anonymous request, a disabled user or an invalid role gets the unauthenticated envelope;
  - the response contains no session token.
- [x] 4.2 Add `email` to `GET /api/v1/admin/settings/status` and add `POST /api/v1/admin/settings/email-test` with a strict empty body and the `email-test` actor rate limit (5/hour); verify:
  - a viewer is denied;
  - a body naming a recipient fails validation;
  - the sixth call returns the rate-limit envelope without calling the sender;
  - `sent` and `failed` both return `200` with the validated DTO.
- [x] 4.3 Regenerate the checked-in OpenAPI document; verify the generated-contract currency test passes

## 5. Admin permissions

- [x] 5.1 Switch `createBrowserSessionSource` to `/api/v1/admin/session` validated by `adminSessionSchema` (`401` or invalid → `null`), extend `AdminSession` with `email` and `permissions`, and add `can()` / `useCan()` to `entities/session`; verify session tests for valid, malformed, unauthenticated and network-failure responses
- [x] 5.2 Replace role checks with permission checks; verify existing router, shell, navigation, tour and screen tests pass with permission-based session fixtures, plus new navigation tests for a session holding only `settings:manage`. The replacements:
  - the `/users` and `/settings` router guards;
  - `navigationGroups` (`requires` per item) and `tourSteps`;
  - `EntryPage` (read-only, publish);
  - `CollectionEntries`;
  - `MediaLibrary` and `MediaPickerDialog`;
  - `BuildsPage`.
- [x] 5.3 Update test stubs (`app/testing`) and e2e route mocks to serve the session summary; verify `pnpm --filter @lacecms/app-admin test` and the admin e2e suites pass
- [x] 5.4 Add the static admin policy test that fails on comparisons of the session role with role literals outside the presentation and managed-account allowlist; verify it passes on the converted source and fails on a temporary fixture containing `session.role === "admin"`

## 6. Settings email card

- [x] 6.1 Add `sendTestEmail()` to the admin client and an "Email delivery" card to Settings → Site status with provider label, sender, Send test email (hidden for `none`, disabled while pending) and reason-specific messages; verify component tests for each provider label, `sent` notification, each failure reason, rate-limit message, refresh/stale behavior and no requests for editors
- [x] 6.2 Extend the accessibility e2e audit to the Settings page with the email card in both themes; verify `pnpm --filter @lacecms/app-admin test:e2e -- accessibility`

## 7. Local development

- [x] 7.1 Add a pinned `mailpit` service to `docker-compose.dev.yml`, the email variables to the api service, and the values to `.env.example`, `pnpm dev:env` and the acceptance environment in `scripts/dev-stack.mjs`; verify `pnpm dev:node` starts, a Settings test email appears in the Mailpit inbox at the documented port, and the local-stack tests still pass
- [x] 7.2 Default local Cloudflare development to `log` (`apps/api` wrangler dev vars and Worker local harness); verify `pnpm dev:cloudflare` smoke check and that a test email appears in Worker output
- [x] 7.3 Document local mail capture and provider configuration in `docs/node-api.md`, `docs/cloudflare-worker.md` and `deploy/README.md`; verify the documented variable names match `parseEmailSettings`

## 8. Doctor and generated project

- [x] 8.1 Validate email settings in `lace doctor` for the `node` target through `parseEmailSettings`, reporting by variable name and "not configured" without failure; verify doctor tests for missing SMTP host, `cloudflare` on node, absent provider, and no network access
- [x] 8.2 Update templates for 0.21.0; verify the generator tests pass, the fixtures are regenerated, and the upgrade-planner tests show that an unmodified 0.20.0 project upgrades without touching `.env` or `worker/wrangler.jsonc`. The updates:
  - `.env.example`, Compose API environment, `worker/.dev.vars.example`;
  - a commented `send_email` example in a new `wrangler.jsonc`;
  - an Email section in the managed operations and scenario guides;
  - a 0.21.0 entry in `.lace/upgrade-instructions.json`;
  - `TEMPLATE_VERSION`.

## 9. Verification

- [x] 9.1 Run the narrowest package tests touched above, then root `pnpm typecheck`, `pnpm lint` (Oxlint), `pnpm format:check` (Oxfmt), the security-static suite, and `pnpm exec openspec validate admin-permissions-and-email-delivery --type change --strict`; verify all pass
