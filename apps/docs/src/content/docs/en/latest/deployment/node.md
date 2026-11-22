---
title: Deploy on Docker or a VPS
description: Run the packaged Node CMS with SQLite and SILO, a private static-site builder and a web proxy on your own server.
kind: guide
verifiedAgainst: 1.0.0
---

The generated Docker Compose topology runs the packaged API and Admin, SQLite, a private S3 bucket served by SILO, a dispatcher, a fixed-command site builder and an Nginx web proxy on one server. Publishing content queues a site build; the builder rebuilds your Astro site and switches the served release only after a successful build. This guide prepares a server, starts the stack, configures builds, uploads, email and the proxy, and verifies the result.

## Before you start

- A generated project that works locally; see [Start with Lace](../../getting-started/). Keep its generated `docs/lace-compose-production.md`: it names your site mode and storage mappings.
- A server with Docker, Compose and a running daemon, plus Node **>=24.12.0** and pnpm **>=12** for the host operator commands.
- Lace packages, API image and builder image from the same release, pinned by exact tag or digest. Deploying the Lace engine repository is not the installation path.
- A public HTTPS origin and a TLS-terminating reverse proxy that forwards to Nginx at `127.0.0.1:8080` by default.
- A committed `pnpm-lock.yaml` for the site, because the builder installs it with a frozen lockfile.

## Prepare the server environment

Copy the project to the server and run `pnpm install` and `pnpm env:prepare` there. Preparation creates a protected `.env` with fresh secrets and refuses to overwrite an existing one. Never reuse a development `.env` in production, and back up `.env` privately: losing `LACE_AUTH_SECRET` invalidates sessions and losing the object storage credentials blocks media access.

Review `.env`:

