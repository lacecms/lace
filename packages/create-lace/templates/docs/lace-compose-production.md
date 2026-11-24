# Docker Compose production

<!-- lace-site: starter existing -->

Run Lace on a server with Docker Compose: the packaged API/admin, SILO, the dispatcher, the fixed-command builder and the web proxy, from the same managed files as development.
<!-- lace-site: end -->
<!-- lace-site: none -->

Run Lace on a server with Docker Compose: the packaged API/admin, SILO, the dispatcher and the web proxy, from the same managed files as development.
<!-- lace-site: end -->

**Working directory:** the CMS installation root on the server that contains `package.json`, `lace.config.ts` and this `docs/` directory (for example `cms/`). Run every command from there.

<!-- lace-site: starter existing -->

**Result:** the CMS at your public origin, and a static site served by the web proxy after each successful fixed-command build. Publication queues a build; a failed build keeps the previous release online.

<!-- lace-site: end -->
<!-- lace-site: none -->

**Result:** the CMS at your public origin. This project builds no site: the web proxy serves `/admin/`, `/api/` and `/health/`, and `/` reports that no site build exists yet.

<!-- lace-site: end -->

<!-- lace-site: starter -->

Site mode: **starter**. The builder builds the generated `site/` (source root `.`, site directory `site`).
<!-- lace-site: end -->
<!-- lace-site: existing -->

Site mode: **existing site** at `{{SITE_PATH}}`. The builder mounts it read-only as a standalone Astro root; the generator did not modify it.
<!-- lace-site: end -->
<!-- lace-site: none -->

Site mode: **none**. Compose defines no builder and build requests fail until a site is configured.
<!-- lace-site: end -->

This guide does not depend on the development guide; it repeats the one-time initialization because production uses its own `.env`, origins and data.

## Prerequisites

