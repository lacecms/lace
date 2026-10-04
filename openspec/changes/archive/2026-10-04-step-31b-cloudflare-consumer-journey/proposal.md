## Why

Roadmap Step 31, session **31B — Cloudflare consumer journey and deployment
handoff**. Session 31A gave a `--cloudflare` project its own packaged Worker and
proved bundle, setup, login, media and restart persistence through the API. The
consumer journey that matters to an operator is still unproven: browser-first
setup, editing and publication in the packaged admin, scheduled dispatch to the
site's deploy hook, and an Astro build against the generated Worker's published
export. Local diagnosis and recovery (doctor against the local Worker, an
expired setup token, an unavailable hook) are undocumented for consumers, and
the generated guide still says the doctor's Cloudflare path is "future work".
Step 33 needs a concrete real-account deployment handoff, which does not exist.

## What Changes

- The packed Cloudflare consumer acceptance (`pnpm acceptance:cloudflare`)
  extends the 31A journey, still using only the generated project's scripts,
  Worker entry and configuration and the installed packages:
  - local `lace doctor --target cloudflare-local` before migration (setup:
    expected, ready: failed) and against the running Worker (ready: passes with
    API-derived migration evidence), without creating local state;
  - an expired operator setup token is rejected by the browser setup screen
    with safe reissue guidance, setup stays open, and a re-issued token works;
  - first-administrator setup, sign-in, media upload, entry editing and
    publication through the packaged admin in a real browser;
  - an unavailable deploy hook leaves the build pending with the sanitized
    `trigger_unavailable` reason; after the hook recovers, the scheduled handler
    dispatches exactly one bodiless `POST` and the build is recorded as accepted
    (`running` with the provider ID), never as a confirmed successful deploy;
  - the generated Astro site builds against the Worker's authenticated published
    export with Worker-origin media URLs, a later draft does not change the
    export or the HTML, and the build token is absent from the output;
  - restart persistence additionally covers the published export and draft;
  - secret exclusion scans the generated files, Worker bundle, static output,
    Worker log and captured diagnostics for the auth secret, setup tokens,
    password, session, build token and deploy-hook URL.
  The controlled hook is a local HTTPS server whose throwaway certificate the
  local Worker trusts only for the acceptance process.
- The generated operations guide (managed) and README Cloudflare sections
  document the complete local journey: pointing `.env` at the local Worker,
  browser setup, build token and site build, `lace doctor --target
  cloudflare-local|cloudflare-remote`, and recovery for an expired setup token,
  an unavailable or rejected deploy hook (scheduled retries, terminal failure,
  Admin retry), restarts and local reset. They state that deploy hooks exist only
  for a Git-connected Pages project (or another provider's bodiless build hook),
  that the manual direct-upload workflow is not triggered by the hook, and that a
  provider accepting a hook is not a confirmed deployment. The stale "future
  work" doctor wording is removed.
- Template version `0.13.0` with guidance-only upgrade instructions; snapshots
  regenerated.
- New repository document `docs/cloudflare-deployment-handoff.md`: the
  real-account deployment procedure and prerequisites for the Step 33 release
  gate — account and API-token permissions, resources and IDs to record,
  secrets and variables, Worker deploy, Pages Git integration and deploy hook,
  evidence to capture and pass criteria — stating that local tests are not real
  Cloudflare deployment acceptance.
- Architecture: the reference static-hosting provider (Cloudflare Pages Git
  integration for hook-driven rebuilds) is selected; roadmap marks 31B.
- The generated-acceptance CI workflow installs the Playwright Chromium browser.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generated-project-acceptance`: the packed Cloudflare consumer journey covers
  browser setup, editing, publication, scheduled hook dispatch, Astro build,
  draft isolation, doctor, expired bootstrap, unavailable hook, persistence and
  secret exclusion.
- `generated-project-onboarding`: the Cloudflare Worker section documents the
  local journey, local/remote doctor, recovery and the deploy-hook provider
  prerequisite.
- `project-generator`: template `0.13.0` guidance upgrade.
- `cloudflare-consumer-worker`: a real-account deployment handoff exists and
  local acceptance is not claimed as real deployment acceptance.

## Impact

- Architecture §6 Cloudflare deployment and §25 open release choices
  (static-hosting provider); roadmap Step 31.
- Code: `scripts/cloudflare-consumer-acceptance.mjs`,
  `scripts/generated-project-acceptance.mjs` (operations passed to the journey),
  `packages/create-lace` (templates, version, upgrade instructions, tests),
  `packages/cli/src/upgrade-command.test.mjs` (version expectations),
  `tests/fixtures/generated-project/*`, `.github/workflows/generated-project-acceptance.yml`,
  new `docs/cloudflare-deployment-handoff.md`.
- Dependencies: none new. Acceptance uses the workspace's existing Playwright
  (from `@lacecms/app-admin`) and the system `openssl` for the throwaway
  certificate; neither is a consumer dependency.
- Depends on 31A (packaged Worker), 28A (browser setup), 27A (doctor), 22C
  (deploy-hook trigger) and Step 30 (rendering core in the starter).
- Non-goals: Worker runtime, API, CLI or doctor behavior changes; polling a
  provider for terminal deploy status; any real Cloudflare account mutation or
  verification (Step 33); publishing artifacts; Workers Builds or CI for the
  Worker.
