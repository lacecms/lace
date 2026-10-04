# Operating this Lace project

Run the generated project with packaged API/admin runtimes and an editable Astro site. You own `lace.config.ts` and `site/`; the engine checkout is unnecessary.

Start with the generated root `README.md` for the concise quickstart. README is user-owned, without a manifest hash; upgrades preserve its edits. If `init .` encounters an allowed existing README, it preserves every byte and prints this guide's path. Follow this guide directly or manually copy relevant Lace instructions into your existing README. In a `cms/` installation these paths and commands are relative to `cms/`, not its parent application. This guide is managed with hash/conflict review.

## Prerequisites and generation

Use Node `>=24.12.0 <25`, pnpm 12 and Docker Compose. Obtain compatible Lace packages, generator and API/builder image tags from the same release. This source template uses ownership template `0.8.0`; published Lace `0.1.0-alpha.1` packages/images retain their original template and behavior. The root quickstart and concise setup example require a generator built from Step 27B; its commands also need current matching packages/images. Package and image coordinates remain `0.1.0-alpha.1` until the separate coherent alpha artifact refresh. The npm alpha channel is `next`; use the exact version below for reproducible generation of that published alpha's template, not a claim that it includes the current source quickstart. These coordinates become downloadable only after owner publication. Before publication, repository verification uses local artifacts; ordinary consumers must wait for a compatible publication rather than patch dependency references.

After the owner publishes the complete compatible alpha set, generate and install:

```bash
pnpm create lace@0.1.0-alpha.1 my-site
cd my-site
pnpm install
pnpm env:prepare
```

`pnpm env:prepare` runs the packaged `lace env prepare` before `.env` exists. It preserves the template's local settings, generates independent cryptographically random `LACE_AUTH_SECRET`, `LACE_MINIO_ROOT_ACCESS_KEY`, `LACE_MINIO_ROOT_SECRET` and `LACE_BUILDER_SECRET`, and leaves `LACE_BUILD_TOKEN` empty. It prints no credentials and publishes a complete `.env` with owner-only POSIX permissions (`0600`). On Windows, verify equivalent owner-only ACLs. Never commit `.env` or use default credentials.

Preparation refuses to replace any existing `.env`, including concurrent creation. If you already have one, retain it and review its settings privately; this command does not rotate credentials. A missing, symlinked or malformed `.env.example` must be restored as a regular file with one single-line `NAME=value` assignment for each generated credential and `LACE_BUILD_TOKEN`. Filesystem failures require checking directory permissions and hard-link support. If preparation was forcibly stopped, `.env` is either absent or fully written; private ignored `.lace-env-*` staging directories can be removed after confirming no preparation is running. Retry only when `.env` is absent.

This preparation flow requires packages packed from the revision that implements Step 26C (or a later compatible published release). Previously published `0.1.0-alpha.1` artifacts are not retroactively updated. The next coherent alpha artifact/version refresh is a separate release step.

## Read-only environment checks

With a CLI packed from Step 27A or a later compatible release, run from this project root:

```bash
pnpm exec lace doctor --target node --mode compose --stage setup
pnpm exec lace doctor --target node --mode compose --stage ready --json
```

Doctor reads a regular `.env`, then lets exported process variables override it; it does not require Node's `--env-file` option. It checks your `package.json` Node/pnpm engine ranges, generated Compose host settings, Docker Compose/daemon, migrations, anonymous API readiness through `LACE_API_BASE_URL` and build-token presence. Select `--mode native` only for an independently configured host Node runtime using its runtime variable names. Target and stage are required; native is the Node default and mode is invalid for Cloudflare. No tools are installed and no configuration or services are changed.

`setup` marks absent databases/ledgers, pending migrations, an unavailable API and the not-yet-issued build token as `expected`; `ready` treats them as failures. Settings/permission/lock/tool/authorization errors and a reachable API returning not-ready fail in both stages. Other check statuses are `pass`, `fail` and `skipped`; skipped checks explain their dependency or inapplicability. A present token remains unverified and is never sent. Readiness does not verify content sync, object storage, publication or a successful site build.

