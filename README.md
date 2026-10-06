# Lace

Lace is a self-hosted headless CMS with a static Astro site. This repository's
supported local workflow starts the complete Node, SQLite, MinIO, Admin, and
Astro development stack through one same-origin gateway.

## Local development

### Prerequisites

- Docker Desktop with Docker Compose v2;
- Node 24.12–24.x and pnpm 12;
- workspace dependencies installed with `pnpm install` (the containers install
  Linux-native dependencies separately).

Create the ignored local environment once. It generates unique local-only
credentials; do not commit `.env` or paste its contents into issues or logs.

```sh
pnpm dev:env
```

Start the stack:

```sh
pnpm dev:node
```

The command builds the development container, applies committed forward SQLite
migrations, creates the private MinIO bucket, and waits for the API, Admin, and
Astro development servers to become healthy. It preserves the named
`lace-dev-sqlite-data` and `lace-dev-minio-data` volumes across ordinary stops.

Open these URLs in the browser:

| Surface | URL |
| --- | --- |
| Node API and health | `http://127.0.0.1:3000/api/`, `http://127.0.0.1:3000/health/ready` |
| Admin | `http://127.0.0.1:3000/admin/` |
| Astro site | `http://127.0.0.1:3000/` |

The local admin also accepts `http://localhost:3000/admin/` on the same port.
Browser sessions are scoped to the hostname, so switching between `localhost`
and `127.0.0.1` may require signing in again. Restart the local API after
changing authentication code.

MinIO has no host port in this topology. The browser never receives its Docker
hostname or object-store credentials. API and health paths stay in the Node
application; `/admin/*` and site routes are proxied through the same origin,
including supported Vite/Astro upgrade connections.

### First administrator

With the stack running, mint one expiring setup credential:

```sh
pnpm dev:bootstrap
```

The command prints the plaintext token once and stores only its hash. Open
`http://127.0.0.1:3000/admin/` (or your configured API origin). While setup is
incomplete, the browser asks for your email, a password of 12–1024 characters,
and that bootstrap token. Create the administrator, then sign in normally.

Alternatively, use the existing setup API with placeholders replaced privately:

```sh
curl --fail-with-body http://127.0.0.1:3000/api/v1/setup/admin \
  -H 'content-type: application/json' \
  --data '{"email":"admin@example.test","password":"choose-a-long-password","token":"PASTE_THE_ONCE_SHOWN_TOKEN"}'
```

The token expires after one hour; ask the operator to mint a new one if it
expired before completion. After an interrupted request, retry with the same
token and email. The browser rechecks state after an ambiguous response and
shows sign-in when setup is already complete. The setup endpoint closes
permanently after completion. The local stack applies migrations only;
configuration synchronization remains a deliberate operator operation.

### Show published content on the local site

The initial Astro site uses its committed fixture so the stack can start before
an administrator or build credential exists. After first-admin setup, run
`pnpm content:sync`, open `/admin/content`, and publish the `home` page. The
local site needs a published home entry to enter live mode.

Sign in as an administrator at `/admin/`, open **Settings**, choose
**Create build token**, and enter a name such as `local-astro-site`. Copy the
once-shown value and choose **Done** after placing it in the server-side
environment file. The token list cannot reveal it later.

In the ignored `.env` created by `pnpm dev:env`, set
`LACE_SITE_DATA_MODE=live` and paste that value as `LACE_BUILD_TOKEN`. Restart
the stack to pass the new environment to Astro:

```sh
pnpm dev:stop
pnpm dev:node
```

The site at `http://127.0.0.1:3000/` now reads the published export through
the SDK. Astro dev revalidates the export on every request, so after a
publication reload the browser; repeat the two restart commands only after a
new or renamed slug, because Astro caches its routes. Saving a draft alone does
not change the public site, even after a restart. Automated build dispatch is
not part of this local workflow yet. Keep `.env` private and revoke a lost
token in **Settings**.

### Local product acceptance

The isolated acceptance run uses its own Compose project, random host port,
credentials, SQLite and MinIO volumes. It does not reset `lace-dev`. Docker,
Node/pnpm, installed dependencies, and a Playwright Chromium browser are
required. Start from a clean acceptance project:

