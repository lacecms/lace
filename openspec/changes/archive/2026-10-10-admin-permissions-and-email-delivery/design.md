## Context

See proposal.md for why. Current state that shapes the approach:

- **Server-side policy.** The authorization policy lives in `@lacecms/domain`: `Role`, `Permission`, `defaultRolePermissions`, `hasPermission` and `requirePermission`. Application use cases already call `requirePermission`, and HTTP handlers only resolve an `Actor { id, role }` through `SessionActorResolver` (`@lacecms/auth`).
- **Admin session.** The admin builds its `AdminSession { id, role, displayName? }` by hand-parsing the raw Better Auth `/api/auth/get-session` payload (`apps/admin/src/entities/session/session.ts`). About ten call sites compare `session.role` with literals: the router, `EntryPage`, `BuildsPage`, `MediaLibrary`, `MediaPickerDialog`, `CollectionEntries`, `navigation.ts` and `tour.ts`.
- **Runtime settings.** Each runtime parses its settings once, with "name the variable, never the value" errors: `parseNodeRuntimeSettings` (`platform-node/src/runtime.ts`) and `parseCloudflareSettings` (`platform-cloudflare/src/settings.ts`). Node production is `NODE_ENV=production`; the Worker is production unless `LACE_ENVIRONMENT=development`.
- **Adapter precedents.** Existing adapters return closed outcomes, for example the deploy hook and builder trigger with `BuildTriggerResult`. Optional providers have base-URL overrides for tests, such as `LACE_PAGES_API_BASE_URL`.
- **Rate limiting.** Portable rate limiting already exists in `rate_limit_buckets`, through `RequestRateLimiter` in `@lacecms/server`.
- **No email.** There is no email code, dependency or dev mail service. `docker-compose.dev.yml` runs minio, migrate, api, admin and site, and `scripts/dev-stack.mjs` drives both the local and acceptance stacks from it.

## Goals / Non-Goals

**Goals:**
- One server-side source for the permission grant: the domain policy feeds both use-case authorization and the admin.
- An email port small enough that account flows in the next change only call `send` and react to a closed outcome.
- Identical behavior for every provider both runtimes share, and secret-safe failure everywhere.

**Non-Goals:**
- Making the role matrix configurable at runtime. The design only makes that possible later without admin changes.
- Delivery guarantees: queuing, retries, outbox-backed email, bounce or complaint handling. Account emails are sent synchronously inside the request that needs them, and their flows (next change) treat failure as recoverable through copy-link fallbacks.
- Rich HTML email theming.

## Decisions

### D1. A Lace session-summary endpoint, not a Better Auth extension
`GET /api/v1/admin/session` resolves the `Actor` through the existing boundary, loads `email` and `name` through a new read on the security port, and returns `{ user: { id, email, displayName?, role }, permissions }`. The permissions come from a new pure `permissionsFor(role)` in `@lacecms/domain`, which returns `defaultRolePermissions[role]` in policy order. `hasPermission` delegates to it, so use-case checks and the summary cannot diverge.

- *Alternative: Better Auth `customSession` plugin adding `permissions` to `/api/auth/get-session`.* Rejected. It couples the admin to provider payload shapes, which architecture §14 keeps out of application code, and it bypasses `@lacecms/contracts` validation.
- *Alternative: the admin imports `@lacecms/domain` and computes permissions itself.* Rejected. A future server-side policy change, such as configurable roles, would again need an admin rebuild, which is exactly what the owner wants to avoid.

The Better Auth sign-in and sign-out routes stay unchanged. Only the admin's session source switches endpoints. A `401` or a contract-validation failure becomes `null`, which preserves the current "no session" semantics.

### D2. One admin permission helper, enforced by a static test
`entities/session` exposes `can(session, permission)` and a `useCan(permission)` hook. `AdminSession` gains `email` and `permissions: ReadonlySet<Permission>`. Router `beforeLoad` guards use `can(context.session, "users:manage" | "settings:manage")`.

`navigationGroups` and `tourSteps` take the session (or its permission set) instead of `AdminRole`, and each navigation item declares `requires: Permission`. Screens map as follows:

| Screen | Decision | Permission |
| --- | --- | --- |
| `EntryPage` | read-only | `!can("content:write")` |
| `EntryPage` | publish | `content:publish` |
| `CollectionEntries` | manage | `content:write` |
| `MediaLibrary`, `MediaPickerDialog` | write | `media:write` |
| `BuildsPage` | request and retry | `settings:manage`, matching the existing `site-build-use-cases` check |

