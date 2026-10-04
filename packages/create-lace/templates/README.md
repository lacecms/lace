# Your Lace site

<!-- lace-site: starter -->
Lace is a single-site CMS with a user-owned static Astro website. Edit `lace.config.ts` and `site/`; the API/admin and builder come from packaged runtimes. Detailed instructions and recovery: [Lace operations](docs/lace-operations.md).

Site mode: **starter**. The editable Astro site is `site/`, generated from the Lace starter.
<!-- lace-site: end -->
<!-- lace-site: existing -->
Lace is a single-site CMS for your existing static Astro website. Edit `lace.config.ts` here and your site's own source; the API/admin and builder come from packaged runtimes. Detailed instructions and recovery: [Lace operations](docs/lace-operations.md).

Site mode: **existing site** at `{{SITE_PATH}}` (relative to this directory). This project contains no `site/` directory, and the generator did not modify your site. Connect it with the steps in [Connect and build your existing site](#connect-and-build-your-existing-site).
<!-- lace-site: end -->
<!-- lace-site: none -->
Lace is a single-site CMS. Edit `lace.config.ts`; the API/admin come from packaged runtimes. Detailed instructions and recovery: [Lace operations](docs/lace-operations.md).

Site mode: **none**. This project contains the CMS only and builds no site: Compose has no builder, build requests fail until a site is configured, and Admin shows an unconfigured site. To connect an Astro site later, follow [Connect an existing Astro site](docs/lace-astro-site.md) and configure build-site selection as described in [Lace operations](docs/lace-operations.md#selecting-the-build-site).
<!-- lace-site: end -->

## Prerequisites and installation

Use Node `>=24.12.0 <25`, pnpm `>=12 <13` (this project pins 12.3.4), Docker with Compose and a running daemon. API/builder images must match the Lace package release. MinIO's first image build needs network access and disk space.

This source quickstart requires packages/images built from Step 27B or a later compatible release, including environment preparation and doctor. Published `0.1.0-alpha.1` artifacts retain their older behavior; this source template does not update them. Package/image coordinates still identify that alpha pending a separate coherent artifact refresh. Use a release that includes these steps when available; coordinates are downloadable only after owner publication. Repository verification uses local artifacts.

Generate with the selected compatible generator (`pnpm create lace@<release> my-site`), or use `pnpm dlx create-lace@<release> init .` in an otherwise empty repository. Replace `<release>` with that exact version. Only `.git`, `README.md` and `LICENSE` may already exist; arbitrary existing applications are not valid init targets. For a CMS directory named `cms/`, generate there and run these commands from `cms/`.

From your generated installation root:

```bash
pnpm install
pnpm env:prepare
```

Preparation creates a protected ignored `.env` with random auth, MinIO and builder credentials and an empty `LACE_BUILD_TOKEN`. It prints no secrets and refuses to overwrite an existing `.env`; retain and review existing settings privately. Never commit `.env`. POSIX permissions are `0600`; verify owner-only ACLs on Windows.

Review `.env`: `LACE_DATABASE_PATH` defaults to `./.lace/data/lace.sqlite`, and both host `LACE_PUBLIC_BASE_URL` and `LACE_API_BASE_URL` default to `http://127.0.0.1:3000/`. Change both URLs when changing the API port. Use the exact public origin for admin login; `localhost` and `127.0.0.1` differ. `LACE_API_BASE_URL` transports authenticated exports; `LACE_PUBLIC_BASE_URL` supplies browser-facing API/media URLs. Keep public path prefixes and a trailing slash; configure your proxy accordingly. Review matching `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE` references.

## Prepare and start the CMS

```bash
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm db:migrate
pnpm content:sync
pnpm auth:bootstrap
pnpm dev:api
```

Doctor is read-only. During `setup`, a missing database, unavailable API or empty build token is an expected next step, not proof of readiness. Correct failed prerequisites before proceeding. A running WAL database cannot be inspected without possible writes; doctor refuses that ledger probe. See [doctor limits and exit codes](docs/lace-operations.md#read-only-environment-checks) and the separate API readiness result.

Migrate explicitly before startup; the API does not migrate automatically. Matching current packages create missing database parent directories, so no manual `mkdir` is needed. Sync registers Home/Posts and creates the Home draft. Bootstrap prints one expiring setup token: capture it privately. `dev:api` starts MinIO, its initialization/migration service and API/admin; check `/health/ready` at the configured API origin before submitting setup.

## Create the first administrator

With API/admin artifacts built after Step 28A or a later compatible release, open `/admin/` at the configured `LACE_PUBLIC_BASE_URL` origin. While installation setup is incomplete, enter your email, a password of 12–1024 characters, and the operator-issued bootstrap token, create the administrator, then sign in normally. After an interruption, retry with the same token and email; completed setup stays closed. The originally published `0.1.0-alpha.1` artifacts predate browser setup.

The API alternative uses `POST /api/v1/setup/admin` with exactly `token`, `email` and `password` (12–1024 characters). The following is a placeholder-only request: replace `<PUBLIC_API_BASE_URL>` with your configured `LACE_PUBLIC_BASE_URL`, including any path prefix and its trailing slash; use the token just issued by bootstrap and a password of at least 12 characters.

```bash
curl --fail-with-body --silent --show-error --request POST \
  '<PUBLIC_API_BASE_URL>api/v1/setup/admin' \
  --header 'Content-Type: application/json' \
  --data '{"token":"<SETUP_TOKEN>","email":"<ADMIN_EMAIL>","password":"<PASSWORD_AT_LEAST_12_CHARACTERS>"}'
```

Replacing inline placeholders with real credentials exposes them in shell history and process arguments. Prefer the [private-input setup script](docs/lace-operations.md#migrate-sync-and-create-the-first-administrator), which reads the configured `LACE_PUBLIC_BASE_URL` and prompts without putting credentials in shell history.

If an unused token expires, run `pnpm auth:bootstrap` again while setup is incomplete. Successful setup consumes the token and closes the endpoint (later requests return 404); bootstrap then refuses another token. Sign in with the existing administrator instead. A setup token is neither a password nor a build token.

Open `/admin/` at `LACE_PUBLIC_BASE_URL` (default `http://127.0.0.1:3000/admin/`) and sign in. In Settings create a read-only build token and privately put its one-time value into `LACE_BUILD_TOKEN` in `.env`. It reads published exports only. Keep it server-side; never put it in `VITE_*`, `LACE_PUBLIC_*`, browser code, HTML or source control.

<!-- lace-site: starter -->
## Publish and view the site

In Admin, open Home, set a title, add blocks, save the draft and publish as an admin. For blog routes create a Posts entry with title and valid slug, then publish. Editors save drafts; publication requires an admin. Upload/select images through Media.

```bash
pnpm dev
# Run a fresh static build after publishing Home:
pnpm build
pnpm typecheck
```

Astro dev normally prints `http://localhost:4321/`. After publication, reload: dev revalidates the published export, so changes to `/` and existing posts appear without a restart. Restart dev only for a new or renamed post slug (Astro caches static paths) or token/environment changes. A static build reads one authenticated published export for `/` and `/blog/:slug`. Draft saves do not change published content, and publication alone does not change an existing `site/dist/` or deploy a manual static build; run a fresh build and deploy it yourself. Missing tokens, unavailable API and unpublished Home give actionable errors. Deploy `site/dist/` through your chosen static host after building.

For automatic Compose builds, with a real build token configured:

```bash
pnpm prod:start
```

The fixed-command builder explicitly selects the generated `site/` by default. To build an existing standalone or workspace Astro site alongside a CMS directory, configure its host source mount and relative project/output as described in [build-site selection](docs/lace-operations.md#selecting-the-build-site). Builds and administrator Settings show the safe current site identity; this is configuration rather than proof of deployment. Publication queues a build; request another through Settings if an earlier publication was already processed. Check Builds for success/failure; the web proxy serves `http://127.0.0.1:8080/` and switches to new content only after a successful release (a build may show Pending until just after the switch). Failures retain the previous successful output. See [when published content becomes visible](docs/lace-operations.md#when-published-content-becomes-visible) for every mode. The builder uses `http://api:3000/` internally for exports, while rendered media uses your public API URL.

```bash
pnpm dev:stop
# Or, for the full deployment:
pnpm prod:stop
```

These stop commands preserve `.lace/data/` and MinIO/static-output volumes. Stop Astro with Ctrl-C in its terminal. Restart using the corresponding start command. Removing volumes or database files is a deliberate destructive reset; back up valuable content first.

## Customize configuration and Astro

- `lace.config.ts` defines the singleton Home page (`/`) and Posts collection (`/blog/:slug`), fields and permitted blocks. Review with `pnpm content:sync --check`, apply with `pnpm content:sync`, and restart the API after config edits. Incompatible structural changes to populated models are blocked; a version increment does not migrate content.
- `site/src/pages/index.astro` and `site/src/pages/blog/[slug].astro` own routes. Adding a model does not generate a route; add a page that reads the published site by path (`site.byPath("/about")`) or by model and slug (`site.entries("notes")`, `site.bySlug("notes", slug)`).
- `site/src/lib/lace.ts` creates the server-only loader with `createAstroSiteLoader` from `@lacecms/astro`. It reads one validated published build export per static build, revalidates it in `pnpm dev`, and keeps the build token out of browser code. Loading, block validation and safe rich text come from the `@lacecms/sdk`, `@lacecms/render` and `@lacecms/astro` packages, so upgrading them fixes every site.
- `site/src/components/lace/` holds the five block components (hero, richText, image, quote, cta). They are your source: edit their markup freely. `site/src/lace/blocks.ts` maps block types to components and `site/lace.site.json` records the installed block versions and hashes; `pnpm exec lace add block` maintains both, updates unmodified components after a CLI upgrade, scaffolds custom blocks and reports edited files as conflicts instead of overwriting them. Unknown blocks fail the build with model, entry and block identifiers.
- `site/src/layouts/BaseLayout.astro` owns the page shell; `site/src/styles/global.css` owns styling. Use stable `data-lace-model`, `data-lace-entry`, `data-lace-block`, `data-lace-block-key` and `data-lace-part` hooks. See [configuration and styling](docs/lace-operations.md#configuration-routes-renderers-and-styling).

README, `lace.config.ts` and `site/**` are user-owned and upgrades preserve edits. To connect an Astro site you already have instead, follow [Connect an existing Astro site](docs/lace-astro-site.md). If `init .` kept your existing README, the CLI points to `docs/lace-operations.md`; manually incorporate relevant Lace instructions there if desired. Operations is managed with hash/conflict review.
<!-- lace-site: end -->
<!-- lace-site: existing -->
## Connect and build your existing site

In Admin, open Home, set a title, add blocks, save the draft and publish as an admin. Editors save drafts; publication requires an admin. Upload/select images through Media.

Your Astro site at `{{SITE_PATH}}` reads published content through the Lace site packages. The generator did not modify it; connect it once:

1. In the site, install `@lacecms/sdk`, `@lacecms/astro`, `@lacecms/render` and `@lacecms/content` at the release version of this project's Lace packages (for example `pnpm --dir {{SITE_PATH}} add @lacecms/sdk@<release> @lacecms/astro@<release> @lacecms/render@<release> @lacecms/content@<release>`).
2. From this directory, install the block components and block map into the site:

```bash
pnpm exec lace add block --all --site {{SITE_PATH}}
```

3. Create the server-only loader file and your routes as described in [Connect an existing Astro site](docs/lace-astro-site.md).
4. Build with this project's root scripts, which run Astro in the site:

```bash
pnpm dev
# Run a fresh static build after publishing Home:
pnpm build
```

A static build reads one authenticated published export with `LACE_API_BASE_URL` and `LACE_BUILD_TOKEN` from the environment; publication alone does not change an existing `{{SITE_PATH}}/dist/` or deploy it. For automatic Compose builds, with a real build token configured:

```bash
pnpm prod:start
```

The fixed-command builder mounts `{{SITE_PATH}}` read-only and builds it as a standalone Astro root (`LACE_BUILD_SOURCE_ROOT={{SITE_PATH}}`, `LACE_BUILD_SITE_DIR=.`, `LACE_BUILD_OUTPUT_DIR=dist`); the site needs its own committed `pnpm-lock.yaml`. For a site that is a package inside a pnpm workspace, adjust these settings as described in [build-site selection](docs/lace-operations.md#selecting-the-build-site). Publication queues a build; check Builds for success/failure. The web proxy serves `http://127.0.0.1:8080/` and switches to new content only after a successful release; failures retain the previous successful output. See [when published content becomes visible](docs/lace-operations.md#when-published-content-becomes-visible).

```bash
pnpm dev:stop
# Or, for the full deployment:
pnpm prod:stop
```

These stop commands preserve `.lace/data/` and MinIO/static-output volumes. Removing volumes or database files is a deliberate destructive reset; back up valuable content first.

## Customize configuration

`lace.config.ts` defines the singleton Home page (`/`) and Posts collection (`/blog/:slug`), fields and permitted blocks. Review with `pnpm content:sync --check`, apply with `pnpm content:sync`, and restart the API after config edits. Your site owns its routes, layouts and styles; after adding a block type to the configuration, run `pnpm exec lace add block --all --site {{SITE_PATH}}` again. README and `lace.config.ts` are user-owned and upgrades preserve edits; upgrades never create or change files in your site. Operations is managed with hash/conflict review.
<!-- lace-site: end -->
<!-- lace-site: none -->
## Publish content

In Admin, open Home, set a title, add blocks, save the draft and publish as an admin. For blog routes create a Posts entry with title and valid slug, then publish. Editors save drafts; publication requires an admin. Upload/select images through Media.

Published content is available to build tokens through the authenticated build export, but this project builds no site: Builds and Settings show an unconfigured site and build requests fail as unavailable. `pnpm prod:start` starts the API/admin, MinIO, dispatcher and web proxy; the web proxy answers `/admin/` and `/api/`, and `/` reports that no site build exists yet.

```bash
pnpm dev:stop
# Or, for the full deployment:
pnpm prod:stop
```

These stop commands preserve `.lace/data/` and MinIO/static-output volumes. Removing volumes or database files is a deliberate destructive reset; back up valuable content first.

## Customize configuration

`lace.config.ts` defines the singleton Home page (`/`) and Posts collection (`/blog/:slug`), fields and permitted blocks. Review with `pnpm content:sync --check`, apply with `pnpm content:sync`, and restart the API after config edits. README and `lace.config.ts` are user-owned and upgrades preserve edits. Operations is managed with hash/conflict review. Upgrades keep the no-site mode; to add a site, follow [Connect an existing Astro site](docs/lace-astro-site.md) and configure the build site, or generate a fresh project with `--existing-site <path>` and compare its managed files.
<!-- lace-site: end -->
<!-- lace-cloudflare: on -->

## Cloudflare Worker

This project includes its own CMS Worker in `worker/`, built from installed Lace packages (Step 31A or a later compatible release). Run it locally without a Cloudflare account:

```bash
pnpm env:prepare
pnpm cf:env:prepare
pnpm cf:db:migrate
pnpm cf:content:sync
pnpm cf:auth:bootstrap
pnpm cf:dev
```

Then open `http://127.0.0.1:8787/admin/`, create the first administrator in the setup screen with the bootstrap token and sign in. If the token expired, stop `cf:dev`, run `pnpm cf:auth:bootstrap` again and retry. The `cf:*` commands use the explicit `cloudflare-local` target and the persistent local state in `.lace/data/cloudflare`; run migration, sync and bootstrap while `cf:dev` is stopped. While you work with the Worker, set `LACE_API_BASE_URL` and `LACE_PUBLIC_BASE_URL` in `.env` to `http://127.0.0.1:8787/`; site builds and `pnpm exec lace doctor --target cloudflare-local --stage ready` then use the local Worker. `pnpm cf:build` checks the Worker bundle without credentials. The Worker and the static site are separate deployments: the Pages workflow never deploys the CMS. Provisioning D1/R2, secrets, remote migration and deployment are explicit account commands described in [Cloudflare Worker](docs/lace-operations.md#cloudflare-worker), with local diagnosis, recovery and the deploy-hook prerequisites. A deploy hook accepted by the provider is not proof of a successful site deployment.
<!-- lace-site: existing -->

GitHub reads workflows only from the repository root's `.github/workflows/`: move the generated workflow there and set its `working-directory` to this CMS directory, relative to the repository root. It installs and builds the site at `{{SITE_PATH}}` and deploys `{{SITE_PATH}}/dist`.
<!-- lace-site: end -->
<!-- lace-cloudflare: end -->
<!-- lace-cloudflare: off -->

## Optional Cloudflare

Generating with `--cloudflare` adds a separate CMS Worker (D1, R2 and packaged admin) and, with a site, a manual Pages workflow for the static site. See [Optional Cloudflare](docs/lace-operations.md#optional-cloudflare).
<!-- lace-cloudflare: end -->
