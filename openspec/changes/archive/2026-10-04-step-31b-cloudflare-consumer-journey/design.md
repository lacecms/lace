## Context

See proposal.md — Why. Observed state after 31A:

- `scripts/cloudflare-consumer-acceptance.mjs` generates a packed `--cloudflare`
  starter, runs `cf:build`, `env:prepare`, `cf:env:prepare`, local
  migrate/sync/bootstrap, starts `cf:dev` (`wrangler dev --local --test-scheduled`)
  on a free port and exercises setup/login/models/media through `fetch`, then a
  restart. It is the `cloudflare` phase of `scripts/generated-project-acceptance.mjs`,
  which supplies `run`, `sanitize`, `secretValues`, `freePort`, `installPackedConsumer`.
- The Worker's deploy-hook trigger accepts only `https:` URLs (`settings.ts`),
  sends a bodiless `POST` without redirects, maps 2xx + envelope ID to `running`,
  `408/425/429/5xx`/network to retryable `trigger_unavailable`. Site-build events
  are debounced 5 s; retry delay for attempt 1 is full-jitter up to 5 s; eight
  attempts make a build terminal `failed`.
- `wrangler dev` runs no cron automatically; `--test-scheduled` exposes
  `/__scheduled`. Miniflare (`miniflare@5.20260903.0-alpha`) adds the PEM bundle
  named by `NODE_EXTRA_CA_CERTS` to workerd's outbound "internet" trust store.
- `lace doctor --target cloudflare-local` already checks Wrangler, the selected
  config's `DB` binding, local settings, a loopback `LACE_API_BASE_URL`, API
  readiness and API-derived migrations. The generated `.env` points
  `LACE_API_BASE_URL` at the Node API (`:3000`), so doctor and site builds need
  the operator to point it at the Worker (`:8787`), as the README already says
  for builds.
- Setup tokens live in D1 `setup_tokens.expires_at` (integer epoch ms). Miniflare
  persists local D1 as SQLite files under
  `<persist>/v3/d1/miniflare-D1DatabaseObject/*.sqlite`.
- The admin setup screen shows "Setup is still incomplete. Check your token or
  ask the operator to issue a new one if it expired…" after a `404` with
  incomplete state. Source-workspace Playwright e2e (`apps/admin/e2e`) already
  establishes accessible selectors for login, media, editor and publish.
- The generated guide's doctor paragraph still calls CMS Worker onboarding
  future work; the guide says to "create a deploy hook for the site's Pages
  project", but Pages deploy hooks exist only for Git-connected projects while
  the generated workflow uses direct upload.

## Goals / Non-Goals

**Goals:** prove the operator's full local Cloudflare journey against packed
artifacts with no product-code change; make the local guide sufficient for that
journey and its recovery; hand Step 33 an exact real-account procedure.

**Non-Goals:** relaxing the HTTPS hook rule, a doctor or CLI change, provider
status polling, real account use, CI for the Worker, Cloudflare acceptance in the
default PR CI.

## Decisions

### D1. Controlled hook is local HTTPS trusted only by the acceptance Worker
Acceptance creates a throwaway RSA certificate for `IP:127.0.0.1` with the
system `openssl` (one day validity) in the temporary directory, serves it with
`node:https` on a free port, and starts `cf:dev` with `NODE_EXTRA_CA_CERTS`
pointing at it. The hook URL `https://127.0.0.1:<port>/deploy-hooks/<random>` is
appended to the ignored `worker/.dev.vars` and registered as a secret value. The
server records method, body, cookie and authorization and answers per mode:
`503` (unavailable) or `200` with `{"success":true,"result":{"id":"acceptance-deploy-1"}}`.

Alternatives: allowing `http://` loopback hooks in development (changes the
Worker security contract for a test); Miniflare `outboundService` (would not run
the generated `cf:dev`); a real Pages hook (account, Step 33).

### D2. Browser steps use the workspace's Playwright as a test harness
The journey resolves `@playwright/test` from `apps/admin/package.json` with
`createRequire` and launches headless Chromium. It is acceptance tooling only;
the consumer never depends on it. Browser steps: setup with the expired token
(expect the incomplete-setup guidance, state still `false`), setup with the
fresh token (expect sign-in), sign-in, Media upload, Posts → Create entry,
slug/summary, add an Image block choosing the upload, Save draft, Publish,
Confirm publication. Selectors follow `apps/admin/e2e/acceptance.e2e.ts`.
The browser closes in `finally`. CI's generated-acceptance workflow installs
Chromium with `playwright install --with-deps chromium`.