The guard is a Vitest test under `apps/admin`. It scans `src/**/*.{ts,tsx}` (excluding tests) and fails on comparisons of `session.role` or a destructured session `role` against `"admin"`, `"editor"` or `"viewer"`. It allowlists the presentation helpers (`entities/session/roles.ts`, `UserMenu`, `UsersTable`) and the user-management dialogs that compare the managed account's role, such as `ChangeRoleDialog`'s self-demotion warning.

- *Alternative: an Oxlint rule.* Rejected for now. Custom Oxlint rules would need its JS plugin system, which adds tooling surface for one check. The repository already uses source-scanning tests (`vitest.security-static`).

### D3. `EmailSender` port and closed outcomes in `@lacecms/application`
```ts
interface EmailMessage { to: string; subject: string; text: string; html?: string }
type EmailDeliveryOutcome =
  | { status: "sent" }
  | { status: "failed"; reason: "not_configured" | "invalid_message" | "rejected" | "rate_limited" | "unavailable" };
interface EmailSender { readonly provider: EmailProviderKind; readonly from?: string; send(m: EmailMessage): Promise<EmailDeliveryOutcome> }
```
A shared `validatedMessage()` in application enforces a single address, no CR/LF in recipient or subject, and length bounds. It runs before every adapter, so header-injection protection does not depend on any provider library.

Templates are plain functions returning `{ subject, text, html }`. This change adds only `testEmailTemplate`; the invite and reset templates arrive in the next change. HTML is a minimal escaped layout.

The use case `sendTestEmail({ actor })` calls `requirePermission(actor, "settings:manage")`, resolves the actor's email through the security port, and sends.

### D4. Adapter placement follows runtime dependencies
| Provider | Package | Notes |
| --- | --- | --- |
| `none` | `@lacecms/server` | Always `not_configured`. |
| `log` | `@lacecms/server` | Writes one JSON line `{ component: "email", provider: "log", to, subject, text }` to the runtime logger. |
| `resend` | `@lacecms/server` | `fetch` POST `{base}/emails` with `Authorization: Bearer`, `AbortSignal.timeout`, an `Idempotency-Key` per call, and `redirect: "manual"` (Workers reject `"error"`; a redirect is never followed). Status mapping: 429 → `rate_limited`; other 4xx → `rejected` (messages are validated locally, so the remainder are key, sender or domain problems); 3xx, 5xx, network errors and timeouts → `unavailable`. |
| `smtp` | `@lacecms/platform-node` | `nodemailer` transport with `requireTLS` for `starttls`, `secure: true` for `tls`, connection and greeting timeouts from `LACE_EMAIL_TIMEOUT_MS`. Pooling is off: the volume is tiny. |
| `cloudflare` | `@lacecms/platform-cloudflare` | Structural `SendEmailBinding { send(message): Promise<unknown> }` validated like other bindings. Error `code` values map per the `email-delivery` spec. |

`@lacecms/server` is already runtime-neutral and depended on by both platforms, so the shared adapters avoid duplication without creating a new package. Every adapter wraps its own exceptions and returns `failed`. Exceptions never cross the port.

- *Alternative: the `resend` npm SDK.* Rejected. One endpoint does not justify a dependency, and `fetch` keeps the Worker bundle lean.
- *Alternative: SMTP from the Worker through `cloudflare:sockets`.* Rejected. Port 25 is blocked and STARTTLS over sockets is fragile. The binding and Resend cover Cloudflare.

### D5. Settings parsing per runtime, with one shared rule set
A pure `parseEmailSettings(env, { production, runtime })` lives in `@lacecms/server`, beside `parseBuildSiteIdentity`. It returns either a discriminated `EmailSettings` or issues as `{ variable, reason }`. Both runtime parsers call it and merge the issues into their existing error types. `@lacecms/platform-node` exports `parseNodeEmailSettings` (production from `NODE_ENV`), and doctor reuses it through the existing `parseNodeRuntimeSettings` validation, because `@lacecms/cli` depends on the platform packages rather than on `@lacecms/server`. Compose-mode doctor validates as production, matching the published image. Doctor reports a separate `email` check after `settings`: `EMAIL_NOT_CONFIGURED` (pass) without a provider, a pass naming the provider when valid, and skipped when the settings check already names invalid variables.

Variables:

| Variable | Rule |
| --- | --- |
| `LACE_EMAIL_PROVIDER` | Provider kind; empty means `none`. |
| `LACE_EMAIL_FROM` | Required unless `none`. Parsed as `addr` or `Name <addr>`; CR/LF rejected. |
| `LACE_EMAIL_TIMEOUT_MS` | Default 10000, range 1–60000. |
| `LACE_SMTP_HOST`, `LACE_SMTP_PORT`, `LACE_SMTP_SECURITY`, `LACE_SMTP_USER`, `LACE_SMTP_PASSWORD` | For `smtp`. |
| `LACE_RESEND_API_KEY`, `LACE_RESEND_API_BASE_URL` | For `resend`. |
| `EMAIL` binding | For `cloudflare` on the Worker. |

