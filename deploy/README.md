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

Optional values are `LACE_HTTP_PORT`, `LACE_MINIO_BUCKET`, `LACE_MINIO_REGION`, `LACE_MINIO_TIMEOUT_MS`, and the email settings described in [the Node API guide](../docs/node-api.md#email-delivery) (`LACE_EMAIL_PROVIDER` `smtp` or `resend`, `LACE_EMAIL_FROM`, and the provider's `LACE_SMTP_*` or `LACE_RESEND_API_KEY`). Production SMTP requires STARTTLS or implicit TLS; check delivery with Settings → Send test email. Keep `.env` outside backups sent to third parties; it is ignored by Git. For a fresh installation, use a nonempty bootstrap placeholder for `LACE_BUILD_TOKEN` and start the stack. Run `docker compose exec api node apps/api/src/dev-bootstrap.mjs` to create a once-shown first-admin setup token, then submit it with your chosen email and password to `POST /api/v1/setup/admin`. Sign in through `/admin/login`, create a read-only build token in Settings, then replace the placeholder in `.env` with the once-shown token. Run `docker compose up -d --force-recreate builder dispatcher`.

Run `docker compose exec api node apps/api/dist/content-sync-cli.js` to review and apply the code-first models. Publish the home page before requesting the initial build from `/admin/builds`; the reference Astro site requires it. Run the same sync command after changing `lace.config.ts` during later deployments. Do not run sync automatically on container startup.

Only the proxy publishes a port. The API and MinIO share a private backend network; the builder has outbound access to install from the pinned lockfile. The proxy reads `static-output` while the builder is its only writer. SQLite and MinIO data live in named volumes. Stopping or replacing containers preserves all three volumes; do not use `docker compose down --volumes` for ordinary upgrades.

Check `docker compose ps`, `docker compose logs dispatcher`, and `/health/ready` during startup. A failed build leaves the previous release served. The Builds page shows the sanitized reason and offers administrator retry after correcting the cause. The recovery process polls independently of the API and reclaims expired leases. Back up `sqlite-data`, `minio-data`, and `static-output` together while the stack is stopped or through a consistent volume snapshot.

Run `pnpm test:vps` on a machine with Docker Compose to exercise rapid publication, a successful static release, a failed builder, retention of the previous release, and administrator retry. The test uses an isolated Compose project and removes its own containers and volumes afterward.
