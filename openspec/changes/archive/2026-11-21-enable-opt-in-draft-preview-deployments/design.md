## Context

The Node VPS builder, Node preview transport and Cloudflare GitHub executor
already implement the PV1 lifecycle. Admin preview is gated by a composition
argument currently used by test fixtures. The browser-facing part of the
repository Node development gateway proxies non-API requests to frontend
servers by path. Its default HTTP origin, reference Astro loader, and lack
of a preview executor also prevent a real preview in that mode. Generated
`dev:api` runs the packaged Node API but starts neither the builder nor
HTTPS ingress. The packed acceptance currently supplies its own composition.

## Goals / Non-Goals

**Goals:** Make environment-driven activation the contract of the packaged
runtimes, keep preview request and storage isolation on every supported path,
and prove that the shipped commands and entry points honor it.

**Non-Goals:** A second hosted execution provider, a local Worker runner,
mutable-source rendering, and changes to preview API shapes, migrations,
authorization rules, or publication scheduling.

## Decisions

### 1. Activate at runtime composition

- Read `LACE_PREVIEW_ENABLED` alongside the existing platform settings.
  Only the literal string `true` opts in. Use the same interpretation in
  runtime configuration, Compose, the VPS builder and doctor. Existing
  deploys may already have preview values, so using presence as the opt-in
  would activate prepared installations during an upgrade.
- Derive Admin readiness, viewer/access composition, runner transport and
  preview execution from the same validated configuration in each platform.
  Normal Node and Worker entry points use that decision without setting a
  hard-coded composition override. Convert configuration and deployment tests
  to use environment activation. Narrowly scoped transport or storage
  fixtures can still inject their collaborators.
- Preserve the existing readiness response and permission checks. A disabled
  setting yields `preview-disabled`; an opted-in installation with missing
  or invalid local prerequisites yields `preview-configuration` to callers
  with the existing settings permission. The API performs no provider calls
  for readiness. Doctor uses the existing optional row for local settings,
  selected site/package and ingress prerequisites it can inspect. The
  authenticated smoke build proves the actual integration.
- Track a valid, distinct reserved preview hostname separately from active
  preview settings. Reject it before normal CMS or frontend routing when
  preview is off or incomplete. Exclude collisions with CMS and public site
  hosts from activation without intercepting their normal routes. For
  enabled Node, reserve the browser host before the development gateway's
  HTTP and upgrade proxy selection. The server package continues to enforce
  the allowlisted preview routes, exact request target, live session, and
  runner authentication.

### 2. Reuse the PV1 runner in an explicit Node development variant

- Extend the supported development commands with an explicit preview variant.
  Use `pnpm dev:node -- --preview` in the repository and a generated
  `pnpm dev:api:preview` command alongside `pnpm dev:api`. Use a dev-specific
  Compose override to run the existing services with a private local
  runner and an HTTPS gateway. The variant consumes the same
  `LACE_PREVIEW_ENABLED=true` setting and separately configured local
  endpoints and credentials. Keep the same Compose project and local SQLite
  and SILO data. Use the active HTTPS CMS origin in the existing bootstrap
  and operator workflow. Stop the opt-in services through the same project.
  Normal development commands retain their current startup and need no TLS
  or runner configuration.
- Use a loopback-bound TLS gateway with explicit CMS and preview virtual
  hosts, for example `cms.lace.test` and `preview.lace.test` on the same
  local port. The developer supplies trusted certificate files and local
  name resolution. Preserve the full incoming Host and port, and prevent
  preview-host requests from reaching admin, site or WebSocket upstreams.
  On the CMS host the gateway preserves the repository's frontend reload and
  API routing. Generated projects can still run their Astro development
  server through the existing site command. The API-to-runner and claim
  traffic use private Compose service addresses. Publish no runner or
  object-store ports.
- Reuse `apps/builder` fixed preview source pinning, process supervision,
  staging and upload functions through a preview-only startup mode in the
  existing builder image. In that mode expose only health and the existing
  authenticated preview operations, with scratch storage and a read-only
  Git checkout. Omit the publication token, publication handler, and
  public output mount. Keep the current shared builder and priority behavior
  on VPS. An Astro dev render or a build of arbitrary uncommitted files
  would bypass the PV1 capture and source-selection contract.
- Adopt `lacePreview()` and the preview-aware loader in `apps/site`. Use
  the reference workspace's existing source import strategy for any new
  preview subpaths. Prove the reference site runs from staged source and the
  committed lockfile in a clean scratch tree, with its preview input taking
  precedence over ordinary fixture/live modes. Preserve ordinary fixture,
  live and reload paths. Generated starters already use the preview
  integration. Existing sites continue to opt in with the documented
  static Astro integration.

### 3. Finish supported VPS and Cloudflare wiring

- For repository and generated VPS Compose, forward the activation setting
  to the API and builder. Retain private runner traffic, the separate
  preview Nginx host, SILO namespaces, the public release volume, and the
  configured site base path. Keep API and builder ports off public ingress.
- For deployed Cloudflare, use the standard Worker entry and
  `worker/wrangler.jsonc`. The opt-in goes in vars; dedicated credentials
  use Worker/GitHub secrets. Reuse the existing GitHub dispatch and run
  reconciliation, private `PREVIEW` R2 binding, and separate maintenance
  cron. The preview hostname must route through the Worker with cache bypass.
  The scoped runner protocol uses the CMS origin on Cloudflare. The local
  Worker workflow remains an acceptance environment for the deployed
  configuration.
- Preserve template ownership. Emit new preview assets only for starter
  and existing-site modes, register managed file changes in the normal
  generator inventory, and explain how existing projects merge those
  changes. Do not overwrite the operator's Wrangler config, existing site,
  environment file, DNS records or secrets.

### 4. Verify the shipped integration

Extend `acceptance:draft-preview` to exercise generated Compose development,
VPS ingress and the generated Worker bundle using their real entry points.
For automated local Worker acceptance, replace GitHub responses at the
transport boundary and preserve the generated Worker composition. Use actual
Lace sessions, migrations, private storage and pinned Astro builds. Keep the
existing PV1 lifecycle coverage and add activation/withdrawal coverage.
Run a targeted Chromium journey against the repository Node dev gateway
to cover host-based proxying and frontend reload.

## Risks / Trade-offs

- Local certificates and resolver setup add steps to opt-in. Document a
  reproducible loopback setup and test with a trusted certificate, preserving
  the browser's normal TLS and cookie behavior.
- Worker runtime settings cannot prove a GitHub credential, deployed
  hostname, bucket visibility or cron configuration. Keep those checks
  explicit in setup and hosted smoke evidence. Surface safe provider errors
  through the existing retry path.
- A disabled deployment may retain private objects and provider work.
  Immediate denial is independent of physical runner termination and storage
  deletion. Withdrawal guidance requires resolving outstanding work before
  reactivation. Normal PV1 reconciliation and fencing remain in effect
  when preview is available.

## Migration Plan

Apply the existing PV1 migrations and use a matching package, image and
template set. Upgrade with the flag off, keeping existing data. Configure
the environment's source, ingress, private runner/storage and credentials,
then explicitly enable and verify with a saved-draft smoke build.

To withdraw preview, close preview ingress, disable the flag and roll out
the updated services or Worker. Confirm that existing previews and runner
requests are denied. Finish or terminate the executor using the platform's
existing operating procedure, then revoke the dedicated credentials and
linked sessions if old access must stay revoked on reactivation. Handle
private object cleanup through the documented procedure. Keep the additive
schema and the existing published site and release volumes.
