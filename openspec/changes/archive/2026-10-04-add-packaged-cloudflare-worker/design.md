## Context

See proposal.md — Why. Observed state:

- `@lacecms/platform-cloudflare` already exports `createCloudflareWorker({ config })`
  with D1/R2/optional KV/ASSETS parsing (`settings.ts`), the scheduled outbox
  recovery handler, admin asset serving (`admin-assets.ts`) and fail-closed
  environment validation that logs variable names only.
- The only Worker entry and Wrangler configuration live in `apps/api`
  (`worker/index.ts`, `wrangler.jsonc` with `migrations_dir: ../../packages/db/drizzle`
  and `assets.directory: ../admin/dist`). `scripts/cloudflare.mjs` drives the
  source-workspace `dev:cloudflare`.
- The admin is the private app `@lacecms/app-admin` (Vite, `base: "/admin/"`,
  ~2.3 MB `dist`). Node consumers get it inside the API image; no npm artifact
  carries it.
- `@lacecms/cli` already implements `db migrate`, `content sync`, `auth bootstrap`
  for `cloudflare-local` (Miniflare against `LACE_CLOUDFLARE_PERSIST_TO`, keyed by
  `LACE_D1_DATABASE_ID`, verified against `LACE_WRANGLER_CONFIG`) and
  `cloudflare-remote` (D1 REST). Migration shells out to
  `<dirname(config)>/node_modules/.bin/wrangler`.
- `create-lace` templates: managed root `wrangler.jsonc` (Pages-only), managed
  Pages workflow; `--no-site --cloudflare` is rejected; template `0.11.0`.
- Upgrade planner: new managed paths are added, unchanged removed managed paths
  are removed, new user-owned paths are never created, and a managed→user
  ownership transition is a permanent conflict.

## Goals / Non-Goals

**Goals:** a consumer-owned Worker built only from installed packages; one
place for local Cloudflare state; explicit local/remote operator targets reused
from the existing CLI; deterministic templates and upgrade paths.

**Non-Goals:** changing Worker runtime/API behavior, a `lace cloudflare`
command family, doctor changes (31B), a Cloudflare Vite plugin workflow, real
account verification (Step 33), Workers Builds/CI for the Worker.

## Decisions

### D1. Admin assets ship inside `@lacecms/platform-cloudflare/admin/`
`platform-cloudflare` gains a build step (`scripts/copy-admin-assets.mjs`) that
replaces `admin/` with a copy of `apps/admin/dist` after `tsc`; `files` adds
`admin`. `turbo.json` declares `@lacecms/platform-cloudflare#build` dependent on
`^build` and `@lacecms/app-admin#build` with outputs `dist/**` and `admin/**`, so
turbo-driven builds (root `pnpm build`, release preparation, `dev:cloudflare`)
always copy the current admin. The copy is tolerant — when `apps/admin/dist` is
absent it removes `admin/` and warns — so pnpm-filtered contexts that never pack
(Compose dev, the builder image) keep working; release verification and the
Cloudflare acceptance phase fail when the packaged `admin/index.html` is
missing. `apps/api/Dockerfile` builds the admin before the API graph so its
pnpm-filtered build sees the assets. `admin/` is git-ignored.

