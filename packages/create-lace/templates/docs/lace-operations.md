# Operating this Lace project

<!-- lace-site: starter -->

Run the generated project with packaged API/admin runtimes and an editable Astro site. You own `lace.config.ts` and `site/`; the engine checkout is unnecessary.

Site mode: **starter**. The Astro site is the generated `site/` directory, recorded in `.lace/manifest.json` as mode `starter` with path `site`.

<!-- lace-site: end -->
<!-- lace-site: existing -->

Run the generated project with packaged API/admin runtimes and your existing Astro site. You own `lace.config.ts` and the site; the engine checkout is unnecessary.

Site mode: **existing site** at `{{SITE_PATH}}`, recorded in `.lace/manifest.json` as mode `existing` with that path relative to this directory. This project contains no `site/` directory, and the generator did not modify the site. Connect it with [Connect and build the existing site](#connect-and-build-the-existing-site).

<!-- lace-site: end -->
<!-- lace-site: none -->

Run the generated project with packaged API/admin runtimes. You own `lace.config.ts`; the engine checkout is unnecessary.

Site mode: **none**, recorded in `.lace/manifest.json` as mode `none`. This project contains the CMS only and builds no site: Compose defines no builder, the dispatcher has no builder trigger and no build-site identity is configured, so build requests fail as unavailable until a site is configured and Admin shows an unconfigured site. To connect a site later, see [Selecting the build site](#selecting-the-build-site).

<!-- lace-site: end -->

<!-- lace-cloudflare: on -->

This guide is the reference. Follow a scenario guide for an ordered journey: [Docker Compose development](lace-compose-dev.md), [Docker Compose production](lace-compose-production.md) or [Cloudflare](lace-cloudflare.md).
<!-- lace-cloudflare: end -->
<!-- lace-cloudflare: off -->

This guide is the reference. Follow a scenario guide for an ordered journey: [Docker Compose development](lace-compose-dev.md) or [Docker Compose production](lace-compose-production.md).
<!-- lace-cloudflare: end -->

The generated root `README.md` is a short index of requirements, layout and these guides. README is user-owned, without a manifest hash; upgrades preserve its edits. If `init .` encounters an allowed existing README, it preserves every byte and prints the scenario guide paths. Follow the guides directly or manually copy relevant Lace instructions into your existing README. In a `cms/` installation these paths and commands are relative to `cms/`, not its parent application. This guide is managed with hash/conflict review.

## Prerequisites and generation

Use Node `>=24.12.0`, pnpm `>=12` and Docker Compose. These are minimums: Lace is tested with Node `24.12.0` and the project-pinned pnpm `12.3.4`, and newer majors are eligible but unverified until the compatibility matrix records them. Obtain compatible Lace packages, generator and API/builder image tags from the same release. This project uses ownership template `0.17.0` and Lace `0.1.0-alpha.4` packages and images; published `0.1.0-alpha.1` (template `0.4.0`) and `0.1.0-alpha.2` (template `0.14.0`) packages/images retain their original behavior and are not retroactively updated. Environment preparation, doctor, browser setup, tour, existing-site mode and the Cloudflare Worker require `0.1.0-alpha.2` or later; the scenario guides, explicit Cloudflare credentials and preflight, Pages deployment tracking, the seven-status build history, builder source diagnostics and the block-order fix require `0.1.0-alpha.4` or a later compatible release. The npm alpha channel is `next`; use the exact version below for reproducible generation. These coordinates become downloadable only after owner publication. Before publication, repository verification uses the exact locally prepared artifacts; ordinary consumers must wait for publication rather than patch dependency references.

After the owner publishes the complete compatible alpha set, generate and install:

```bash
pnpm create lace@0.1.0-alpha.4 my-site
cd my-site
pnpm install
pnpm env:prepare
```

`pnpm env:prepare` runs the packaged `lace env prepare` before `.env` exists. It preserves the template's local settings, generates independent cryptographically random `LACE_AUTH_SECRET`, `LACE_MINIO_ROOT_ACCESS_KEY`, `LACE_MINIO_ROOT_SECRET` and `LACE_BUILDER_SECRET`, and leaves `LACE_BUILD_TOKEN` empty. It prints no credentials and publishes a complete `.env` with owner-only POSIX permissions (`0600`). On Windows, verify equivalent owner-only ACLs. Never commit `.env` or use default credentials.

Preparation refuses to replace any existing `.env`, including concurrent creation. If you already have one, retain it and review its settings privately; this command does not rotate credentials. A missing, symlinked or malformed `.env.example` must be restored as a regular file with one single-line `NAME=value` assignment for each generated credential and `LACE_BUILD_TOKEN`. Filesystem failures require checking directory permissions and hard-link support. If preparation was forcibly stopped, `.env` is either absent or fully written; private ignored `.lace-env-*` staging directories can be removed after confirming no preparation is running. Retry only when `.env` is absent.

This preparation flow requires `0.1.0-alpha.2` or later compatible packages. Previously published `0.1.0-alpha.1` artifacts are not retroactively updated.

## Read-only environment checks

With a `0.1.0-alpha.2` or later compatible CLI, run from this project root:

```bash
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm exec lace doctor --target node --mode compose --stage ready --json
```

Doctor reads a regular `.env`, then lets exported process variables override it; it does not require Node's `--env-file` option. It checks your `package.json` Node/pnpm engine ranges, the site recorded in `.lace/manifest.json` (its Astro project, Lace site packages, `lace.site.json` and block map; nothing for site mode none), generated Compose host settings, Docker Compose/daemon, migrations, anonymous API readiness through `LACE_API_BASE_URL` and build-token presence. Select `--mode native` only for an independently configured host Node runtime using its runtime variable names. Target and stage are required; native is the Node default and mode is invalid for Cloudflare. No tools are installed and no configuration or services are changed.

`setup` marks absent databases/ledgers, pending migrations, an unavailable API and the not-yet-issued build token as `expected`; `ready` treats them as failures. Settings/permission/lock/tool/authorization errors and a reachable API returning not-ready fail in both stages. Other check statuses are `pass`, `fail` and `skipped`; skipped checks explain their dependency or inapplicability. A present token remains unverified and is never sent. Readiness does not verify content sync, object storage, publication or a successful site build.

SQLite is inspected without writable runtime opening. WAL-mode databases report `DATABASE_UNAVAILABLE` rather than change SHM reader marks or create sidecars; consult the separate API readiness result. For an independent ledger inspection, stop all API/dispatcher/CLI database users, back up with trusted SQLite tooling, explicitly checkpoint successfully and switch to rollback journal mode (`PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;`), then repeat doctor. These are operator actions; doctor performs none of them. Ordinary Lace startup restores WAL. Never discard WAL/SHM files or use immutable mode on a live database.

Cloudflare needs an installed project-local Wrangler and an explicitly selected `LACE_WRANGLER_CONFIG` with a CMS `DB` binding matching `LACE_D1_DATABASE_ID`; a Pages-only Wrangler file lacks that binding. Projects generated with `--cloudflare` select their CMS Worker configuration `worker/wrangler.jsonc`. `--target cloudflare-local` additionally needs `LACE_CLOUDFLARE_PERSIST_TO` and a loopback API URL, normally the local Worker origin; migration readiness comes from the running Worker's readiness and is skipped while offline, without creating local state. `--target cloudflare-remote` needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` and performs only the selected D1 ledger read. Never substitute a remote target for an unavailable local Worker.

`--json` prints one deterministic report with ordered checks and safe recovery guidance. Exit codes: `0` passing/expected setup, `3` invalid arguments, `4` failed compatibility/settings, `5` failed migration state, `6` failed infrastructure/probe. Mixed failures prioritize `4`, then `5`, then `6`. Each probe is limited to five seconds, total diagnosis to thirty seconds and captured data to 64 KiB. Secrets, paths and raw provider/tool errors are excluded, redirects are rejected, and diagnosis never migrates, syncs, bootstraps, starts services or creates credentials.

MinIO is built once from the pinned source in `deploy/minio.Dockerfile`, requiring network access to its source and Go modules and sufficient disk space. Review `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE` in `.env` and select compatible image tags.

Keep `LACE_BUILD_TOKEN` empty until setup finishes. Local API startup does not need it; starting the full builder requires a real read-only build token. Keep these settings aligned:

| Setting                | Local host value           | Purpose                                                |
| ---------------------- | -------------------------- | ------------------------------------------------------ |
| `LACE_DATABASE_PATH`   | `./.lace/data/lace.sqlite` | CLI database shared with API `/data/lace.sqlite` mount |
| `LACE_API_PORT`        | `3000`                     | Host API/admin port                                    |
| `LACE_PUBLIC_BASE_URL` | `http://127.0.0.1:3000/`   | Browser API/admin origin and public media URLs         |
| `LACE_API_BASE_URL`    | `http://127.0.0.1:3000/`   | Host Astro authenticated export transport              |
| `LACE_HTTP_PORT`       | `8080`                     | Full Compose static-site/web port                      |

If you change the API port, change both host URLs. Log in using the exact `LACE_PUBLIC_BASE_URL` origin; `localhost` and `127.0.0.1` differ. Compose overrides the builder export transport to `http://api:3000/`, while media retains the browser-facing URL. Intentional public base-path prefixes are preserved; your reverse proxy must route them.

## Migrate, sync and create the first administrator

Run from the generated root. Operator scripts load `.env` without sourcing it as shell code:

```bash
pnpm db:migrate
pnpm content:sync
pnpm auth:bootstrap
pnpm dev:api
```

Migrations are explicit and repeatable; the API does not apply them on startup. With `0.1.0-alpha.2` or later packages, `pnpm db:migrate` creates missing parent directories for `LACE_DATABASE_PATH`, including `.lace/data`, and preserves existing database contents. No manual directory creation is needed with those packages. The originally published `0.1.0-alpha.1` packages predate this fix and still require `mkdir -p .lace/data` before their first migration. Sync creates the singleton Home draft and registers Posts. Bootstrap prints a one-time setup token and expiry. Capture it privately. Bootstrap refuses after first-admin setup completes; for an expired unused token, run bootstrap again before completing setup.

Host database commands and the running stack: `pnpm db:migrate`, `pnpm content:sync` (including `--check`) and `pnpm auth:bootstrap` open the same SQLite file as the Compose `api` and `dispatcher` services. Run them only while those services are stopped: `docker compose stop api dispatcher`, run the command, then start again with `pnpm dev:api` (or `docker compose up -d` for the full stack). On Docker Desktop and OrbStack the data directory crosses a virtual-machine file share that does not share SQLite locks or write-ahead-log memory with containers, so a host command run while the services are up can leave them with diverging views; publications then stop triggering site builds until the services restart. Doctor never writes and refuses to probe a running write-ahead-log database.

Before opening host SQLite in a Compose installation, the CLI inspects running Compose containers and maps their configured database through bind mounts to the selected host file, including path aliases and different project names. A live consumer or unavailable/ambiguous Docker inspection returns sanitized `OPERATION_FAILED` without opening the database or issuing a token. Stop `api` and `dispatcher` explicitly and keep them stopped throughout maintenance; the preflight is a point-in-time check, not a lock against a concurrent start. A running source-only builder can remain up. Restore Docker access if inspection fails. Node-only installations without a Compose file and in-container maintenance do not need a Docker socket.

With `0.1.0-alpha.2` or later compatible API/admin artifacts, open `/admin/` at the configured `LACE_PUBLIC_BASE_URL` origin. The browser shows setup while installation setup is incomplete. Enter your email, a password of 12–1024 characters, and the operator-issued bootstrap token, then create the administrator and sign in normally. The token expires after one hour. After an interruption, retry with the same token and email; the browser checks whether setup completed before offering another submission. Completed setup remains closed and later visitors see sign-in.

The originally published `0.1.0-alpha.1` artifacts predate browser setup. As an alternative, including for those artifacts, create the first admin through `POST /api/v1/setup/admin` using exactly `token`, `email`, and `password` (12–1024 characters). For a concise placeholder-only request, replace `<PUBLIC_API_BASE_URL>` with the configured `LACE_PUBLIC_BASE_URL`, keeping any path prefix and trailing slash. Use the one-time token just issued by `pnpm auth:bootstrap` and a password of at least 12 characters:

```bash
curl --fail-with-body --silent --show-error --request POST \
  '<PUBLIC_API_BASE_URL>api/v1/setup/admin' \
  --header 'Content-Type: application/json' \
  --data '{"token":"<SETUP_TOKEN>","email":"<ADMIN_EMAIL>","password":"<PASSWORD_AT_LEAST_12_CHARACTERS>"}'
```

Real credentials substituted inline are exposed in shell history and process arguments. Prefer this private-input Bash snippet: it prompts through the terminal without recording credentials in shell history, loads the API origin from `.env`, and prints only status:

```bash
bash <<'SH'
read -r -s -p 'Setup token: ' LACE_SETUP_TOKEN < /dev/tty
printf '\n' > /dev/tty
read -r -p 'Admin email: ' LACE_SETUP_EMAIL < /dev/tty
read -r -s -p 'Admin password (at least 12 characters): ' LACE_SETUP_PASSWORD < /dev/tty
printf '\n' > /dev/tty
export LACE_SETUP_TOKEN LACE_SETUP_EMAIL LACE_SETUP_PASSWORD
node --env-file=.env --input-type=module <<'JS'
const response = await fetch(new URL('api/v1/setup/admin', process.env.LACE_PUBLIC_BASE_URL), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    token: process.env.LACE_SETUP_TOKEN,
    email: process.env.LACE_SETUP_EMAIL,
    password: process.env.LACE_SETUP_PASSWORD,
  }),
});
if (!response.ok) {
  console.error(`Setup failed (HTTP ${response.status}). Check API readiness, unused token/expiry and password length.`);
  process.exitCode = 1;
} else {
  console.log('Administrator created. Sign in at the configured API origin /admin/.');
}
JS
SH
```

Successful setup consumes the setup token. It is not a password or build token. Open `http://127.0.0.1:3000/admin/` (or your configured API origin) and sign in with that email/password. In Settings create a read-only build token and copy its one-time value to `LACE_BUILD_TOKEN` in `.env`. It authorizes only published exports, not editing or draft access. Replace expired/revoked build tokens through Settings; never put credentials in `VITE_*`, `LACE_PUBLIC_*`, HTML or source control.

<!-- lace-site: starter -->

## Publish and build the editable site

In Admin open Home, set its title, add blocks, save and publish as the admin. Upload images through Media and select them in image/hero blocks. Both Home and Posts support `hero`, `richText`, `image`, `quote` and `cta`. For a blog page create a Posts entry, set a valid slug/title, save and publish. Editors can save drafts; publication requires an admin.

```bash
pnpm dev
# After publishing: reload dev; restart it only for new/renamed slugs or token/env changes.
pnpm build
pnpm typecheck
```

`dev` serves editable Astro at its printed URL, normally `http://localhost:4321/`. Each static build reads one authenticated published export and derives `/` and `/blog/:slug` routes from it. Publish Home before building. Later draft edits do not change built content. Missing/rejected credentials, unavailable API, unpublished Home and unsupported blocks fail with corrective diagnostics. See [publication visibility](#when-published-content-becomes-visible) for when each mode shows a publication.

<!-- lace-site: end -->
<!-- lace-site: existing -->

## Connect and build the existing site

In Admin open Home, set its title, add blocks, save and publish as the admin. Upload images through Media and select them in image/hero blocks. Both Home and Posts support `hero`, `richText`, `image`, `quote` and `cta`. For a blog page create a Posts entry, set a valid slug/title, save and publish. Editors can save drafts; publication requires an admin.

The site at `{{SITE_PATH}}` reads published content through the Lace site packages. Connect it once, in this order:

1. Install `@lacecms/sdk`, `@lacecms/astro`, `@lacecms/render` and `@lacecms/content` in the site at the release version of this project's Lace packages, then run `pnpm install` there so its `pnpm-lock.yaml` is committed and reproducible.
2. From this CMS directory, run `pnpm exec lace add block --all --site {{SITE_PATH}}`. It installs the five built-in block components, the block map and `lace.site.json` into the site, never edits its `package.json`, and reports edited files as conflicts instead of overwriting them.
3. Create the server-only loader file and your routes as described in [Connect an existing Astro site](lace-astro-site.md).
4. Build with this project's root scripts (`pnpm dev` and `pnpm build` run Astro in `{{SITE_PATH}}`) or with the Compose builder, whose defaults select that site (see [Selecting the build site](#selecting-the-build-site)).

```bash
pnpm exec lace add block --all --site {{SITE_PATH}}
pnpm dev
# After publishing: reload dev; restart it only for new/renamed slugs or token/env changes.
pnpm build
```

Each static build reads one authenticated published export with `LACE_API_BASE_URL` and `LACE_BUILD_TOKEN`. Publish Home before building. Missing/rejected credentials, unavailable API, unpublished content and unsupported blocks fail with corrective diagnostics. `lace doctor` reports a `site` check that is expected during `setup` until the packages and blocks are installed. See [publication visibility](#when-published-content-becomes-visible) for when each mode shows a publication.

<!-- lace-site: end -->
<!-- lace-site: none -->

## Publish content without a site

In Admin open Home, set its title, add blocks, save and publish as the admin. Upload images through Media. Editors can save drafts; publication requires an admin. Published content is readable with a build token through the authenticated build export; no site is built from it until a site is configured.

<!-- lace-site: end -->

## Full Compose build and persistence

<!-- lace-site: starter existing -->

Once the real build token is configured, run `pnpm prod:start`. It starts API/admin, MinIO, explicit migration, dispatcher, fixed-command builder and web proxy. The builder reads generated source read-only and publishes successful static releases atomically. Visit `http://127.0.0.1:8080/` after a successful build. Publication queues a build; Settings also offers an explicit build request. If earlier publications were already built, request a fresh build in Settings. Failed builds retain the last successful release; inspect build history and request retry after correcting the cause. Rendered images use the host API URL, not `http://api:3000/`.

<!-- lace-site: end -->
<!-- lace-site: none -->

`pnpm prod:start` starts API/admin, MinIO, explicit migration, dispatcher and web proxy; there is no builder. The web proxy serves `/admin/` and `/api/` on `LACE_HTTP_PORT`, and `/` reports that no site build exists yet. Build requests fail as unavailable until a site is configured.

<!-- lace-site: end -->

`pnpm dev:stop` and `pnpm prod:stop` retain SQLite in `.lace/data/` and MinIO/static-output volumes. Restart with the corresponding start command. Use `docker compose down --volumes` and remove `.lace/data/` only for disposable test deployments after backing up valuable content.

## When published content becomes visible

<!-- lace-site: starter existing -->

Saving a draft never changes any site output and never requests a build. Publishing makes the saved revision the published snapshot that build tokens can read; what visitors see then depends on how the site is rendered. These behaviors are verified against a generated consumer of template `0.17.0` with the exact `0.1.0-alpha.4` candidate artifacts.

<!-- lace-site: starter -->

| Mode                               | After publication                                                                                                                                                                               | Next action                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Generated `pnpm dev`               | Changes to `/` and existing `/blog/:slug` pages appear on reload; dev revalidates the export with its ETag on each render. A new or renamed slug returns 404 because Astro caches static paths. | Reload. Restart `pnpm dev` only for new/renamed slugs or token/environment changes.                                |
| Manual static build (`pnpm build`) | Existing `site/dist/` output is unchanged.                                                                                                                                                      | Run a fresh `pnpm build`, then deploy `site/dist/` with your own host. Lace cannot see or confirm that deployment. |
| Compose (`pnpm prod:start`)        | Publication queues a build. The web proxy keeps serving the previous release until the builder switches a complete new one; a failed build keeps the previous release.                          | Watch Builds; reload after the build covering your publication succeeds.                                           |

<!-- lace-site: end -->
<!-- lace-site: existing -->

| Mode                               | After publication                                                                                                                                                                               | Next action                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Generated `pnpm dev`               | Changes to `/` and existing `/blog/:slug` pages appear on reload; dev revalidates the export with its ETag on each render. A new or renamed slug returns 404 because Astro caches static paths. | Reload. Restart `pnpm dev` only for new/renamed slugs or token/environment changes.                                         |
| Manual static build (`pnpm build`) | Existing `{{SITE_PATH}}/dist/` output is unchanged.                                                                                                                                             | Run a fresh `pnpm build`, then deploy `{{SITE_PATH}}/dist/` with your own host. Lace cannot see or confirm that deployment. |
| Compose (`pnpm prod:start`)        | Publication queues a build. The web proxy keeps serving the previous release until the builder switches a complete new one; a failed build keeps the previous release.                          | Watch Builds; reload after the build covering your publication succeeds.                                                    |

<!-- lace-site: end -->

Build statuses: **Pending** (queued or waiting for a retry), **Running** (building, or tracking a provider deployment), **Accepted** (a provider accepted the request; its outcome is not tracked), **Succeeded** (published), **Failed** (failed with a recorded reason), **Cancelled** (cancelled or skipped by the provider) and **Unknown** (tracking stopped without proof). Only Succeeded proves the site was published; each status in Builds has an info button with its meaning and next step, and administrators can retry Failed, Cancelled, Unknown and Accepted builds. On the VPS builder a build is **Pending** while it waits and **Running** while the synchronous builder runs, then becomes **Succeeded** or **Failed**. The new release can be served a moment before Builds records success. Builds coalesce: one build may cover several publications, so look for a build whose target version is at least the version your publication queued. The web proxy sends `Cache-Control: no-cache` for site responses, so browsers revalidate with the file validators after a release switch instead of reusing heuristically cached HTML. Admin's entry editor follows the covering build and names the current build site, but a succeeded build does not prove a manual or provider deployment.

<!-- lace-site: starter -->

An existing site with its own SDK integration behaves according to its own code in Astro dev: data read in page code on every render appears on reload, while data passed through `getStaticPaths` props and any new routes stay as loaded until you restart dev. The generated `site/src/lib/lace.ts` and `site/src/pages/blog/[slug].astro` show the reload-friendly pattern while keeping one export per static build.

<!-- lace-site: end -->
<!-- lace-site: existing -->

Your site behaves according to its own code in Astro dev: data read in page code on every render appears on reload, while data passed through `getStaticPaths` props and any new routes stay as loaded until you restart dev. The loader from [Connect an existing Astro site](lace-astro-site.md) revalidates the export in dev while keeping one export per static build.

<!-- lace-site: end -->

<!-- lace-site: end -->
<!-- lace-site: none -->

Saving a draft never requests a build. Publishing makes the saved revision the published snapshot that build tokens can read. This project builds no site, so publication changes no site output and queues no successful build; connect a site to make publications visible.

<!-- lace-site: end -->

## Configuration, routes, renderers and styling

`lace.config.ts` defines models. `pnpm content:sync --check` reports pending/incompatible changes without writing (pending changes exit with code 2). Normal sync applies valid plans atomically and refuses incompatible changes without partial application. Changes to kind, fields, routes or allowed blocks on populated models can be blocked even with a version increment. This alpha has no general content migration tool; plan a deliberate migration instead of deleting production data. Stop `api` and `dispatcher` before syncing (see host database commands above) and start them again afterwards; the restart also reloads the mounted configuration.

<!-- lace-site: starter -->

Adding a model does not create an Astro route. Add the route in `site/src/pages/` and read its entries from `getSite()` in `site/src/lib/lace.ts`: `byPath(path)` for a page, `entries(model)` in `getStaticPaths` and `bySlug(model, slug)` on each render for a collection. A custom block needs a component in `site/src/components/lace/` and an entry in the `site/src/lace/blocks.ts` map whose definition is imported from the same module `lace.config.ts` uses: export the `defineBlock` value from a module, record its path relative to `site/` as `"definitions"` in `site/lace.site.json`, and run `pnpm exec lace add block <type>` to scaffold the component and register it. `pnpm exec lace add block --all` installs or updates the built-in block components for every configured block type; it updates only files you have not changed, reports edited components or an edited block map as conflicts with a diff, and never edits `package.json` (it prints the `pnpm add` command instead). Unknown blocks fail with model, entry and block identifiers. Block data is validated with the CMS rules before your component receives it, and `@lacecms/astro/RichText.astro` renders rich text only through the shared allowlist. These source files belong to you and upgrades never silently overwrite them.

<!-- lace-site: end -->
<!-- lace-site: existing -->

Adding a model does not create an Astro route. Add the route in your site and read its entries through the loader file from [Connect an existing Astro site](lace-astro-site.md): `byPath(path)` for a page, `entries(model)` in `getStaticPaths` and `bySlug(model, slug)` on each render for a collection. Run `pnpm exec lace add block --all --site {{SITE_PATH}}` from this directory after adding a block type; it updates only block files you have not changed, reports edited components or an edited block map as conflicts with a diff, and never edits `package.json`. For a custom block, record the module exporting its `defineBlock` value as `"definitions"` in the site's `lace.site.json` and run `pnpm exec lace add block <type> --site {{SITE_PATH}}` to scaffold and register its component. Block data is validated with the CMS rules before your component receives it, and `@lacecms/astro/RichText.astro` renders rich text only through the shared allowlist. Your site's files belong to you; upgrades never create or change them.

<!-- lace-site: end -->
<!-- lace-site: none -->

Adding a model does not create a site route. Connect a site first; see [Selecting the build site](#selecting-the-build-site).

<!-- lace-site: end -->
<!-- lace-site: starter -->

Style in `site/src/styles/global.css`. Stable hooks are `data-lace-model`, `data-lace-entry`, `data-lace-block`, `data-lace-block-key` and `data-lace-part`; tags and incidental classes are not the selector contract:

<!-- lace-site: end -->
<!-- lace-site: existing -->

Style your site with its own stylesheets. Stable hooks are `data-lace-model`, `data-lace-entry`, `data-lace-block`, `data-lace-block-key` and `data-lace-part`; tags and incidental classes are not the selector contract:

<!-- lace-site: end -->
<!-- lace-site: starter existing -->

```css
[data-lace-block="hero"] {
  padding-block: 2rem;
}
[data-lace-model="home"] [data-lace-block="hero"] [data-lace-part="heading"] {
  color: #174f43;
}
[data-lace-entry="your-entry-id"] [data-lace-block-key="your-block-key"] {
  max-width: 48rem;
}
```

Block keys are unique within an entry, so scope instance selectors by entry. Built-in parts: hero `eyebrow`, `heading`, `body`, `media`, `action`; richText `content`; image `media`, `caption`; quote `text`, `attribution`; cta `heading`, `body`, `action`. Optional parts are absent when their content is absent.

<!-- lace-site: end -->

<!-- lace-cloudflare: on -->

## Cloudflare Worker

This project was generated with `--cloudflare`. The CMS runs as your own Cloudflare Worker built from installed Lace packages; the engine checkout is unnecessary. It requires Lace `0.1.0-alpha.2` or later compatible packages: published `0.1.0-alpha.1` packages do not contain the packaged admin and are not retroactively updated.

| File                       | Owner   | Purpose                                                                                                                                                                                  |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker/index.ts`          | managed | Worker entry. It imports `../lace.config.ts` at bundle time, so redeploy after configuration changes.                                                                                    |
| `worker/wrangler.jsonc`    | yours   | Worker name, compatibility date and `nodejs_compat`, D1 `DB`, R2 `MEDIA`, packaged admin `ASSETS`, the recovery cron, optional KV `CACHE` and plain variables. Upgrades never change it. |
| `worker/.dev.vars.example` | managed | Template for the ignored local `worker/.dev.vars`.                                                                                                                                       |

The Worker serves the API, authentication, health and the admin at `/admin/` from one origin, its `LACE_PUBLIC_BASE_URL`. The admin is the compiled admin shipped in the installed `@lacecms/platform-cloudflare`, matching your Lace release. Without a `CACHE` binding the Worker uses a no-op cache; the configuration shows how to add KV. A scheduled trigger runs every minute to recover pending builds and media deletions; dispatch after each publication only reduces latency.

### Run the Worker locally

Nothing below needs a Cloudflare account or touches remote resources:

```bash
pnpm install
pnpm env:prepare
pnpm cf:env:prepare
pnpm cf:db:migrate
pnpm cf:content:sync
pnpm cf:auth:bootstrap
pnpm cf:dev
```

`pnpm env:prepare` creates `.env`, whose Cloudflare operator settings select `worker/wrangler.jsonc`, the local state directory `./.lace/data/cloudflare` and the configuration's D1 ID for the explicit `--target cloudflare-local` commands. `pnpm cf:env:prepare` runs `lace env prepare --target cloudflare-local`: it creates the protected, ignored `worker/.dev.vars` with a fresh `LACE_AUTH_SECRET`, development mode and the local origin `http://127.0.0.1:8787/`, and refuses to replace an existing file. Local values override the configuration's production `vars` only during development. Never commit `worker/.dev.vars`.

Run migration, sync and bootstrap while `cf:dev` is stopped; they and `cf:dev` share the simulated D1 and R2 state in `.lace/data/cloudflare`, which survives restarts. Bootstrap prints one expiring setup token: open `http://127.0.0.1:8787/admin/`, create the first administrator with it and sign in. `cf:dev` also exposes `/__scheduled` to trigger the recovery handler manually. To reset local data, stop `cf:dev` and delete `.lace/data/cloudflare` deliberately; it removes local content, accounts and media.

`LACE_D1_DATABASE_ID` in `.env` must equal the `DB` `database_id` in `worker/wrangler.jsonc`; the CLI reports a mismatch without running. Local state is keyed by that ID, so replacing the placeholder with your real database ID starts with an empty local database: migrate, sync and bootstrap again.

`pnpm cf:build` bundles the Worker with Wrangler's dry run into `.lace/data/cloudflare-bundle` without credentials, which checks your configuration and `lace.config.ts` before deploying.

### Local journey and diagnosis

`.env` serves both runtimes. Its `LACE_API_BASE_URL` and `LACE_PUBLIC_BASE_URL` default to the Node API at `http://127.0.0.1:3000/`; while you work with the local Worker, set both to `http://127.0.0.1:8787/` (the origin in `worker/.dev.vars`), and change them back for the Node runtime.

1. With `cf:dev` running, open `http://127.0.0.1:8787/admin/`. The setup screen asks for an email, a password of at least 12 characters and the token printed by `pnpm cf:auth:bootstrap`. After setup, sign in.
2. Upload media, edit and publish entries in Admin. Each publication requests a site build. The build is dispatched after a short debounce, by the post-publication pass or the scheduled trigger.
3. In Admin Settings, issue a read-only build token and keep it private.

<!-- lace-site: starter existing -->

4. Build the site against the local Worker: put the token into `LACE_BUILD_TOKEN` in `.env` (or pass it to the command), then run `pnpm dev` or `pnpm build`. Rendered media URLs use the Worker origin; unpublished drafts never reach the build export.

<!-- lace-site: end -->

Diagnose without changing anything:

```bash
pnpm exec lace doctor --target cloudflare-local --stage setup
pnpm exec lace doctor --target cloudflare-local --stage ready
```

Before `cf:dev` runs, `setup` reports the unreachable Worker as expected and skips migration evidence, and `ready` fails. With the Worker running and a build token present, `ready` passes with migration readiness derived from the Worker's `/health/ready`. Doctor never starts the Worker or creates `.lace/data/cloudflare`. For your account use the explicit private-file remote diagnosis described below; doctor reads the remote D1 ledger and does not verify deployment permissions.

### Recovery

- **Expired or lost setup token.** Tokens expire after one hour. The setup screen then reports that setup is still incomplete and creates no account. Stop `cf:dev`, run `pnpm cf:auth:bootstrap` again for a fresh token, start `cf:dev` and retry. After setup completes, bootstrap reports that setup is closed.
- **Deploy hook unavailable or rejected.** Publication stays committed. The build stays `pending` with a sanitized reason (`trigger_unavailable` for timeouts, throttling, server errors or network failures; `provider_failed` for rejected or revoked hooks), and the scheduled trigger retries with backoff, up to eight attempts. The build then becomes `failed`. Fix the hook, then use Retry in Admin. Locally no cron runs by itself: `cf:dev` exposes `http://127.0.0.1:8787/__scheduled` to run the scheduled handler once.
- **Accepted is not deployed.** Without Pages tracking, when the provider accepts the hook Admin records the build as `accepted`, with the provider's deployment ID when it returns one. `accepted` never proves the site changed: confirm the deployment's result in your provider before you treat the site as updated, and retry the build in Admin if it failed. Upgrading from an earlier alpha records former `running` hook builds, and hook `succeeded` builds without a deployment ID, as `accepted`.
- **Pages deployment tracking.** Set `LACE_PAGES_ACCOUNT_ID` and `LACE_PAGES_PROJECT_NAME` in `worker/wrangler.jsonc` `vars` and the Worker secret `LACE_PAGES_API_TOKEN` (a separate token with only _Account · Cloudflare Pages · Read_, never your operator token). Identified hook builds then stay `running` while the scheduled Worker reads that exact deployment every minute; Builds shows the Pages stage and last check. Only a successful deploy stage becomes `succeeded`; build or deploy failure is `failed` (`provider_build_failed`, `provider_deploy_failed`), cancel or skip is `cancelled`, and a missing permission (`tracking_forbidden`), an unknown deployment (`tracking_not_found`) or no result within `LACE_PAGES_TRACKING_TIMEOUT_MINUTES` (default 60, 5–1440; `tracking_timeout`) is `unknown`. Temporary Pages API errors are retried with backoff until that deadline, so no build stays `running` longer. Removing the settings ends tracked builds as `unknown` (`tracking_unconfigured`). Retry `failed`, `cancelled` or `unknown` builds in Admin after checking Pages.
- **Restarts.** Content, accounts, setup state and media survive `cf:dev` restarts in `.lace/data/cloudflare`. Reset only by deleting that directory with the Worker stopped.
- **Worker unavailable.** The Worker answers with a generic unavailable error and logs only the names of missing or invalid variables. Check `worker/.dev.vars` locally or the Worker's secrets and `vars` remotely.

### Choose Cloudflare management credentials

Work from this generated CMS root; Wrangler commands use `--config worker/wrangler.jsonc` in the default environment. Local `cf:*` scripts stay local. Remote commands need an explicit account and database; local content is not copied to your account.

Choose one of these management workflows:

| Choice            | Lace remote migrate/sync/bootstrap                                                   | Wrangler deploy/secrets                                                                         |
| ----------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Split credentials | D1-scoped API token in `.lace/cloudflare-operator.env`, loaded with `--operator-env` | OAuth from a one-time `pnpm exec wrangler login`; no API token in shell, `.env` or `.env.local` |
| Single token      | One sufficiently scoped token in the same private file                               | Explicitly load that file only for the intended Wrangler invocation                             |

An operator token needs **Account · D1 · Edit** for remote D1 operations. The single-token choice additionally needs **Account · Workers Scripts · Edit** (current equivalent Workers Editor for an existing Worker; creating one may need Workers product Admin), **Account · Account Settings · Read** for account resolution, **Account · Workers R2 Storage · Edit** for bucket creation, **Account · Cloudflare Pages · Edit** for Pages operations, and **Account · Workers KV Storage · Edit** only for optional KV. Custom domain/route provisioning may also need **Zone · Workers Routes · Edit** and **DNS · Edit**. Scope the token to the intended account/resources. Check current provider permissions for each operation; a successful read-only probe does not prove write permissions. A D1-only token is insufficient for Worker deploy or secrets.

| Credential             | Purpose and location                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `LACE_AUTH_SECRET`     | CMS sessions/authentication; local Worker `worker/.dev.vars`, production Worker secret uploaded separately. Not a Cloudflare management token. |
| `CLOUDFLARE_API_TOKEN` | Account management; private operator file or intended process only. Never upload it as a CMS Worker secret.                                    |
| Wrangler OAuth         | Management login stored by Wrangler; never copied into the operator file or Worker.                                                            |
| Setup token / password | One-time first-admin setup / subsequent admin login; neither is a build credential.                                                            |
| `LACE_BUILD_TOKEN`     | Read-only published exports; private site build environment, never public browser configuration.                                               |
| `LACE_PAGES_API_TOKEN` | Separate Pages-Read-only Worker secret for deployment tracking; never reuse the operator token.                                                |

Create the private file once without overwriting an existing copy. The generated `.lace/` exists already:

```bash
node --input-type=module -e 'import { copyFile, chmod, constants } from "node:fs/promises"; process.umask(0o077); await copyFile("docs/cloudflare-operator.env.example", ".lace/cloudflare-operator.env", constants.COPYFILE_EXCL); await chmod(".lace/cloudflare-operator.env", 0o600);'
```

Edit it privately: set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `LACE_D1_DATABASE_ID` and `LACE_WRANGLER_CONFIG=worker/wrangler.jsonc`. The account ID is 32 hexadecimal characters. The D1 ID must match the `DB` binding. This file is ignored, user-owned and loaded only when selected; the CLI never sources shell code. Process values override it, including empty values. Selected-file failures never fall back. Do not add other assignments to the operator file.

For split credentials, remove API-token assignments from **both** `.env` and `.env.local` and clear `CLOUDFLARE_API_TOKEN` in the current shell before login or deploy. `unset CLOUDFLARE_API_TOKEN` alone is insufficient when Wrangler can reload a file. A plain `CLOUDFLARE_ACCOUNT_ID` may remain in `.env` to select the same account for Wrangler; align it with the private file and Worker configuration. Then:

```bash
unset CLOUDFLARE_API_TOKEN
pnpm exec wrangler login
pnpm exec lace cloudflare preflight --target cloudflare-remote --wrangler-auth oauth --operator-env .lace/cloudflare-operator.env
pnpm exec wrangler whoami --account <account-id> --config worker/wrangler.jsonc
```

Preflight reads only the explicit D1 endpoint (`SELECT 1`) and default-root credential inputs. It prints source categories and the validated account ID, never token values or private paths. `oauth-candidate` means no overriding token was found; OAuth login/account membership and Workers/Pages write permissions remain unverified. Inspect `whoami` and the operation permission checklist before deployment/secrets. Missing permissions, authorization rejection, conflicting account settings or stale dotenv tokens need correction before proceeding. Preflight itself never logs in, launches Wrangler, changes files or refreshes OAuth credentials. Named environments/profiles and alternative API-key authentication are outside its default-root scope and fail with advice.

For the single-token choice, explicitly load the same private file into these individual processes (the token stays out of shell arguments):

```bash
node --env-file=.lace/cloudflare-operator.env node_modules/@lacecms/cli/dist/bin.js cloudflare preflight --target cloudflare-remote --wrangler-auth token
node --env-file=.lace/cloudflare-operator.env node_modules/wrangler/bin/wrangler.js whoami --account <account-id> --config worker/wrangler.jsonc
node --env-file=.lace/cloudflare-operator.env node_modules/wrangler/bin/wrangler.js deploy --config worker/wrangler.jsonc
```

Use that explicit Wrangler invocation also for provisioning and `secret put` in the single-token choice. Login is unnecessary for a valid API token. Preflight reports when the intended Wrangler token differs from the Lace token; it cannot certify equal permissions.

**Alpha.2 upgrade:** install a compatible new CLI before using `--operator-env` or preflight. Template `0.15.0` supplies the example and managed guidance; published alpha.2 packages are immutable and do not gain these commands retroactively. `lace upgrade` preserves `.env`, `.env.local`, README, the private operator file, Worker configuration and site source. Manually move the legacy API token into the protected file, remove its assignments from both implicit dotenv files, clear the inherited token, then repeat preflight and `whoami`. Do not print/copy credentials through chat, logs or inline shell commands. Upgrade never relocates credentials automatically.

### Deploy the Worker to your account

Every provisioning/deployment command here is an explicit mutation of your Cloudflare account; generation, installation and the local `cf:*` scripts never perform them. Preflight and `whoami` are diagnostic steps. You need Workers, D1 and R2. First choose the credential workflow above; the commands below show split credentials, while the single-token choice uses its explicit Node env-file Wrangler invocation.

1. Provision: `pnpm exec wrangler d1 create <name>-cms --config worker/wrangler.jsonc` and `pnpm exec wrangler r2 bucket create <name>-media --config worker/wrangler.jsonc`. Optionally create a KV namespace for `CACHE`.
2. Configure: put the returned D1 ID into `worker/wrangler.jsonc`, local `LACE_D1_DATABASE_ID` in `.env` and remote `LACE_D1_DATABASE_ID` in the private operator file; align the account ID and public HTTPS origin. Configure `vars` with a trailing-slash `LACE_PUBLIC_BASE_URL`. Changing the D1 ID selects different local simulated data.
3. Preflight: `pnpm exec lace cloudflare preflight --target cloudflare-remote --wrangler-auth oauth --operator-env .lace/cloudflare-operator.env`, then `pnpm exec wrangler whoami --account <account-id> --config worker/wrangler.jsonc` and review operation permissions.
4. Secrets: `pnpm exec wrangler secret put LACE_AUTH_SECRET --config worker/wrangler.jsonc` with at least 32 random bytes, optionally `LACE_DEPLOY_HOOK_URL` and the separate `LACE_PAGES_API_TOKEN`. Secret changes can create/deploy a Worker version; they are explicit account mutations.
5. Migrate and sync: `pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`, then `pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`. Migration's Wrangler child receives the selected D1 token/account only for that operation; subsequent independent Wrangler deploy uses your chosen workflow.
6. Deploy: `pnpm exec wrangler deploy --config worker/wrangler.jsonc`.
7. Bootstrap: `pnpm exec lace auth bootstrap --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`, then create the first administrator at `<LACE_PUBLIC_BASE_URL>admin/`.

Redeploy after editing `lace.config.ts`, and sync with the remote target before the new Worker serves editors. Verified real-account deployment remains release-gate work; local/stub tests do not prove it. Remote doctor, if needed, can be run with explicit private-file loading: `node --env-file=.env --env-file=.lace/cloudflare-operator.env node_modules/@lacecms/cli/dist/bin.js doctor --target cloudflare-remote --stage setup`; review the remote API origin in `.env` first. Doctor is not credential preflight.

<!-- lace-site: starter existing -->

### Deploy the static site separately

The Astro site is a separate static deployment; deploying it never deploys, migrates or configures the CMS Worker, and deploying the Worker never publishes the site. The generated manual workflow `.github/workflows/cloudflare.yml` installs and builds `{{SITE_PATH}}` and deploys `{{SITE_PATH}}/dist` with `wrangler pages deploy` to the Pages project named by the `CLOUDFLARE_PAGES_PROJECT` variable. Set repository variables `LACE_API_BASE_URL` (the Worker origin, used to read the authenticated build export) and `LACE_PUBLIC_BASE_URL` (the Worker's public origin, used in rendered media URLs), and secrets `LACE_BUILD_TOKEN` (a read-only token from Admin Settings), `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. After building, `pnpm exec wrangler pages dev {{SITE_PATH}}/dist` previews the output locally.

To rebuild after publication, the site needs a deploy hook. Cloudflare Pages offers deploy hooks only for projects connected to a Git repository, which build the site themselves: set the project's root directory to this project, build command `pnpm build`, output directory `{{SITE_PATH}}/dist`, and build variables `LACE_API_BASE_URL`, `LACE_PUBLIC_BASE_URL` (both the Worker origin) and an encrypted `LACE_BUILD_TOKEN`. The manual workflow above uploads directly and has no hook, so with it you rebuild by running the workflow yourself. Another provider works if its build hook accepts a bodiless `POST` without credentials. Store the hook URL only as the Worker secret `LACE_DEPLOY_HOOK_URL`. Admin then records whether the provider accepted the hook (`accepted`, with the provider's deployment ID when returned); acceptance is not proof of a successful static deploy. Enable Pages deployment tracking (see Troubleshooting) to have Admin record the deployment's proven outcome instead.

<!-- lace-site: end -->
<!-- lace-site: none -->

This project has no site, so it has no static-site workflow and the Worker declares no build-site identity; build requests report that no trigger is configured until you connect a site.

<!-- lace-site: end -->
<!-- lace-cloudflare: end -->
<!-- lace-cloudflare: off -->

## Optional Cloudflare

This project was generated without `--cloudflare`. Generating with `--cloudflare` adds a separate CMS Worker in `worker/` (D1, R2, packaged admin and local `cf:*` commands) and, with a site, a manual Cloudflare Pages workflow for the static site. To adopt it, generate a fresh project with the same site mode and `--cloudflare` in a temporary directory and compare its `worker/` files, root `package.json` and `.env.example`; keep remote mutations explicit.

<!-- lace-cloudflare: end -->

## Selecting the build site

<!-- lace-site: starter -->

This project's generated defaults select the starter `site/` (source root `.`, site directory `site`, output `dist`).

<!-- lace-site: end -->
<!-- lace-site: existing -->

This project's generated defaults select the existing site at `{{SITE_PATH}}` as a standalone Astro root: `LACE_BUILD_SOURCE_ROOT={{SITE_PATH}}`, `LACE_BUILD_SITE_DIR=.` and `LACE_BUILD_OUTPUT_DIR=dist`. For a site that is a package inside a pnpm workspace, select the workspace root and the package directory instead.

<!-- lace-site: end -->
<!-- lace-site: none -->

This project was generated without a site, so its Compose file has no builder and no build-site identity. Upgrades keep the recorded mode and never add a site. To connect a site later, connect it as described in [Connect an existing Astro site](lace-astro-site.md), generate a fresh project with `create-lace <dir> --existing-site <path>` in a temporary directory, and move its builder service, dispatcher and API build settings and `.env` build-site settings into this project after comparing them. The selection rules below then apply.

<!-- lace-site: end -->

Build-site selection (introduced in template `0.7.0`) requires `0.1.0-alpha.2` or later compatible API, admin, CLI and builder artifacts. Published `0.1.0-alpha.1` images are not retroactively updated; this configuration does not publish or download replacement artifacts. Upgrade managed infrastructure with conflict review, retain user-owned README/site/config and manually incorporate guidance in an existing README.

The builder mounts `LACE_BUILD_SOURCE_ROOT` from the host read-only at `/source`. Compose resolves a relative host path against its project directory and refuses to create a missing source directory. Container paths are separate: `LACE_BUILD_SITE_DIR` selects an Astro project relative to `/source`, and `LACE_BUILD_OUTPUT_DIR` selects a static result relative to that project. Install uses `/source/pnpm-lock.yaml` and its root package/workspace declarations, with frozen pnpm and the image-pinned toolchain. It never guesses which example to build. Served releases remain in the shared `/output` volume; your host `dist` is not overwritten.

| Layout                                        | Host source root | Site directory | Output directory |
| --------------------------------------------- | ---------------- | -------------- | ---------------- |
| Generated CMS project                         | `.`              | `site`         | `dist`           |
| Existing standalone Astro root, CMS in `cms/` | `..`             | `.`            | `dist`           |
| Existing workspace with `web/` and `cms/`     | `..`             | `web`          | `dist`           |

Set these values in the CMS `.env`. For the standalone parent-root example:

```dotenv
LACE_BUILD_SOURCE_ROOT=..
LACE_BUILD_SITE_DIR=.
LACE_BUILD_OUTPUT_DIR=dist
LACE_BUILD_SITE_ID=public-site
LACE_BUILD_SITE_LABEL="Public site"
```

The selected root must contain its regular `package.json` and `pnpm-lock.yaml`; a selected workspace package needs the root `pnpm-workspace.yaml` and must belong to that installation. Mount an independent site's own lockfile root rather than choose a package with a separate nested lockfile. Astro must be a direct dependency/dev dependency of the selected package. Paths cannot be absolute inside `/source`, escape with `..`, contain symlinks or select source/configuration directories as output. `.` is permitted only for the site directory. Existing output, dependencies, Git, environment credentials and nested CMS `.lace/data` are filtered from scratch copies.

An existing site requires the Lace site packages, a server-only loader file, user-owned routes, the block map and block components. Follow [Connect an existing Astro site](lace-astro-site.md): it keeps one validated export per static build, expected published-version validation, draft isolation, all five built-in blocks, safe rich text/URLs and public media origins. Build-site selection does not install components or modify your existing source (run `pnpm exec lace add block --all --site <path>` from the CMS directory for the block components), and `create-lace init .` still requires an empty target. Install compatible dependencies and commit a reproducible pnpm lockfile in the selected root before building.

The image runs frozen installation followed by direct `pnpm --dir <selected-site> exec astro build --outDir <selected-output>`. Custom package build/prebuild scripts are not selected. Only static Astro output is served; SSR/server output, incomplete output, linked files, frozen-install failure and version mismatch fail the build. The trusted site configuration and normal dependency hooks still execute during installation/Astro compilation. There is no custom command or extra environment forwarding interface.

`LACE_BUILD_SITE_ID` is a 1–64 character lowercase kebab-case name. `LACE_BUILD_SITE_LABEL` is a 1–80 character display name using ASCII letters/digits, spaces, hyphens and underscores, beginning/ending with a letter or digit. Supply names, never paths, URLs or credentials. Generated Compose supplies the same identity to API and builder. For manual Node/Worker deployments set the identity explicitly; absent identity is shown as unconfigured. Builds shows current configuration separately from historical build records; it does not verify mount accessibility or provider completion.

Review `docker compose config` privately, then recreate affected services using compatible images with `docker compose up -d --force-recreate api dispatcher builder`. Use the existing administrator Request build/Retry build actions in Builds. If a mount is missing or inaccessible, correct the host bind and permissions; if installation/build fails, correct the selected dependencies/lockfile/source and retry. The trigger still accepts only build ID and published version; no HTTP request can change source, command, arguments or environment. A failed build preserves the current complete release until a successful retry switches it atomically. Keep internal `http://api:3000/` export transport separate from `LACE_PUBLIC_BASE_URL` for browser-facing media. Stop without deleting volumes to preserve data and releases.

### Builder source diagnostics

With compatible 33C API, dispatcher, admin and builder artifacts, the disposable
copy also excludes the exact installation-root `AGENTS.md` and `CLAUDE.md`
entries, including links, without reading their targets. Other included links
are rejected, even when they point inside the installation. The same filenames
inside site source are not excluded.

Builds details shows a specific failure, its correction, the build ID and an
optional source entry relative to the selected installation root. Paths are
bounded ASCII text; absolute host/container locations, link targets, credentials
and raw process output are never shown. Unsafe entry names are omitted. For
`source_symlink`, replace the included link with regular source; for
`source_unreadable`, restore read/traverse access for the builder's `node` user;
for `source_missing`, restore the required entry; for `source_special_file`,
remove or replace the special entry. `source_invalid` requires checking selected
paths, manifests and the Astro dependency. `install_failed`, `build_failed` and
`version_changed` respectively require correcting dependencies/lockfile, the
local Astro build, or building the latest published version. Connectivity and
timeout failures have separate guidance; `provider_failed` is only the unknown
failure fallback.

Pending errors retain their explanation during automatic retries. After eight
failed attempts, correct the source and use the administrator Retry build
action. The previous complete release remains served throughout failure.
Upgrade API, dispatcher, admin and builder together. Legacy reason-only errors
remain readable; new path-bearing diagnostics use the existing SQL error text
column. Before downgrading, stop dispatch, back up the database and convert
validated structured error records to their reason strings, discarding path
metadata without deleting history or changing statuses/attempts.

This section defines deployment selection; a configured identity does not prove a successful deployment. See [publication visibility](#when-published-content-becomes-visible) for dev, manual and automatic behavior after publication.