- `LACE_PUBLIC_BASE_URL`: the public HTTPS origin with any intended path prefix and a trailing slash, for example `https://cms.example.com/`. Admin sessions, sign-in links and media URLs use it; it must match your reverse proxy.
- `LACE_API_BASE_URL`: set this to the public HTTPS origin for host commands and manual Astro builds. The Compose builder always uses the internal `http://api:3000/`.
- `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE`: the exact compatible images.
- `LACE_MINIO_IMAGE`: optional full storage image reference. Unset or empty selects the pinned classic SILO image. See [Switch the object storage image](#switch-the-object-storage-image) before changing an existing installation.
- `LACE_HTTP_BIND_ADDRESS` and `LACE_HTTP_PORT`: Nginx binding, default `127.0.0.1:8080`. `LACE_API_PORT` is only for local development; production does not publish the API.

Configure the host TLS proxy before setup. For a remote proxy, explicitly bind Nginx to a controlled host interface and restrict it with a firewall. A container proxy can instead join the frontend network using operator-owned Compose configuration and target `web:8080`; restrict access to that network. Terminate TLS at the proxy and review `docker compose config`.

- `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`: the public site URL for canonical URLs and `sitemap.xml`, and `off` on a staging installation.

Keep SQLite data (`.lace/data/`) and the `minio-data` volume persistent. Do not publish the storage service or the builder's private endpoint to browsers.

## Initialize the CMS

On a fresh server nothing runs yet. Run:

```sh
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm db:migrate
pnpm content:sync
pnpm auth:bootstrap
docker compose up -d web
```

`docker compose up -d web` starts Nginx and its API, SILO and initialization dependencies without the builder or dispatcher, so you can create the first administrator before the builder needs a token. Open `<LACE_PUBLIC_BASE_URL>admin/`, create the administrator with the one-time setup token and sign in. Bootstrap only an uninitialized installation. Copying project files to a server does not move a local database or media: a new server starts with empty content.

In **Settings**, create a read-only build token and put its value into `LACE_BUILD_TOKEN` in `.env`. It never belongs in browser-visible variables.

## Start the full stack

```sh
pnpm prod:start
docker compose ps
```

Wait until every service is running (healthy where a health check exists) and `/health/ready` at your public origin answers. `pnpm prod:start` starts the dispatcher, the builder and the web proxy. Until the first successful build, the site answers `503 Site build pending`: publish content or select **Request build** in Admin **Builds**. `pnpm prod:stop` stops the stack and keeps the database, media and static-output volumes. Never use `docker compose down --volumes` on production data.

Host commands that open the database (`db:migrate`, `content:sync`, `auth:bootstrap`) must run while `api` and `dispatcher` are stopped (`docker compose stop api dispatcher`). Ordinary restarts preserve data; never recreate volumes to work around a dependency or cache problem.

## Switch the object storage image

Compose pulls or reuses a digest-pinned classic SILO image. A compatible
`LACE_MINIO_IMAGE` override must accept the existing server command,
credentials and disk format and include a shell and curl for the health check.

1. Record the previous storage server's image and ID and keep a local copy.
   Record the Compose project, actual named volume mounted at `/data` on
   `minio`, bucket and representative Lace media IDs and SHA-256 checksums.
   Preserve project identity, volume, bucket and credentials. Review the
   managed Compose update and removal of the old Dockerfile using
   [the upgrade plan](../../operations/#upgrade-and-roll-back). Pre-pull the
   full selected image reference before downtime.
2. Restrict ingress to the operator, pause writers and background work and
   wait for in-flight work to settle. Run `pnpm prod:stop`. Privately back up
   the full stopped media volume (including server metadata), matching SQLite
   state and deployment configuration. Preserve ownership and permissions.
3. Apply the managed update after resolving any conflicts. Run
   `docker compose up -d --wait web` and check readiness and authenticated
   downloads of the recorded media by ID against their hashes. Upload and
   download a sample image. Run `docker compose restart minio` and repeat the
   readbacks once storage is healthy. Then run `pnpm prod:start` and reopen
   ingress. For local installations use the generated development guide and
   its `pnpm dev:stop` and `pnpm dev:api` commands.
4. If the new server fails or media differs, stop it and keep writers paused.
   Restore the saved media volume and matching SQLite/configuration, select
   the retained prior image in `.env` and verify the original data before
   reopening traffic. A template rollback does not restore storage metadata.
   If the selected image is unavailable, fix registry access or the reference
   without removing the data volume.

## Configure automatic builds

The builder uses a fixed command and fixed mounts defined by its image. It mounts the selected site source read-only, runs a frozen install and `astro build`, and ignores any command, path or environment supplied with a build request. `LACE_BUILD_SOURCE_ROOT`, `LACE_BUILD_SITE_DIR`, `LACE_BUILD_OUTPUT_DIR`, `LACE_BUILD_SITE_ID` and `LACE_BUILD_SITE_LABEL` select what it builds; the generated `docs/lace-operations.md` explains selecting the build site.

Publication queues work through a durable outbox, and the dispatcher triggers the builder. Nearby publications coalesce into one build. The builder stages a release, builds it and switches the served output atomically after success; a failed build keeps the previous release online. **Builds** records the result; the new release can be served a moment before its success is recorded, and only **Succeeded** proves the switch. Changes to site code or CSS also need a build: deploy the new source, then **Request build**.

## Prepare protected draft preview

Use the starter or [adopt the integration in your existing site](../../astro-integration/#adopt-protected-draft-preview).
Apply the forward database migrations and use matching packages and images.
Preview is off by default. Generated projects can use either a loopback
development stack or the shared VPS builder.

1. Mount the root of your clean Git checkout as `LACE_BUILD_SOURCE_ROOT`.
   The builder pins its current commit and installs the committed lockfile.
   Set `LACE_BUILD_SITE_DIR=site` for the starter and `.` when a standalone
   Astro site is the mounted root. For a workspace select the member
   directory relative to that root. Commit relevant tracked and untracked
   site changes before requesting preview. Use regular files and a full
   checkout with no submodules, LFS pointers or source symlinks.
2. In the private Compose `.env`, set `LACE_PREVIEW_HOST=preview.example.com`,
   `LACE_PREVIEW_ORIGIN=https://preview.example.com/` and
   `LACE_BUILD_SITE_URL=https://example.com/journal/`, replacing the example
   values and retaining any public base path. Set `LACE_PUBLIC_BASE_URL` to
   the distinct HTTPS CMS origin. Generate independent random values for
   `LACE_PREVIEW_BUILDER_SECRET` and `LACE_PREVIEW_RUNNER_SECRET`. Keep them
   outside source control and site build variables.
3. Configure DNS and TLS for the preview hostname. Forward it to the
   generated Nginx `web` service with the original Host header and cache
   bypass. The generated preview vhost forwards viewer and handoff requests
   to the API. Compose supplies the private API and builder URLs on the
   internal network and uses the private S3 bucket for preview objects.
   Keep the builder, runner ingress and object storage private. Sibling HTTPS
   hosts support the embedded viewer. Separate sites use **Open in new tab**.
4. Set `LACE_PREVIEW_ENABLED=true` in the ignored Compose `.env` and run
   `pnpm exec lace doctor --target node --mode compose --stage setup`
   during a database maintenance window. Its `preview` row reports local
   prerequisites. For native composition, supply the internal
   `LACE_PREVIEW_RUNNER_ORIGIN` and `LACE_PREVIEW_BUILDER_URL` yourself and
   check the builder source on its host. An authorized test build is needed
   to verify ingress, S3 delivery and rendering. Recreate the changed
   services with `pnpm prod:start`, then create a preview in Admin.

The builder shares one physical slot with publication. Pending publication
gets the next slot, and a running preview can finish within its deadline.
If a preview is busy, wait for the running work. For a source, storage or
timeout failure, fix the cause and retry from the saved entry. See the
[preview lifetime and retry rules](../../editing-content/#preview-a-saved-draft).

To withdraw, close preview ingress, set `LACE_PREVIEW_ENABLED=false` and
recreate the API, dispatcher and builder. Confirm old viewer and runner
requests are denied. Resolve outstanding builds and confirm termination
before re-enabling. Revoke dedicated credentials if old access must remain
revoked. Use **Sign out everywhere** for affected accounts to
revoke the Lace sessions that authorize preview. Remove private preview
objects after access is closed and builds have stopped. Keep the public
release volume and follow the normal database and storage backup procedure.

### Local HTTPS preview

Follow the generated `docs/lace-compose-dev.md` to configure locally trusted
TLS for `cms.lace.test` and `preview.lace.test`, resolved to `127.0.0.1`.
Set `LACE_PREVIEW_ENABLED=true` and the two local preview credentials in
the ignored `.env`. Commit the Astro source and lockfile, then start
`pnpm dev:api:preview` and open `https://cms.lace.test:3443/admin/`.
The local runner and SILO have no host ports, and the ordinary Astro
development server remains available through `pnpm dev`. Stop with
`pnpm dev:stop`. Restore the ordinary HTTP URLs and run `pnpm dev:api`
after disabling the flag to return to HTTP development.

## Configure uploads and build caches

The managed `deploy/nginx.conf` streams media uploads with an 11 MiB multipart allowance, while the API enforces the 10 MiB image limit; other requests keep a 1 MiB body limit. After merging upgrade changes to this file, recreate the web service and verify an upload of a valid image larger than 1 MiB through the public origin.

HTML responses revalidate with `Cache-Control: no-cache`. Only successful content-hashed `/_astro/` files (scripts, styles and image variants) are cached for thirty days with `public, max-age=2592000, immutable`; missing assets are not. The proxy refuses `/_headers`.

Compose mounts a separate `builder-cache` volume for the pnpm store and the Astro image cache, so later builds only convert changed images. It is disposable and never part of a release or a backup. The builder clears it above 2 GiB and drops its Astro part after a failed build; an unusable cache falls back to an uncached build. To reset it, remove the builder container and the `<project>_builder-cache` volume, then run `pnpm prod:start`. Never remove database or media volumes to reset a cache.

## Trust your reverse proxy

Rate limits and the setup and sign-in protections use the client address. The API ignores forwarding headers unless its direct peer matches `LACE_TRUSTED_PROXY_CIDRS`, a comma-separated list of IPv4/IPv6 CIDRs. Empty is the secure default; then all clients behind your proxy share one address for these limits. Set only the controlled subnet of your ingress proxy (inspect it with `docker inspect --format '{{json .NetworkSettings.Networks}}' <web-container>`), never all addresses or a shared network, and recreate `api` and `dispatcher`. Your proxy must append the observed client to `X-Forwarded-For` or replace that header. Upgrades never edit `.env`, so add this setting yourself.

## Configure email

Account email is optional and disabled until you set `LACE_EMAIL_PROVIDER`. Use `smtp` (STARTTLS by default, or implicit TLS) or `resend`, together with `LACE_EMAIL_FROM` and the provider's settings. Recreate the API with `docker compose up -d --force-recreate api`, then use **Settings → Email delivery → Send test email**, which sends to your own address. Without a provider, invitation and administrator password-reset links are shown once in Admin instead of sent. See [accounts](../../editing-content/accounts/) for the editor's side.

## Apply configuration changes and upgrades

After editing `lace.config.ts`, or after updating packages and images, stop the database users, run the explicit commands and start again:

```sh
docker compose stop api dispatcher
pnpm db:migrate
pnpm content:sync
pnpm prod:start
```

`pnpm content:sync --check` previews the plan without writing. Update `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE` together with the matching packages. Back up first and follow [upgrade and roll back](../../operations/#upgrade-and-roll-back) for the complete sequence.

## Verify and recover

After deployment, check API readiness, Admin sign-in, a published page, media, **Builds** and the final HTTPS site after a new publication, and confirm that cached responses revalidate. Readiness only proves the migration ledger: it does not prove synchronized configuration, storage, publication or a successful build.

- **Build failed:** Builds shows a sanitized cause and, for source problems, the affected path. Correct the source, lockfile, token or settings and use **Retry build**; publication stays committed and automatic retries stop after eight attempts.
- **Login or media URLs use the wrong host:** correct `LACE_PUBLIC_BASE_URL` and the reverse proxy, then recreate the services.
- **Publications stop triggering builds after a host database command:** restart `api` and `dispatcher` and review the maintenance window.

See [operations](../../operations/) before upgrades, storage moves or restores. Checking a real VPS deployment, restore or credential rotation requires your actual infrastructure.

## Optional assistant connections

To let AI assistants work with content, apply migrations, set `LACE_MCP_ENABLED=true` and recreate the API. The generated Nginx configuration already forwards `/mcp` and its OAuth discovery paths, disables MCP response buffering and logs paths without query strings. Production requires the canonical HTTPS `LACE_PUBLIC_BASE_URL`. Follow [Connect an AI assistant](../../operations/mcp/) for setup, permissions and revocation.

## Reference

- [CLI and environment](../../reference/cli-environment/): every Compose, email, builder and site setting with its default.
- [API documentation](../../reference/api/): build and media endpoints.