- A server with Docker, Compose and a running daemon, plus Node `>=24.12.0` and pnpm `>=12` for the host operator commands (see [tested versions](https://github.com/lacecms/lace/blob/main/docs/compatibility.md#minimum-requirements-and-tested-versions)).
- Compatible API and builder images for your Lace release (`1.1.0` or a later compatible release). Pin exact tags or digests; the packages in `package.json` must come from the same release.
- A public HTTPS origin and a TLS-terminating reverse proxy that forwards to `127.0.0.1:8080` by default (or the configured Nginx binding). The web proxy routes `/admin`, `/api/` and `/health/` to the API and everything else to the static site, so one origin can serve both.

<!-- lace-site: starter -->

- A committed `pnpm-lock.yaml` at this root: the builder installs `site/` with a frozen lockfile from the read-only source mount.

<!-- lace-site: end -->
<!-- lace-site: existing -->

- Your site at `{{SITE_PATH}}` connected as described in the [development guide](lace-compose-dev.md#connect-and-build-your-site), with its own committed `pnpm-lock.yaml`: the builder installs it with a frozen lockfile from the read-only source mount.

<!-- lace-site: end -->

## Install and prepare the environment

One-time:

```bash
pnpm install
pnpm env:prepare
```

Preparation creates a protected `.env` with fresh random `LACE_AUTH_SECRET`, storage and builder credentials. It refuses to overwrite an existing `.env`. Never copy a development `.env` to production; back up `.env` privately, because losing `LACE_AUTH_SECRET` invalidates sessions and losing storage credentials blocks media access.

Review `.env`:

- `LACE_PUBLIC_BASE_URL`: the public HTTPS origin users and browsers reach, with a trailing slash, for example `https://cms.example.com/`. Admin login, authentication and rendered media URLs use it.
- `LACE_API_BASE_URL`: set this to the public HTTPS origin for host commands and manual Astro builds. The Compose builder always uses the internal `http://api:3000/`.
- `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE`: the exact compatible images.
- `LACE_HTTP_BIND_ADDRESS` and `LACE_HTTP_PORT`: Nginx host binding, default `127.0.0.1:8080`. `LACE_API_PORT` is only for local development. The production API has no host port.

Configure your host TLS proxy before setup and forward HTTPS traffic to the loopback Nginx upstream. For a proxy on another machine or Docker host interface, explicitly set `LACE_HTTP_BIND_ADDRESS` to the controlled interface and restrict access with a firewall. Alternatively, attach a containerized proxy to the frontend network with operator-owned Compose configuration and target `web:8080`; restrict that network to trusted services. Terminate TLS at the proxy in either topology. Review the resolved model with `docker compose config`.

<!-- lace-site: starter existing -->

- Build site: `LACE_BUILD_SOURCE_ROOT`, `LACE_BUILD_SITE_DIR`, `LACE_BUILD_OUTPUT_DIR`, `LACE_BUILD_SITE_ID` and `LACE_BUILD_SITE_LABEL` select what the builder builds; see [Selecting the build site](lace-operations.md#selecting-the-build-site).
- Site output: set `LACE_BUILD_SITE_URL` to the public site URL so pages get canonical URLs and the build writes `sitemap.xml`; set `LACE_SITE_INDEXING=off` on a staging installation to keep it out of search engines.

<!-- lace-site: end -->

See [Switch the object storage image](lace-operations.md#switch-the-object-storage-image) for the optional `LACE_MINIO_IMAGE` Compose override and the backup and recovery steps for existing media.

## Initialize the CMS

Host database commands share the SQLite file with the Compose `api` and `dispatcher` services: run them only while those services are stopped (see the [development guide](lace-compose-dev.md#prepare-the-database-and-start-the-cms)). On a fresh server nothing runs yet.

One-time:

```bash
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm db:migrate
pnpm content:sync
pnpm auth:bootstrap
docker compose up -d web
```

`docker compose up -d web` starts Nginx and its API, SILO, migration and output initialization dependencies, without starting the builder or dispatcher. Bootstrap prints one setup token that expires after one hour.

Open `<LACE_PUBLIC_BASE_URL>admin/`, create the first administrator on the setup screen with the bootstrap token and sign in. To avoid putting credentials in shell history, use the browser or the [private-input setup script](lace-operations.md#migrate-sync-and-create-the-first-administrator).

<!-- lace-site: starter existing -->

In Settings create a read-only build token and put its one-time value into `LACE_BUILD_TOKEN` in `.env`; never expose it to browsers.

<!-- lace-site: end -->

## Start the full stack

```bash
pnpm prod:start
docker compose ps
```

Wait until `docker compose ps` lists every service as running (`healthy` where a health check exists) and `/health/ready` at your public origin answers `ready`.

<!-- lace-site: starter existing -->

`pnpm prod:start` recreates the services with the build token and starts the dispatcher, the fixed-command builder and the web proxy. The builder mounts the selected source read-only, runs a frozen install and `astro build`, and switches the served release only after a complete static output exists. Publication queues a build; request one in Builds if an earlier publication was already processed. Only **Succeeded** proves the release switched; the new release can be served a moment before Builds records it. Browsers revalidate pages because the proxy sends `Cache-Control: no-cache`; the content-hashed files under `/_astro/` (scripts, styles and image variants) are cached for 30 days instead. The builder keeps the pnpm store and the Astro image cache in the `builder-cache` volume, so later builds download and convert only what changed; it clears that cache above 2 GiB and drops the Astro part after a failed build.

<!-- lace-site: end -->
<!-- lace-site: none -->

`pnpm prod:start` starts the dispatcher and the web proxy; there is no builder and build requests fail as unavailable until a site is configured.

<!-- lace-site: end -->

While the services run, `/health/ready` is the readiness authority: the API keeps SQLite in write-ahead-log mode, which doctor's `ready` stage refuses to inspect, so it reports the database as unavailable. To run it, stop the database users and switch the journal mode first as described in [doctor limits](lace-operations.md#read-only-environment-checks).

<!-- lace-site: starter existing -->

## Prepare protected draft preview

Preview is off by default. Apply the forward migrations and keep the API and
builder images on the same release. Configure the following prerequisites
before opting in.

<!-- lace-site: starter -->

The default `LACE_BUILD_SOURCE_ROOT=.` and `LACE_BUILD_SITE_DIR=site` select the
starter. The starter already includes the Astro preview integration.

<!-- lace-site: end -->
<!-- lace-site: existing -->

The default `LACE_BUILD_SOURCE_ROOT={{SITE_PATH}}` and `LACE_BUILD_SITE_DIR=.`
select the existing Astro root. If that site is a workspace member, mount its
Git and lockfile root and set `LACE_BUILD_SITE_DIR` to the member's relative
path. Follow [Adopt protected draft preview](lace-astro-site.md#adopt-protected-draft-preview)
in the existing site.

<!-- lace-site: end -->

The mount must be a clean Git checkout at its repository root with a committed
`pnpm-lock.yaml`. Commit the selected source before preview. Use regular
source files without symlinks, submodules or Git LFS pointers.

Set these non-secret values in the root `.env`, using your actual origins
and the site's public base path.

```dotenv
LACE_PREVIEW_ENABLED=true
LACE_PUBLIC_BASE_URL=https://cms.example.com/
LACE_PREVIEW_HOST=preview.example.com
LACE_PREVIEW_ORIGIN=https://preview.example.com/
LACE_BUILD_SITE_URL=https://site.example.com/journal/
```

Set independent random `LACE_PREVIEW_BUILDER_SECRET` and
`LACE_PREVIEW_RUNNER_SECRET` values privately in the same ignored file.
Configure DNS and TLS for the distinct preview hostname and forward it to
`web` with the original Host header and with caching bypassed. The generated
`deploy/nginx-preview.conf` forwards preview access to the API. Compose
wires private API-to-builder and runner-to-API URLs and uses private S3.
Keep that traffic and storage off public ingress. The preview package uses
private storage and the published site keeps its own static release.

During a maintenance window, run
`pnpm exec lace doctor --target node --mode compose --stage setup` and review
the `preview` row. Run `pnpm prod:start` to recreate changed services with
the new setting. Sign in and create a saved-draft preview to verify delivery. Publication gets the next builder slot. A running
preview has up to 10 minutes for execution and upload, within 15 minutes
overall. Ready output expires after 24 hours. Fix source, storage or timeout
issues and choose **Retry preview** on the current saved revision.

To withdraw, close preview ingress, set `LACE_PREVIEW_ENABLED=false` and
recreate the API, dispatcher and builder. Confirm old viewer and runner
requests are denied. During maintenance, stop outstanding preview work and
confirm termination before re-enabling. Revoke the dedicated credentials
if old access must remain revoked. Use **Sign out everywhere** for
affected accounts to revoke linked preview sessions. Clean private preview
objects after access and execution stop. Keep the public release and use the
usual database and storage backup procedure.

<!-- lace-site: end -->

## Configure email (optional)

Account email is disabled until you set `LACE_EMAIL_PROVIDER` in `.env`. Use `smtp` with STARTTLS or implicit TLS, or `resend` with `LACE_RESEND_API_KEY`, plus `LACE_EMAIL_FROM`; see [Email delivery](lace-operations.md#email-delivery). Run `pnpm exec lace doctor --target node --mode compose`, recreate the API with `docker compose up -d --force-recreate api`, then send a test from Settings → Email delivery.

## Repeat operations

After editing `lace.config.ts` or upgrading packages/images, stop the database users, run the explicit command and start again:

```bash
docker compose stop api dispatcher
pnpm db:migrate
pnpm content:sync
pnpm prod:start
```

`pnpm content:sync --check` previews changes without writing. To change images, update `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE` together with the matching packages, then run the sequence above.

Follow the [coordinated backup procedure](lace-operations.md#coordinated-sqlite-and-object-storage-backup) before upgrades. `pnpm prod:stop` stops everything and keeps `.lace/data/`, `minio-data` and static-output volumes. Never use `docker compose down --volumes` on production data.

## Recovery

<!-- lace-site: starter existing -->

- **Build failed.** Builds shows a sanitized cause, its correction and, for source problems, a source entry relative to the installation root (for example a rejected symbolic link, an unreadable or missing entry, a frozen-install failure or an Astro build error). The previous complete release stays online and the publication stays committed. Correct the source, lockfile or settings and use **Retry build**; automatic retries stop after eight attempts. Details: [builder source diagnostics](lace-operations.md#builder-source-diagnostics).
- **Reset the build cache.** Run `docker compose rm --stop --force builder`, remove the `<project>_builder-cache` volume with `docker volume rm` and start the builder again with `pnpm prod:start`. The next build downloads packages and converts every image again.
- **Builder cannot see the source.** Correct the host bind and permissions for `LACE_BUILD_SOURCE_ROOT`, then `docker compose up -d --force-recreate api dispatcher builder`.

<!-- lace-site: end -->

- **Setup token expired.** Stop `api` and `dispatcher`, run `pnpm auth:bootstrap` again, start with `docker compose up -d web` and retry. After setup completes, bootstrap refuses; sign in instead.
- **Login or media URLs use the wrong host.** Correct `LACE_PUBLIC_BASE_URL` and the reverse proxy, then recreate the services.
- **Publications stop triggering builds after a host command.** Restart `api` and `dispatcher`.

## Next steps

- Extend models, routes and blocks: [configuration, routes, renderers and styling](lace-operations.md#configuration-routes-renderers-and-styling).

<!-- lace-site: starter existing -->

- Understand when visitors see a publication: [when published content becomes visible](lace-operations.md#when-published-content-becomes-visible).

<!-- lace-site: end -->
<!-- lace-site: none -->

- Connect a site later: [Selecting the build site](lace-operations.md#selecting-the-build-site).

<!-- lace-site: end -->
<!-- lace-cloudflare: on -->

- Run the CMS on Cloudflare instead: [Cloudflare](lace-cloudflare.md).

<!-- lace-cloudflare: end -->

## Trusted client identity

The API ignores forwarding headers unless its immediate TCP peer matches
`LACE_TRUSTED_PROXY_CIDRS` (comma-separated IPv4/IPv6 CIDRs). Empty is the secure
default: clients behind one proxy share the authentication/setup IP limit. Upload
and token-management limits use the authenticated user even behind a shared proxy.
Better Auth and Lace use the same resolved client identity. Missing transport
identity uses a conservative shared fallback; arbitrary headers cannot replace it.

Before exposing a proxy deployment, identify the ingress proxy address/subnet on
its isolated Docker network, set only that controlled subnet in your user-owned
`.env`, and recreate `api` and `dispatcher`. Inspect the proxy's network addresses
with `docker inspect --format '{{json .NetworkSettings.Networks}}' <web-container>`;
choose the configured network CIDR, not an unrelated private range. Restrict direct
API ingress so untrusted services cannot impersonate a trusted peer. Do not trust
all addresses or an entire shared corporate/container network. The proxy must
append the observed peer to X-Forwarded-For or replace that header; Lace walks the
chain from the trusted end and stops at the first untrusted address. Hostnames,
ports and malformed chains are not client addresses. Local TLS/proxy tests do not
confirm your deployed ingress configuration.

Upgrading a template never edits your `.env`; add this setting explicitly when
needed. On Cloudflare the Worker ingress uses the edge-supplied CF-Connecting-IP;
direct calls to the internal runtime do not establish that trust. Restrict any
same-zone Worker subrequests that can rewrite client-IP headers at your ingress.

## Backup, rotation and observation

Follow [Operator observation and recovery](lace-operations.md#operator-observation-and-recovery) for the CMS release card, health/log meanings, coordinated database/object backup, isolated restore, credential rotation and migration/upgrade recovery. Verify the whole restored site before trusting a backup. Remote account operations remain owner-operated.

## Optional API documentation UI

For a Lace release containing the API documentation UI, set
`LACE_API_DOCS_ENABLED=true` in `.env` and recreate the API container with
`docker compose up -d --force-recreate api`. Open `/api/docs` on your API origin.
The page is public when enabled; interactive requests keep normal API permission,
validation and concurrency checks and use existing same-origin sessions. The
browser needs `cdn.jsdelivr.net` access for a pinned Scalar script. No external
request proxy or prefilled/persisted credentials are configured; telemetry,
remote fonts and optional hosted integrations are disabled.

Absent or exact `false` disables the page (API `404`); other values, including an
empty string, are invalid. `/api/v1/openapi.json` remains available. Set `false`
and recreate the container again to disable.