```sh
pnpm acceptance:start
pnpm --filter @lacecms/app-admin test:acceptance
pnpm acceptance:stop
```

`acceptance:start` applies committed migrations, explicitly synchronizes the
root `lace.config.ts`, and prints the assigned origin. It creates page drafts
for `home` and `about`; `posts` and `notes` begin as empty collections. The
browser check creates a random first-admin password through the local setup
flow, signs in, uploads and reuses a private image, publishes `home` and a
`notes` entry, issues a read-only token in Settings, switches the site to live
mode, and restarts only Astro. It verifies `/` and `/notes/acceptance-note`,
then saves a new note title and slug without publishing and confirms that the
build export and public route still show the previous publication. It also
creates editor and viewer accounts and checks their browser permissions. Along
the way it runs WCAG 2.x A/AA accessibility audits (axe) on the content home,
a collection list, the entry editor, Media, Users, and Settings with the stack's
real data; any violation fails the run. Focused browser and API checks cover
conflicts, error and empty states, keyboard and narrow-screen navigation, and
server-side authorization.

For a manual walkthrough, run `pnpm acceptance:start`, then
`pnpm acceptance:bootstrap` and complete first-admin setup as described above
using the printed acceptance origin. Open its `/admin/` URL, edit and publish
`home`, create and publish a `notes` entry, and upload an image on **Media** to
reuse in an image block. In **Settings**, create a build token, copy it into
the ignored `.lace-acceptance/.env` as `LACE_BUILD_TOKEN`, and set
`LACE_SITE_DATA_MODE=live`. Run `pnpm acceptance:restart-site`, then check `/`
and `/notes/<published-slug>` at the acceptance origin. Save a changed title
and slug without publishing, restart the site again, and confirm the old public
route and content remain. Content, Media, Users, and Settings have actionable
empty and error states. **Builds** shows build history for the configured site
and lets administrators retry a failed build. Finish with
`pnpm acceptance:stop`, which removes only the named acceptance project and its
volumes. Do not use `pnpm dev:reset` for acceptance cleanup.

### Project content configuration

Edit [`lace.config.ts`](./lace.config.ts) to define pages and collections in
version-controlled code. The file contains `home` (`/`), `about` (`/about`),
`posts` (`/blog/:slug`), and `notes` (`/notes/:slug`) examples with fields and
allowed blocks. The Node API loads and
validates this file when it starts. After editing it, restart the local stack:

```sh
pnpm dev:stop
pnpm dev:node
```

Loading a definition does not add or change a SQLite model or content entry.
With the stack running and migrated, inspect the pending plan, then synchronize:

```sh
pnpm content:sync --check # read-only; exits 1 when work is pending or invalid
pnpm content:sync         # prints the plan, then applies valid changes
```