SQLite is inspected without writable runtime opening. WAL-mode databases report `DATABASE_UNAVAILABLE` rather than change SHM reader marks or create sidecars; consult the separate API readiness result. For an independent ledger inspection, stop all API/dispatcher/CLI database users, back up with trusted SQLite tooling, explicitly checkpoint successfully and switch to rollback journal mode (`PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;`), then repeat doctor. These are operator actions; doctor performs none of them. Ordinary Lace startup restores WAL. Never discard WAL/SHM files or use immutable mode on a live database.

Cloudflare needs an installed project-local Wrangler and an explicitly selected `LACE_WRANGLER_CONFIG` with a CMS `DB` binding matching `LACE_D1_DATABASE_ID`. The generated Pages-only file lacks that binding and complete CMS Worker onboarding remains future work. `--target cloudflare-local` additionally needs `LACE_CLOUDFLARE_PERSIST_TO` and a loopback API URL; migration readiness comes from the existing running Worker's readiness and is skipped while offline, without creating local state. `--target cloudflare-remote` needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` and performs only the selected D1 ledger read. Never substitute a remote target for an unavailable local Worker.

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

Migrations are explicit and repeatable; the API does not apply them on startup. With packages built after the fresh SQLite migration fix (26A), `pnpm db:migrate` creates missing parent directories for `LACE_DATABASE_PATH`, including `.lace/data`, and preserves existing database contents. No manual directory creation is needed with those rebuilt packages. The originally published `0.1.0-alpha.1` packages predate this fix; until a release includes it, those packages still require `mkdir -p .lace/data` before their first migration. Sync creates the singleton Home draft and registers Posts. Bootstrap prints a one-time setup token and expiry. Capture it privately. Bootstrap refuses after first-admin setup completes; for an expired unused token, run bootstrap again before completing setup.

With API/admin artifacts built after Step 28A or a later compatible release, open `/admin/` at the configured `LACE_PUBLIC_BASE_URL` origin. The browser shows setup while installation setup is incomplete. Enter your email, a password of 12–1024 characters, and the operator-issued bootstrap token, then create the administrator and sign in normally. The token expires after one hour. After an interruption, retry with the same token and email; the browser checks whether setup completed before offering another submission. Completed setup remains closed and later visitors see sign-in.

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

## Publish and build the editable site

In Admin open Home, set its title, add blocks, save and publish as the admin. Upload images through Media and select them in image/hero blocks. Both Home and Posts support `hero`, `richText`, `image`, `quote` and `cta`. For a blog page create a Posts entry, set a valid slug/title, save and publish. Editors can save drafts; publication requires an admin.

```bash
pnpm dev
# After publishing: reload dev; restart it only for new/renamed slugs or token/env changes.
pnpm build
pnpm typecheck
```