Runtime-specific rejections:
- `log` in production;
- `smtp` with security `none` in production;
- `smtp` on the Worker;
- `cloudflare` on Node.

### D6. Settings status and the test route
`GET /api/v1/admin/settings/status` adds `email: { provider, from? }` from the composed `EmailSender`'s static metadata. No provider call is made.

`POST /api/v1/admin/settings/email-test` validates an empty strict body and runs through the existing actor-limited rate-limit hook with a new operation key `email-test`, 5 requests per hour per actor. It returns `200` with the outcome DTO.

Returning `200` for `failed` is deliberate. The request succeeded, and the outcome is domain data the UI explains, mirroring how publication reports independent dispatch outcomes.

The recipient comes only from the persisted account, so the route cannot be used as an open relay.

`GET /api/v1/admin/session` reads email and name through the new `readUserProfile` security-port method. A missing or disabled account returns the unauthenticated envelope, so a session summary always describes a persisted, enabled user.

For consistency with the admin's Settings guard, the server gates settings status, build-token routes, build request/retry and the email test by `settings:manage` (previously settings status, tokens and build routes checked `users:manage`; the build use cases already required `settings:manage`). Both permissions belong to `admin` only, so no current role gains or loses access. The rate limiter gains an actor-scoped `email` operation in both runtimes.

### D7. Local capture with Mailpit
`docker-compose.dev.yml` adds `mailpit` with an exact image tag. SMTP is on 1025 (internal only) and the UI is published on `${LACE_MAILPIT_PORT:-8025}`. The api service gets:

```text
LACE_EMAIL_PROVIDER=smtp
LACE_SMTP_HOST=mailpit
LACE_SMTP_PORT=1025
LACE_SMTP_SECURITY=none
LACE_EMAIL_FROM="Lace Dev <lace@localhost.test>"
```

Development mode permits `none` security. `pnpm dev:env` and the acceptance environment write these values. The local-dev docs and the `dev:node` output name the inbox URL.

Local Cloudflare (`apps/api/wrangler.jsonc` dev vars and template `.dev.vars.example`) defaults to `log`. The Worker test harness exercises the `cloudflare` adapter with a fake binding.

### D8. Generated project template 0.21.0
The changes follow the established template-bump pattern (see 34B):
- `.env.example` and the Compose API environment carry empty-default email variables;
- `worker/.dev.vars.example` sets `log`;
- a newly generated `wrangler.jsonc` has a commented `send_email` example;
- managed guides gain an Email section;
- `.lace/upgrade-instructions.json` gets a 0.21.0 entry;
- `TEMPLATE_VERSION` and the generated-project fixtures are regenerated.

## Risks / Trade-offs

- [Old admin bundle against new API, or the reverse] → The new admin requires `/api/v1/admin/session`. Upgrade instructions and release notes require deploying API and admin together. Both ship in the same image or Worker bundle, so mismatch only happens with hand-mixed artifacts.
- [Synchronous sends add request latency, and timeouts can hang a request] → A bounded timeout (default 10 s) applies on every adapter. The only caller in this change is the admin test action.
- [The Cloudflare Email Service is Beta, Paid-only, and has undocumented daily limits] → The Resend adapter is the recommended Cloudflare path. Binding codes map to closed reasons, and the guides state the plan requirement.
- [A Resend free-tier quota of about 100 per day surfaces as failures] → The failure maps to `rate_limited` with a clear Settings message. Account flows in the next change fall back to copy-link.
- [A `log` provider accidentally enabled in production would leak account links] → Startup refuses it in production on both runtimes, with tests.
- [The static role-comparison test misses aliased patterns] → It also flags destructured `role` from `useSession()`, and code review plus the allowlist keep it narrow. This is a guard, not a proof.
- [nodemailer adds a Node-only dependency] → It is confined to `@lacecms/platform-node` and excluded from the Worker bundle by package boundaries. The bundle test already checks for Node built-ins.

## Migration Plan

1. Update `docs/mvp-architecture.md` (§3, §12, §14, §15, §17, §18, §19) before code.
2. Ship the domain, contracts and server changes. The new routes are additive and the status DTO field is additive for admin-only consumers.
3. Switch the admin session source and the permission checks in the same release.
4. No database migration. Rollback is redeploying the previous artifacts. Email variables left set are ignored by older engines.

## Open Questions

- The exact Mailpit image tag is chosen at implementation time: the latest stable release at least two weeks old.
- The nodemailer version follows the dependency policy pinning rules at implementation time.