The first sync creates one editable draft for each page. Collections appear in
Admin with an empty entry list and a permitted create action. Repeating sync on
unchanged configuration is a no-op. Invalid changes print model-specific
diagnostics and leave SQLite content unchanged; fix the configuration and run
the command again. A stale-plan message means another sync changed SQLite
between planning and apply; rerun to review the current plan. Sync never runs
as part of startup or migrations. Route validation also does not create Astro pages: add or update
the matching route in `apps/site/src/pages/` and, for a new block type, its
component in `apps/site/src/components/lace/` and entry in `apps/site/src/lace/blocks.ts`. See
[the Node configuration guide](./docs/node-api.md#editing-content-models) for
key, version, field, block, and route examples, plus a repeatable
sync–Admin–publication–public-site check.

### Normal operations

```sh
pnpm dev:logs               # follow the same lace-dev topology
pnpm dev:stop               # stop containers, preserving local data
pnpm dev:smoke              # isolated stack; does not touch lace-dev data
pnpm dev:reset -- --confirm # permanently remove only Lace dev SQLite/MinIO data
```

`dev:reset` is intentionally the only destructive lifecycle command. Its data
cannot be recovered. To recover from a stale container dependency cache after a
lockfile change, run the explicit reset and start the stack again.

## Verification

Focused package checks are useful while developing a surface:

```sh
pnpm --filter @lacecms/app-api test
pnpm --filter @lacecms/app-admin test
pnpm --filter @lacecms/app-site test
```

Admin browser suites run against the Vite dev server with a mocked API and need
a Playwright Chromium browser:

```sh
pnpm --filter @lacecms/app-admin test:e2e
```

They include the redesign acceptance checks: an axe audit (WCAG 2.x A/AA) of
every admin route and the main dialogs, a keyboard-only editorial walkthrough
with visible-focus checks, and 375px layouts without horizontal scrolling,
including the entry column stacking below the blocks. `pnpm lint` also rejects
raw color literals and arbitrary font-size, radius, shadow, focus-width, and
motion values in admin source, so styles go through the theme tokens.

Before completing a change, run the root quality gates:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm spec:validate
```

`pnpm test` runs at most two Turborepo tasks at once and passes
`--maxWorkers=2` to each package's Vitest runner. This bounds nested parallelism
when Node subprocess, browser DOM and local Worker tests share a CI host.
The Worker suites retain their serial file policy. Tests that invoke several
CLI processes have explicit integration deadlines; ordinary unit tests keep
Vitest's default timeout. The human and JSON sync/bootstrap cases run separately
with fresh databases so neither mode consumes the other's deadline.

Generated-consumer acceptance runs outside this checkout. `pnpm
acceptance:generated` is the onboarding and alpha.2 field-trial feedback
regression suite against a workspace-packed package graph and locally built
images. For a release candidate,
`pnpm release:prepare --output <new-dir>` prepares the exact package and image
set from a clean commit and `pnpm acceptance:release --artifacts <new-dir>` runs
the same journeys against only those artifacts. The current candidate is
`0.1.0-alpha.3` (template `0.17.0`; `0.1.0-alpha.2` is published); see
[docs/alpha-release.md](./docs/alpha-release.md). No command publishes.

## Troubleshooting

- `Missing .env`: run `pnpm dev:env`; it refuses to overwrite existing local
  credentials.
- A service does not become healthy: run `pnpm dev:logs`. Check that Docker has
  enough memory and that port 3000 is available; change `LACE_API_PORT` and the
  matching `LACE_PUBLIC_BASE_URL` in `.env` together if needed.
- Invalid settings are reported only by variable name, never by secret value.
  Correct the named `.env` entry and start again.
- A stale database or object-store state is never cleared automatically. Use
  the explicit reset only when discarding local development data is intended.
- `content:sync` needs the running local API container and migrated SQLite;
  start with `pnpm dev:node` first. If a page is shown without its draft in
  Admin, run sync and reload the page.
- A live site error about `LACE_BUILD_TOKEN` means the token is missing or was
  rejected. Create a replacement through the admin API, update ignored `.env`,
  and restart. If the API is unavailable, check `pnpm dev:logs` and
  `LACE_API_BASE_URL` inside the site container. If `home` is unpublished,
  synchronize configuration and publish it in Admin before restarting.

Detailed Node, authentication, and migration behavior is documented in
[docs/node-api.md](./docs/node-api.md),
[docs/auth-operations.md](./docs/auth-operations.md), and
[docs/database-migrations.md](./docs/database-migrations.md).

### Admin introduction

After sign-in, **Start tour** offers an optional introduction to your available
workflows. **Skip**, Escape, or the close control dismisses it; work can continue
without taking the tour. Replay it any time from the account menu's
**Introduction** action, including through mobile navigation.

Steps follow configured Pages/Collections and your current role. Editors learn
drafts and media uploads, viewers get inspection guidance, and admins also learn
publication, build recovery, Users, Settings, and once-shown read-only build
tokens. Publishing a snapshot and updating the served site are separate; inspect
build status according to your site's rendering/build setup; the generated
project's `docs/lace-operations.md` describes the verified dev, manual static and
automatic Compose publication modes.

Completion and dismissal are local to this browser, installation origin/admin
base path, user ID, and tour version. They survive reload/sign-in when browser
storage works, but do not synchronize across devices. Clearing storage or a new
tour version offers the introduction again. If storage is unavailable, dismissal
lasts for the current page lifetime, including navigation; reload can offer again.
Replacing an installation at the same address with the same user ID reuses its
marker. Only a completion/dismissal marker is stored, never content or credentials.