`dev` serves editable Astro at its printed URL, normally `http://localhost:4321/`. Each static build reads one authenticated published export and derives `/` and `/blog/:slug` routes from it. Publish Home before building. Later draft edits do not change built content. Missing/rejected credentials, unavailable API, unpublished Home and unsupported blocks fail with corrective diagnostics. See [publication visibility](#when-published-content-becomes-visible) for when each mode shows a publication.

## Full Compose build and persistence

Once the real build token is configured, run `pnpm prod:start`. It starts API/admin, MinIO, explicit migration, dispatcher, fixed-command builder and web proxy. The builder reads generated source read-only and publishes successful static releases atomically. Visit `http://127.0.0.1:8080/` after a successful build. Publication queues a build; Settings also offers an explicit build request. If earlier publications were already built, request a fresh build in Settings. Failed builds retain the last successful release; inspect build history and request retry after correcting the cause. Rendered images use the host API URL, not `http://api:3000/`.

`pnpm dev:stop` and `pnpm prod:stop` retain SQLite in `.lace/data/` and MinIO/static-output volumes. Restart with the corresponding start command. Use `docker compose down --volumes` and remove `.lace/data/` only for disposable test deployments after backing up valuable content.

## When published content becomes visible

Saving a draft never changes any site output and never requests a build. Publishing makes the saved revision the published snapshot that build tokens can read; what visitors see then depends on how the site is rendered. These behaviors were verified against a generated consumer with Template `0.8.0` and compatible Step 29B artifacts.

| Mode                               | After publication                                                                                                                                                                               | Next action                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Generated `pnpm dev`               | Changes to `/` and existing `/blog/:slug` pages appear on reload; dev revalidates the export with its ETag on each render. A new or renamed slug returns 404 because Astro caches static paths. | Reload. Restart `pnpm dev` only for new/renamed slugs or token/environment changes.                                |
| Manual static build (`pnpm build`) | Existing `site/dist/` output is unchanged.                                                                                                                                                      | Run a fresh `pnpm build`, then deploy `site/dist/` with your own host. Lace cannot see or confirm that deployment. |
| Compose (`pnpm prod:start`)        | Publication queues a build. The web proxy keeps serving the previous release until the builder switches a complete new one; a failed build keeps the previous release.                          | Watch Builds; reload after the build covering your publication succeeds.                                           |

On the VPS builder a build stays **Pending** while it waits and while the synchronous builder runs, then becomes **Succeeded** or **Failed**; **Running** appears only for providers that report an accepted deployment. The new release can be served a moment before Builds records success. Builds coalesce: one build may cover several publications, so look for a build whose target version is at least the version your publication queued. The web proxy sends `Cache-Control: no-cache` for site responses, so browsers revalidate with the file validators after a release switch instead of reusing heuristically cached HTML. Admin's entry editor follows the covering build and names the current build site, but a succeeded build does not prove a manual or provider deployment.

An existing site with its own SDK integration behaves according to its own code in Astro dev: data read in page code on every render appears on reload, while data passed through `getStaticPaths` props and any new routes stay as loaded until you restart dev. The generated `site/src/lib/lace.ts` and `site/src/pages/blog/[slug].astro` show the reload-friendly pattern while keeping one export per static build.

## Configuration, routes, renderers and styling

`lace.config.ts` defines models. `pnpm content:sync --check` reports pending/incompatible changes without writing (pending changes exit with code 2). Normal sync applies valid plans atomically and refuses incompatible changes without partial application. Changes to kind, fields, routes or allowed blocks on populated models can be blocked even with a version increment. This alpha has no general content migration tool; plan a deliberate migration instead of deleting production data. Restart API services after config changes to reload the mounted configuration.

Adding a model does not create an Astro route. Add the route in `site/src/pages/` and read its entries from `getSite()` in `site/src/lib/lace.ts`: `byPath(path)` for a page, `entries(model)` in `getStaticPaths` and `bySlug(model, slug)` on each render for a collection. A custom block needs a component in `site/src/components/lace/` and an entry in the `site/src/lace/blocks.ts` map whose definition is imported from the same module `lace.config.ts` uses: export the `defineBlock` value from a module, record its path relative to `site/` as `"definitions"` in `site/lace.site.json`, and run `pnpm exec lace add block <type>` to scaffold the component and register it. `pnpm exec lace add block --all` installs or updates the built-in block components for every configured block type; it updates only files you have not changed, reports edited components or an edited block map as conflicts with a diff, and never edits `package.json` (it prints the `pnpm add` command instead). Unknown blocks fail with model, entry and block identifiers. Block data is validated with the CMS rules before your component receives it, and `@lacecms/astro/RichText.astro` renders rich text only through the shared allowlist. These source files belong to you and upgrades never silently overwrite them.

Style in `site/src/styles/global.css`. Stable hooks are `data-lace-model`, `data-lace-entry`, `data-lace-block`, `data-lace-block-key` and `data-lace-part`; tags and incidental classes are not the selector contract:

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

## Optional Cloudflare Pages

`--cloudflare` adds Pages config and a manual workflow. After a build against your configured API, run `pnpm exec wrangler pages dev site/dist` for local Pages preview. Workflow installation needs compatible published packages; provide API/public URLs and build credentials in CI, never generated files. The CMS Worker is a separate versioned deployment. Complete Cloudflare consumer onboarding, real deployment, artifact preparation and the stable-MVP gate remain separate work.

## Selecting the build site

Build-site selection (introduced in template `0.7.0`) requires compatible freshly built Step 29A or later API, admin, CLI and builder artifacts (or a later compatible published release). Published alpha images are not retroactively updated; this configuration does not publish or download replacement artifacts. Upgrade managed infrastructure with conflict review, retain user-owned README/site/config and manually incorporate guidance in an existing README.

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

This section defines deployment selection; a configured identity does not prove a successful deployment. See [publication visibility](#when-published-content-becomes-visible) for dev, manual and automatic behavior after publication.
