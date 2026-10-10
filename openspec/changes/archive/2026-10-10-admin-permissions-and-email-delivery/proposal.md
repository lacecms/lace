## Why

Account flows (invitations, password reset, profile and session management) need two foundations that Lace does not yet have. First, the admin UI decides what to show by comparing role strings in about ten places, although architecture §14 requires permission checks. Every change to the role matrix would mean editing finished admin screens, and the server policy and the UI could drift apart. Second, Lace cannot send email at all: there is no delivery port, no provider adapters, and no way to capture mail in local development.

This change is the first of two post-MVP "Accounts" changes. The MVP roadmap is complete and archived, so the change is standalone, as `admin-dark-theme` was. The second change, `account-invitations-reset-profile-sessions`, builds invite, reset, profile and session flows on these foundations and is proposed separately. Both foundations ship together because the email port needs a permission-gated Settings consumer to be verifiable end to end, and the permission rework is the gate for that consumer.

## What Changes

- **Server-derived permissions for the admin.** A new authenticated `GET /api/v1/admin/session` returns the signed-in user's id, email, display name, role, and the permission list the server computes from the domain policy (`defaultRolePermissions`). The admin's session source reads this contract-validated endpoint instead of the raw Better Auth `/api/auth/get-session` payload.
- **One admin authorization helper.** Route guards, navigation groups, tour steps and screen affordances call `can(session, permission)` / `useCan(permission)`. This covers Users and Settings routes, entry read-only and publish actions, media writes, collection management and build requests. A static test fails if admin source compares the session role to role literals for policy. The role remains for display only (badges, user menu). Behavior for today's three roles stays exactly as it is.
- **Email delivery port.** A portable `EmailSender` port reports closed outcomes (`sent` or `failed` with a closed reason). Text templates and the sender identity are shared across runtimes.
- **Email adapters**, selected by `LACE_EMAIL_PROVIDER`:
  - `none` (the default): no delivery. Later account flows fall back to links the admin copies.
  - `log`: development only. Writes the message to stdout. Startup rejects it in production.
  - `smtp`: Node only, via nodemailer. Production requires STARTTLS or implicit TLS.
  - `resend`: HTTP via `fetch`, works on both runtimes, and fits Resend's free tier.
  - `cloudflare`: Worker only, through the Email Service `send_email` binding. Requires Workers Paid and an onboarded sending domain.
- **Configuration validated without disclosure.** Node and Worker startup validate the email settings and name invalid variables without repeating their values. SMTP passwords and Resend keys never appear in logs, errors, status output or doctor output.
- **Settings → Email delivery.** For `settings:manage`, a status card shows the configured provider and sender address, and a **Send test email** action delivers a fixed test message only to the signed-in administrator's own address. The action is rate-limited and reports the closed outcome.
- **Local mail capture.** `docker-compose.dev.yml` gains a pinned Mailpit service: SMTP on 1025, web UI on 8025. The local Node API uses `smtp` against it. Local Cloudflare development defaults to `log`.
- **Doctor and the generated project.** `lace doctor` validates email variables in the project environment without sending mail. The managed template advances to `0.21.0`: email settings in `.env.example`, the Compose API environment, `worker/.dev.vars.example`, managed guides, and upgrade instructions.
- **Architecture.** §3, §12, §14, §15, §17, §18 and §19 record the email port, provider adapters, Mailpit and the nodemailer dependency, and the rule that the admin derives UI policy from server-provided permissions.

Non-goals (deferred to `account-invitations-reset-profile-sessions`): invitations, removal of password-based `POST /api/v1/admin/users`, password reset, profile and password change, session listing and revocation, and copy-link fallbacks. Also out of scope: changing the role matrix, custom or per-model roles, HTML email design beyond a minimal shared layout, inbound email, bounce handling, delivery retries or queues, and any change to first-administrator setup.

## Capabilities

### New Capabilities
- `email-delivery`: portable email port, closed delivery outcomes, provider selection and per-runtime adapters (`none`, `log`, `smtp`, `resend`, `cloudflare`), configuration validation, secret safety, and local capture.

### Modified Capabilities
- `authentication-and-actor-boundary`: an authenticated session summary exposes the user's server-derived permissions.
- `admin-application-shell`: navigation and route guards are permission-gated instead of role-gated, and every admin authorization affordance derives from session permissions.
- `admin-introductory-tour`: tour guidance follows session permissions instead of role names, with the same per-role outcomes.
- `admin-users-and-settings`: Settings shows email delivery status and sends a self-addressed test email.
- `rest-contracts`: admin session DTO with a closed permission list, the email status field on settings status, and the email test result contract.
- `hono-app-factory`: the session-summary and email-test routes keep the actor and rate-limit boundaries.
- `local-node-development`: the local Node stack captures outgoing email in Mailpit.
- `environment-doctor`: doctor validates email settings without sending mail or disclosing values.
- `project-generator`: template `0.21.0` delivers email configuration and guidance.

## Impact

- **Packages.**
  - `@lacecms/domain`: a `permissionsFor(role)` helper.
  - `@lacecms/contracts`: session, permission and email DTOs.
  - `@lacecms/application`: `EmailSender` port, message templates, test-email use case.
  - `@lacecms/server`: routes, plus the `log` and `resend` adapters, which are runtime-neutral.
  - `@lacecms/platform-node`: `smtp` adapter and settings parsing.
  - `@lacecms/platform-cloudflare`: `cloudflare` adapter, `EMAIL` binding and settings parsing.
  - `@lacecms/cli`: doctor checks.
  - `@lacecms/create-lace`: templates and template version `0.21.0`.
- **Admin.** Session entity, router guards, `SidebarNav`, tour, `EntryPage`, `BuildsPage`, `MediaLibrary`, `MediaPickerDialog`, `CollectionEntries`, the Settings page, test stubs and e2e mocks for the new session endpoint.
- **APIs.** New `GET /api/v1/admin/session` and `POST /api/v1/admin/settings/email-test`. `GET /api/v1/admin/settings/status` gains an `email` field, an additive change to an admin-only DTO. The OpenAPI document is regenerated.
- **Dependencies.** `nodemailer` in `@lacecms/platform-node` only. No email SDK is added: Resend uses `fetch`, Cloudflare uses the binding.
- **Operations.** New optional environment variables (`LACE_EMAIL_*`, `LACE_SMTP_*`, `LACE_RESEND_*`), an optional `send_email` binding, and a Mailpit dev container. No database migration. Deploy API and admin artifacts together, because the admin now requires the session endpoint.