Alternatives: a separate Playwright spec fed by a state file (two processes to
coordinate, harder cleanup); API-only steps (do not prove the packaged admin).

### D3. Expired token is explicit fixture preparation in stopped local state
After `cf:auth:bootstrap` and before the first `cf:dev`, acceptance opens each
Miniflare D1 SQLite file that has a `setup_tokens` table with `node:sqlite` and
sets `expires_at` to one millisecond after the epoch, then closes it. It never
runs while a Worker is up. The guide's recovery (stop the Worker, re-run
`pnpm cf:auth:bootstrap`, start it again) is then executed literally.

Alternatives: waiting an hour; injecting a clock (product change).

### D4. Dispatch is driven through the scheduled endpoint
After publication the journey waits past the 5 s debounce and calls
`/__scheduled?cron=*+*+*+*+*` (exactly what the guide documents), then polls
`/api/v1/admin/site-builds`. With the hook at `503`: one hook call, build
`pending` with error `trigger_unavailable`. Doctor `ready` runs here. Then the
hook switches to `200`, and the journey calls the scheduled endpoint once a
second (bounded at 60 s) until the build leaves `pending`; it requires `running`,
`providerBuildId: "acceptance-deploy-1"`, exactly two hook calls total, both
bodiless without cookie/authorization, and the hook URL absent from the build
history JSON.

### D5. Journey order and origins
generate → install → `cf:build` scan → `env:prepare`/`cf:env:prepare` → set
`.env` `LACE_API_BASE_URL`/`LACE_PUBLIC_BASE_URL` and `.dev.vars` origin to the
Worker base, add the hook URL → doctor setup/ready (offline, persistence dir
absent and still absent) → migrate/sync/bootstrap → expire token → start →
admin HTML/asset → browser expired setup → stop → bootstrap again → start →
browser setup/sign-in/media/edit/publish → hook unavailable → doctor ready →
hook recovered → build token (API) → `pnpm build` with the Worker origin →
HTML/media checks → later draft (API) → export unchanged → rebuild → draft
absent → stop/start → persistence checks → stop → secret scan. Doctor runs with
`spawnSync` so its nonzero exits are assertions, and its outputs join the
captured diagnostics.

### D6. Guidance and handoff
Managed `docs/lace-operations.md` Cloudflare section gains "Local journey and
diagnosis" and "Recovery" subsections and a corrected deploy-hook paragraph;
the global doctor paragraph drops "future work" and points to the Cloudflare
section. The user-owned README Cloudflare section adds the origin step and
browser setup. Template `0.13.0` with guidance-only upgrade instructions.
`docs/cloudflare-deployment-handoff.md` is the release-gate procedure (D7 of
the spec); architecture §25 records Cloudflare Pages Git integration as the
reference hook-driven static host and the manual workflow as the direct-upload
alternative.

### D7. Secret scanning reuses consumer-security helpers
`scanTree` over the project (excluding `node_modules`, `.lace/data`,
`.lace/acceptance-packages`, `.env`, `worker/.dev.vars`), `scanTree` over the
Worker bundle and `site/dist`, `assertSecretFree` over Worker output, browser
console text and captured diagnostics. Secret values: auth secret, both setup
tokens, password, session cookies, build token, hook URL.

## Risks / Trade-offs

- [`openssl` absent or lacking `-addext`] → ubuntu runners and macOS LibreSSL
  3.3+ support it; failure is reported as a named acceptance stage.
- [Miniflare's `NODE_EXTRA_CA_CERTS` handling changes in a Wrangler upgrade] →
  the hook-unavailable stage would see TLS errors as `trigger_unavailable` and
  the recovery stage would time out with a clear message; revisit then.
- [Admin UI selector drift] → selectors match the source e2e suite that CI runs
  on every change, so drift fails there first.
- [Jittered retry timing] → bounded polling with the scheduled endpoint; the
  attempt-2 window is at most 10 s.
- [Longer acceptance] → still opt-in (`pnpm acceptance:cloudflare` / labelled
  workflow).

## Migration Plan

Template `0.13.0` guidance-only upgrade from a template of the same site mode
and Cloudflare selection. No package, image, Worker configuration or resource
change. Rollback uses `lace upgrade --rollback`.
