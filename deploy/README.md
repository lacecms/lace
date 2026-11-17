# Reference VPS deployment

`docker-compose.yml` runs the current repository as a single-site VPS installation. It uses `apps/site` as the read-only source for the fixed-command builder; Step 23 will replace this source with the generated project. Install Docker Compose, copy the variables below into an ignored `.env`, then run `docker compose up --build -d`. Migrations and bucket creation run as one-off services before the API starts. The public proxy listens on `LACE_HTTP_PORT` (default 8080); put TLS termination in front of it and set `LACE_PUBLIC_BASE_URL` to the resulting public origin with a trailing slash.

Required `.env` values:

```dotenv
LACE_PUBLIC_BASE_URL=https://example.com/
LACE_AUTH_SECRET=<unique-long-random-secret>
LACE_BUILDER_SECRET=<different-random-secret-at-least-32-characters>
LACE_BUILD_TOKEN=<once-shown-token-or-nonempty-bootstrap-placeholder>
LACE_MINIO_ROOT_ACCESS_KEY=<unique-access-key>
LACE_MINIO_ROOT_SECRET=<unique-long-random-secret>
```

Optional values are `LACE_HTTP_PORT`, `LACE_MINIO_IMAGE`, `LACE_MINIO_BUCKET`, `LACE_MINIO_REGION`, `LACE_MINIO_TIMEOUT_MS`, and the email settings described in [the Node API guide](../docs/node-api.md#email-delivery) (`LACE_EMAIL_PROVIDER` `smtp` or `resend`, `LACE_EMAIL_FROM`, and the provider's `LACE_SMTP_*` or `LACE_RESEND_API_KEY`). Production SMTP requires STARTTLS or implicit TLS; check delivery with Settings → Send test email. Keep `.env` outside backups sent to third parties; it is ignored by Git. For a fresh installation, use a nonempty bootstrap placeholder for `LACE_BUILD_TOKEN` and start the stack. Run `docker compose exec api node apps/api/src/dev-bootstrap.mjs` to create a once-shown first-admin setup token, then submit it with your chosen email and password to `POST /api/v1/setup/admin`. Sign in through `/admin/login`, create a read-only build token in Settings, then replace the placeholder in `.env` with the once-shown token. Run `docker compose up -d --force-recreate builder dispatcher`.

Run `docker compose exec api node apps/api/dist/content-sync-cli.js` to review and apply the code-first models. Publish the home page before requesting the initial build from `/admin/builds`; the reference Astro site requires it. Run the same sync command after changing `lace.config.ts` during later deployments. Do not run sync automatically on container startup.

Only the proxy publishes a port. The API and the `minio` storage service share a private backend network; the builder has outbound access to install from the pinned lockfile. The proxy reads `static-output` while the builder is its only writer. SQLite and media data live in named volumes. Stopping or replacing containers preserves all three volumes and the disposable `builder-cache`; do not use `docker compose down --volumes` for ordinary upgrades.

The proxy enforces request body limits that mirror the API's own. Every request is limited to 1 MiB (`client_max_body_size 1m`), the API's default JSON body limit, so larger bodies get `413` before reaching the API. Only `POST /api/v1/admin/media` (the exact `location = /api/v1/admin/media`) allows `11m`: the API's 10 MiB media upload ceiling (`MAX_MEDIA_BYTES` in `@lacecms/application`) plus at most 1 MiB for the multipart envelope. That location sets `proxy_request_buffering off`, so nginx streams the upload and the API's own size boundary decides. When the API's ceiling changes, update `deploy/nginx.conf` and the generated-project copy `packages/create-lace/templates/deploy/nginx.conf` together; `tests/deploy-proxy.test.mjs` fails until both allow the new ceiling and are identical. `pnpm proxy:probe` checks the limits against the real `nginx:1.27.5-alpine` image (8 MiB upload forwarded, 12 MiB upload and 2 MiB JSON refused with `413`). After changing the file, recreate the proxy with `docker compose up -d web`.

The proxy serves the content-hashed build files under `/_astro/` (scripts, styles and image variants) with `Cache-Control: public, max-age=2592000, immutable` (30 days, added to successful responses only, so a missing asset's `404` is not cached), every other site response with `no-cache`, and answers `404` for `/_headers`, the Cloudflare Pages rules file Astro copies from `public/`. `tests/deploy-proxy.test.mjs` pins these rules and `pnpm proxy:probe` checks them against real nginx. The builder keeps the pnpm package store and the site's Astro cache in the `builder-cache` volume at `/cache`; it clears the volume before a build above 2 GiB, drops the Astro cache after a failed build and builds uncached when the volume is unusable. The cache is disposable and never part of a release: to reset it, `docker compose rm --stop --force builder`, `docker volume rm lace_builder-cache`, then start the builder again.

Check `docker compose ps`, `docker compose logs dispatcher`, and `/health/ready` during startup. A failed build leaves the previous release served. The Builds page shows the sanitized reason and offers administrator retry after correcting the cause. The recovery process polls independently of the API and reclaims expired leases. Back up `sqlite-data`, `minio-data`, and `static-output` together while the stack is stopped or through a consistent volume snapshot.

Run `pnpm test:vps` on a machine with Docker Compose to exercise rapid publication, a successful static release, a failed builder, retention of the previous release, and administrator retry. The test uses an isolated Compose project and removes its own containers and volumes afterward.

## Switch the object storage image

Compose pulls or reuses the classic SILO image pinned in `docker-compose.yml`.
Set a full reference in the ignored `.env` with `LACE_MINIO_IMAGE` to choose a
mirror or another compatible server. An empty value uses the default. An
alternate image must accept the existing server command, environment and disk
layout, and include a shell and curl for the liveness check.

1. Record the running image and ID and keep it available locally. Inspect the
   `minio` container to record the actual volume mounted at `/data`; record
   sample Lace media IDs or keys and SHA-256 checksums of downloaded bytes.
   Pre-pull the selected image by its full reference. Preserve the Compose
   project name, file selection, volume, bucket and credentials.
2. Pause external traffic, writers, builders and dispatch. Let in-flight work
   settle, then run `docker compose stop`. Take a private, consistent copy of
   the stopped `minio-data` volume, including storage metadata, and the matching
   `sqlite-data` volume including any journals. Preserve permissions and
   ownership, and save the matching configuration and environment securely.
3. Start `docker compose up -d --wait web` with the new image. Keep external
   traffic and dispatch paused while an operator checks readiness, downloads
   the previously recorded media and compares hashes, then uploads and downloads
   a disposable image. Run `docker compose restart minio`, wait for it to be
   healthy and compare both downloads again. Resume the full stack and traffic
   after validation.
4. If startup or readback fails, keep maintenance in place. Stop the stack,
   restore the saved media and matching SQLite/configuration state, select the
   previous image with `LACE_MINIO_IMAGE` and verify the original media again.
   The replacement can change on-disk metadata; switching only the tag back
   does not restore a volume. If the image cannot be pulled, correct the
   reference or registry access without removing volumes.