Alternatives: a new public `@lacecms/admin` package (adds a release package and
version coupling for one consumer; rejected for now, revisit if Node consumers
need assets outside the image); publishing `apps/admin` (contradicts "applications
remain private" and would ship source); fetching assets at deploy time
(network, integrity and version-skew risks).

### D2. Worker lives in `worker/`; Pages config is removed
Files (all `cloudflare: true`, every site mode):

| Path | Owner | Content |
|---|---|---|
| `worker/index.ts` | managed | `import config from "../lace.config.ts"; export default createCloudflareWorker({ config });` |
| `worker/wrangler.jsonc` | user | name, `main: "index.ts"`, compatibility date, `nodejs_compat`, `DB` (placeholder ID, `migrations_dir: ../node_modules/@lacecms/db/drizzle`), `MEDIA`, `ASSETS` (`../node_modules/@lacecms/platform-cloudflare/admin`, `html_handling/not_found_handling: none`, `run_worker_first: true`), cron `* * * * *`, `vars` (`LACE_PUBLIC_BASE_URL` placeholder origin, build-site identity in site modes), commented KV and secret guidance |
| `worker/.dev.vars.example` | managed | `LACE_ENVIRONMENT=development`, `LACE_PUBLIC_BASE_URL=http://127.0.0.1:8787/`, `LACE_AUTH_SECRET=`, commented optional deploy hook |
| `.github/workflows/cloudflare.yml` | managed | Pages only (starter/existing), deploys `<site>/dist` with explicit `--project-name` |

The root `wrangler.jsonc` is deleted from the inventory. Wrangler resolves
`main`, `migrations_dir` and `assets.directory` relative to the config file and
loads `.dev.vars` from the config directory, so `worker/` keeps the Worker
self-contained while `pnpm exec wrangler … --config worker/wrangler.jsonc` runs
from the root.

Why user-owned config: it holds per-deployment resource IDs, the public origin,
routes and optional KV; a managed file would conflict on every upgrade.
Why a new path: reusing root `wrangler.jsonc` would be a managed→user
transition, which the planner reports as a permanent conflict; a new path lets
upgrade remove the unchanged Pages file and add the managed entry cleanly.
Why the entry is managed: it is engine glue whose options may change; edits are
still protected by conflict review.

Alternatives: root `wrangler.jsonc` (rejected above); a generated
`wrangler.json` produced by a script (hidden build step, harder to edit IDs);
keeping a Pages config beside the Worker config (Wrangler treats a config with
`pages_build_output_dir` as a Pages project, and the workflow already passes the
directory and project explicitly).

### D3. Cloudflare-aware rendering
`renderForSite` gains a `cloudflare: boolean` input:
- `root-package`: the template `package.json` carries the Worker dependencies
  (`@lacecms/platform-cloudflare`, `@lacecms/db` at the release version, so the
  release model validates them) and the `cf:*` scripts; the renderer deletes
  them when Cloudflare is not selected, then applies the existing site-mode edits.
- `markers`: a second marker family, `lace-cloudflare: on|off` … `lace-cloudflare: end`,
  processed before site markers with the same comment syntaxes, nesting and
  seam rules; malformed markers fail. `.env.example`, README and the operations
  guide use it.

Scripts (local only; CLI through `node node_modules/@lacecms/cli/dist/bin.js`
like existing scripts):
- `cf:env:prepare` → `env prepare --target cloudflare-local`
- `cf:db:migrate`, `cf:content:sync`, `cf:auth:bootstrap` → `node --env-file=.env … --target cloudflare-local`
- `cf:dev` → `wrangler dev --config worker/wrangler.jsonc --local --persist-to .lace/data/cloudflare --ip 127.0.0.1 --port 8787 --test-scheduled --show-interactive-dev-session=false`
- `cf:build` → `wrangler deploy --dry-run --config worker/wrangler.jsonc --outdir .lace/data/cloudflare-bundle`

`.env.example` (Cloudflare on): `LACE_WRANGLER_CONFIG=worker/wrangler.jsonc`,
`LACE_CLOUDFLARE_PERSIST_TO=./.lace/data/cloudflare`,
`LACE_D1_DATABASE_ID=00000000-0000-0000-0000-000000000000`, empty
`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`. `.lace/data/` is already
ignored; `.gitignore` adds `.wrangler/` and `worker/.dev.vars`.

Remote work stays documented commands (`wrangler d1 create`, `r2 bucket create`,
`secret put`, `lace db migrate --target cloudflare-remote`, `wrangler deploy`).
The remote CLI keeps its explicit account/token/ID requirements.

### D4. CLI changes are narrow
- `env prepare` accepts only `--target cloudflare-local`; `prepareEnvironment`
  is parameterized by template path, destination and controlled credential set
  (`LACE_AUTH_SECRET` only for the Worker), reusing the staged hard-link
  publication, 0600 mode and diagnostics. Success text names the created file.
- Migration resolves Wrangler by walking from `dirname(config)` up to the
  filesystem root for `node_modules/.bin/wrangler`; source workspace still finds
  `apps/api/node_modules/.bin/wrangler` first. Not found → CONFIG.
- No change to target environment variables or remote confirmation semantics.

### D5. Generator accepts `--no-site --cloudflare`
The Worker no longer depends on a site. In no-site mode the Pages workflow is
omitted (`modes: SITE`) and the Worker `vars` omit build-site identity via site
markers in the JSONC. Architecture §Site modes is updated.

### D6. Acceptance
New `scripts/cloudflare-consumer-acceptance.mjs` exports a journey used by a new
`cloudflare` phase (`pnpm acceptance:cloudflare`) and by the `all` phase in place
of the source-workspace `worker-smoke` run. It packs the graph (adding
`@lacecms/platform-cloudflare` and `@lacecms/db` through the template
dependencies), generates `--cloudflare`, installs packed tarballs, runs
`cf:build` and scans the bundle for the workspace path and the `posts` model,
runs `cf:env:prepare`, `env:prepare`, `cf:db:migrate`, `cf:content:sync`,
`cf:auth:bootstrap`, starts `cf:dev` on a free port (passing `--port`), checks
readiness, `/admin/` HTML, one referenced asset, setup/login/models/media upload,
restarts and re-checks. Processes run in their own process group and are killed
in `finally`. Snapshot variants add `none-cloudflare`.

## Risks / Trade-offs

- [`.dev.vars` must override `vars` locally] → verified in acceptance: the local
  Worker accepts login at `http://127.0.0.1:<port>/` while the config's
  `LACE_PUBLIC_BASE_URL` is the production placeholder. Acceptance overrides the
  port and origin through `.dev.vars` written for its port.
- [Local D1 state is keyed by the database ID] → changing the ID starts an empty
  local database; documented beside the ID-mismatch error.
- [platform-cloudflare package grows by ~2.3 MB] → acceptable for a deploy-time
  dependency; Node consumers already install it through the CLI.
- [Library build depending on an app build] → confined to turbo task wiring; no
  import dependency; boundary checks unchanged.
- [pnpm layout: `node_modules/@lacecms/{platform-cloudflare,db}` must exist at the
  root] → both become direct dependencies of Cloudflare projects.
- [Upgraded 0.11 Cloudflare projects lack `worker/wrangler.jsonc`] → upgrade
  instructions direct copying it from a fresh project; Pages workflow keeps
  working meanwhile.

## Migration Plan

Template `0.12.0`. Cloudflare projects: upgrade from a `--cloudflare` target of
the same site mode; unchanged root `wrangler.jsonc` is removed; copy
`worker/wrangler.jsonc` from a fresh project; run `pnpm install`,
`pnpm cf:env:prepare`. Non-Cloudflare projects only receive guidance/script
wording changes. Rollback uses the existing `lace upgrade --rollback`.
