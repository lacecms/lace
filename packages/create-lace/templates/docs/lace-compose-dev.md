# Docker Compose development

Run Lace on your own machine: the packaged API/admin and MinIO in Docker Compose, operator commands on the host.

**Working directory:** the CMS installation root that contains `package.json`, `lace.config.ts` and this `docs/` directory (for example `cms/`). Run every command from there.

**Result:** a running local CMS with a first administrator, published content and a read-only build token.

<!-- lace-site: starter -->

Site mode: **starter**. The editable Astro site is `site/`; you also run its development server and a static build.

<!-- lace-site: end -->
<!-- lace-site: existing -->

Site mode: **existing site** at `{{SITE_PATH}}`. The generator did not modify the site; this guide connects it once and then runs its development server and a static build through this project's root scripts.

<!-- lace-site: end -->
<!-- lace-site: none -->

Site mode: **none**. This project builds no site, so this guide ends with published content that build tokens can read; there are no site scripts to run.

<!-- lace-site: end -->

## Prerequisites

- Node `>=24.12.0` and pnpm `>=12` (tested baseline: Node `24.12.0`, the project-pinned pnpm `12.3.4`).
- Docker with Compose and a running daemon. MinIO's first image build needs network access and disk space.
- Lace `0.1.0-alpha.4` or a later compatible release of the packages in `package.json` and the API/builder images in `.env.example`. Published `0.1.0-alpha.1` artifacts predate this workflow; published `0.1.0-alpha.2` artifacts lack the block-order fix, builder source diagnostics and the seven-status build history.

## Install and prepare the environment

One-time:

```bash
pnpm install
pnpm env:prepare
```

