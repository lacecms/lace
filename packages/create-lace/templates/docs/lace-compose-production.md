# Docker Compose production

<!-- lace-site: starter existing -->

Run Lace on a server with Docker Compose: the packaged API/admin, MinIO, the dispatcher, the fixed-command builder and the web proxy, from the same managed files as development.
<!-- lace-site: end -->
<!-- lace-site: none -->

Run Lace on a server with Docker Compose: the packaged API/admin, MinIO, the dispatcher and the web proxy, from the same managed files as development.
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

- A server with Docker, Compose and a running daemon, plus Node `>=24.12.0` and pnpm `>=12` for the host operator commands (tested baseline: Node `24.12.0`, pnpm `12.3.4`).
- Compatible API and builder images for your Lace release (`0.1.0-alpha.4` or a later compatible release; published `0.1.0-alpha.2` images lack builder source diagnostics and the seven-status build history). Pin exact tags or digests; the packages in `package.json` must come from the same release.
- A public HTTPS origin and a TLS-terminating reverse proxy that forwards to `LACE_HTTP_PORT`. The web proxy routes `/admin`, `/api/` and `/health/` to the API and everything else to the static site, so one origin can serve both.

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

Preparation creates a protected `.env` with fresh random `LACE_AUTH_SECRET`, MinIO and builder credentials. It refuses to overwrite an existing `.env`. Never copy a development `.env` to production; back up `.env` privately, because losing `LACE_AUTH_SECRET` invalidates sessions and losing MinIO credentials blocks media access.

Review `.env`:

- `LACE_PUBLIC_BASE_URL`: the public HTTPS origin users and browsers reach, with a trailing slash, for example `https://cms.example.com/`. Admin login, authentication and rendered media URLs use it.
- `LACE_API_BASE_URL`: the origin host commands and manual Astro builds use for the authenticated export. The Compose builder always uses the internal `http://api:3000/`.
- `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE`: the exact compatible images.
- `LACE_API_PORT` and `LACE_HTTP_PORT`: host ports. Expose only your reverse proxy publicly and restrict direct access to these ports.

<!-- lace-site: starter existing -->

- Build site: `LACE_BUILD_SOURCE_ROOT`, `LACE_BUILD_SITE_DIR`, `LACE_BUILD_OUTPUT_DIR`, `LACE_BUILD_SITE_ID` and `LACE_BUILD_SITE_LABEL` select what the builder builds; see [Selecting the build site](lace-operations.md#selecting-the-build-site).

<!-- lace-site: end -->

## Initialize the CMS

Host database commands share the SQLite file with the Compose `api` and `dispatcher` services: run them only while those services are stopped (see the [development guide](lace-compose-dev.md#prepare-the-database-and-start-the-cms)). On a fresh server nothing runs yet.

One-time:

```bash
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm db:migrate
pnpm content:sync
pnpm auth:bootstrap
pnpm dev:api
```

`pnpm dev:api` starts only MinIO, the migration service and the API/admin, so you can create the administrator before the builder needs a token. Bootstrap prints one setup token that expires after one hour.

Open `<LACE_PUBLIC_BASE_URL>admin/`, create the first administrator on the setup screen with the bootstrap token and sign in. To avoid putting credentials in shell history, use the browser or the [private-input setup script](lace-operations.md#migrate-sync-and-create-the-first-administrator). In Settings create a read-only build token and put its one-time value into `LACE_BUILD_TOKEN` in `.env`; never expose it to browsers.

## Start the full stack

```bash
pnpm prod:start
docker compose ps
```

Wait until `docker compose ps` lists every service as running (`healthy` where a health check exists) and `/health/ready` at your public origin answers `ready`.

<!-- lace-site: starter existing -->

`pnpm prod:start` recreates the services with the build token and starts the dispatcher, the fixed-command builder and the web proxy. The builder mounts the selected source read-only, runs a frozen install and `astro build`, and switches the served release only after a complete static output exists. Publication queues a build; request one in Builds if an earlier publication was already processed. Only **Succeeded** proves the release switched; the new release can be served a moment before Builds records it. Browsers revalidate because the proxy sends `Cache-Control: no-cache`.

<!-- lace-site: end -->
<!-- lace-site: none -->

`pnpm prod:start` starts the dispatcher and the web proxy; there is no builder and build requests fail as unavailable until a site is configured.

<!-- lace-site: end -->

While the services run, `/health/ready` is the readiness authority: the API keeps SQLite in write-ahead-log mode, which doctor's `ready` stage refuses to inspect, so it reports the database as unavailable. To run it, stop the database users and switch the journal mode first as described in [doctor limits](lace-operations.md#read-only-environment-checks).

## Repeat operations

After editing `lace.config.ts` or upgrading packages/images, stop the database users, run the explicit command and start again:

```bash
docker compose stop api dispatcher
pnpm db:migrate
pnpm content:sync
pnpm prod:start
```

`pnpm content:sync --check` previews changes without writing. To change images, update `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE` together with the matching packages, then run the sequence above.

Backups: with `api` and `dispatcher` stopped, copy `.lace/data/` (the SQLite database) and back up the MinIO data volume with your volume tooling, together with `.env`. `pnpm prod:stop` stops everything and keeps `.lace/data/`, MinIO and static-output volumes. Never use `docker compose down --volumes` on production data.

## Recovery

<!-- lace-site: starter existing -->

- **Build failed.** Builds shows a sanitized cause, its correction and, for source problems, a source entry relative to the installation root (for example a rejected symbolic link, an unreadable or missing entry, a frozen-install failure or an Astro build error). The previous complete release stays online and the publication stays committed. Correct the source, lockfile or settings and use **Retry build**; automatic retries stop after eight attempts. Details: [builder source diagnostics](lace-operations.md#builder-source-diagnostics).
- **Builder cannot see the source.** Correct the host bind and permissions for `LACE_BUILD_SOURCE_ROOT`, then `docker compose up -d --force-recreate api dispatcher builder`.

<!-- lace-site: end -->

- **Setup token expired.** Stop `api` and `dispatcher`, run `pnpm auth:bootstrap` again, start with `pnpm dev:api` and retry. After setup completes, bootstrap refuses; sign in instead.
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