Preparation creates a protected, ignored `.env` with random auth, MinIO and builder credentials and an empty `LACE_BUILD_TOKEN`. It prints no secrets and refuses to overwrite an existing `.env`; keep and review an existing one instead. Never commit `.env`. Details and recovery: [environment preparation](lace-operations.md#prerequisites-and-generation).

Review `.env` before any command that loads it. Change only what your machine needs:

- `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE`: compatible image references for your Lace release.
- `LACE_API_PORT` and `LACE_HTTP_PORT`: host ports for the API/admin and the static web proxy.
- `LACE_PUBLIC_BASE_URL` and `LACE_API_BASE_URL`: both default to `http://127.0.0.1:3000/`. Change both when you change the API port. Use the exact public origin for admin login (`localhost` and `127.0.0.1` differ). Keep path prefixes and the trailing slash.

Keep every generated credential.

## Prepare the database and start the CMS

The host commands `pnpm db:migrate`, `pnpm content:sync` and `pnpm auth:bootstrap` open the same SQLite file as the Compose `api` and `dispatcher` services. Run them only while those services are stopped. This is a remaining workaround, not fixed in this release: on Docker Desktop and OrbStack the data directory crosses a virtual-machine file share that does not share SQLite locks, and a host command run against a running stack can stop publications from triggering builds until the services restart. On the first run nothing is running yet.

One-time, in this order:

```bash
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm db:migrate
pnpm content:sync
pnpm auth:bootstrap
pnpm dev:api
```

- Doctor is read-only. During `setup`, a missing database, unavailable API and empty build token are `expected`; correct every `fail` first. See [doctor limits and exit codes](lace-operations.md#read-only-environment-checks).
- Migration is explicit and creates `.lace/data/` when missing; the API never migrates on startup.
- Sync registers Home and Posts and creates the Home draft.
- Bootstrap prints one setup token that expires after one hour. Capture it privately.
- `pnpm dev:api` starts MinIO, its initialization, the migration service and the API/admin. Wait until `/health/ready` at your API origin answers `ready`.

## Create the first administrator

Open `/admin/` at your `LACE_PUBLIC_BASE_URL` (default `http://127.0.0.1:3000/admin/`). While setup is incomplete the browser shows the setup screen: enter your email, a password of 12–1024 characters and the bootstrap token, create the administrator, then sign in. After an interruption, retry with the same token and email.

The API alternative sends `POST /api/v1/setup/admin` with exactly `token`, `email` and `password`. This request uses placeholders only: replace `<PUBLIC_API_BASE_URL>` with your configured `LACE_PUBLIC_BASE_URL`, including any path prefix and its trailing slash, use the token just issued by bootstrap and a password of at least 12 characters.

```bash
curl --fail-with-body --silent --show-error --request POST \
  '<PUBLIC_API_BASE_URL>api/v1/setup/admin' \
  --header 'Content-Type: application/json' \
  --data '{"token":"<SETUP_TOKEN>","email":"<ADMIN_EMAIL>","password":"<PASSWORD_AT_LEAST_12_CHARACTERS>"}'
```

Replacing inline placeholders with real credentials exposes them in shell history and process arguments. Prefer the [private-input setup script](lace-operations.md#migrate-sync-and-create-the-first-administrator), which prompts without recording credentials.

If an unused token expired, stop the services (`docker compose stop api dispatcher`), run `pnpm auth:bootstrap` again and start them with `pnpm dev:api`. Successful setup consumes the token and closes setup (later requests return 404); sign in with the existing administrator instead. A setup token is neither a password nor a build token.

## Issue a build token

In Admin Settings create a read-only build token and put its one-time value into `LACE_BUILD_TOKEN` in `.env`. It reads published exports only. Keep it server-side: never in `VITE_*`, `LACE_PUBLIC_*`, browser code, HTML or source control. Replace an expired or revoked token through Settings.

## Publish content

In Admin open Home, set a title, add blocks, save the draft and publish as the administrator. Upload images through Media and select them in image or hero blocks. For a blog page create a Posts entry with a title and a valid slug, then publish. Editors save drafts; publication requires an administrator. With compatible current artifacts, reordered, inserted and duplicated blocks save and publish in the order the editor shows.

Saving a draft never changes published content or requests a build.

<!-- lace-site: starter -->

## Run and build the site

With `LACE_BUILD_TOKEN` set:

```bash
pnpm dev
pnpm build
pnpm typecheck
```

- `pnpm dev` serves the editable site, normally at `http://localhost:4321/`. After a publication, reload: dev revalidates the published export, so changes to `/` and existing posts appear without a restart. Restart dev for a new or renamed slug (Astro caches static paths) or after token/environment changes; this is an Astro limitation, not a Lace defect.
- `pnpm build` reads one authenticated published export and writes `site/dist/`. Publish Home first. Publication alone never changes an existing `site/dist/` and Lace does not deploy a manual build: run a fresh build and deploy it with your own host.
- Missing or rejected tokens, an unavailable API, unpublished Home and unknown blocks fail with corrective messages.

<!-- lace-site: end -->
<!-- lace-site: existing -->

## Connect and build your site

One-time, connect the site at `{{SITE_PATH}}`:

1. Install `@lacecms/sdk`, `@lacecms/astro`, `@lacecms/render` and `@lacecms/content` in the site at this project's Lace release, for example `pnpm --dir {{SITE_PATH}} add @lacecms/sdk@<release> @lacecms/astro@<release> @lacecms/render@<release> @lacecms/content@<release>`, and commit the site's `pnpm-lock.yaml`.
2. From this directory, install the block components, block map and `lace.site.json` into the site. The command never edits the site's `package.json` and reports edited files as conflicts.
3. Create the server-only loader file and your routes as described in [Connect an existing Astro site](lace-astro-site.md).

```bash
pnpm exec lace add block --all --site {{SITE_PATH}}
```

Then, with `LACE_BUILD_TOKEN` set, run Astro in the site through this project's root scripts:

```bash
pnpm dev
pnpm build
```

- After a publication, reload `pnpm dev`. Data your page code reads on every render appears on reload; data passed through `getStaticPaths` props and new routes need a dev restart. The loader from the connection guide revalidates the export in dev.
- `pnpm build` reads one authenticated published export and writes `{{SITE_PATH}}/dist/`. Publication alone never changes that output or deploys it.
- `pnpm exec lace doctor --target node --mode compose --stage setup` reports the `site` check as expected until packages and blocks are installed.

<!-- lace-site: end -->
<!-- lace-site: none -->

Published content is readable with a build token through the authenticated build export. No site is built from it: Builds and Settings show an unconfigured site and build requests fail as unavailable. To connect a site later, follow [Connect an existing Astro site](lace-astro-site.md) and [Selecting the build site](lace-operations.md#selecting-the-build-site).

<!-- lace-site: end -->

## Repeat and restart

Daily start and stop:

```bash
pnpm dev:api
pnpm dev:stop
```

Stopping preserves `.lace/data/` and the MinIO volume. Restarting needs no migration, sync or bootstrap.

After editing `lace.config.ts`, or for any other host database command, stop the services first, run the command and start again:

```bash
docker compose stop api dispatcher
pnpm content:sync --check
pnpm content:sync
pnpm dev:api
```

`--check` reports pending or incompatible changes without writing. Incompatible structural changes to populated models are blocked; see [configuration, routes, renderers and styling](lace-operations.md#configuration-routes-renderers-and-styling). After upgrading Lace packages or images, run `pnpm db:migrate` the same way.

## Recovery

- **Doctor fails.** Follow each check's next action; exit `4` is compatibility or settings, `5` migration state, `6` infrastructure.
- **Login fails.** Use the exact `LACE_PUBLIC_BASE_URL` origin; `localhost` and `127.0.0.1` are different origins.
- **Publications stop triggering builds after a host command.** Stop and restart `api` and `dispatcher` as shown above.
- **Destructive reset.** Removing `.lace/data/` or Compose volumes deletes content, accounts and media. Back up first; use it only for disposable data.

## Next steps

<!-- lace-site: starter existing -->

- Run the CMS, builder and static web proxy on a server: [Docker Compose production](lace-compose-production.md).
- See when each mode shows a publication: [when published content becomes visible](lace-operations.md#when-published-content-becomes-visible).

<!-- lace-site: end -->
<!-- lace-site: none -->

- Run the CMS on a server: [Docker Compose production](lace-compose-production.md).

<!-- lace-site: end -->
<!-- lace-cloudflare: on -->

- Run the CMS as a Cloudflare Worker: [Cloudflare](lace-cloudflare.md).

<!-- lace-cloudflare: end -->

- Extend models, routes and blocks: [configuration, routes, renderers and styling](lace-operations.md#configuration-routes-renderers-and-styling).
