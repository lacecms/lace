# Cloudflare

Run the CMS as your own Cloudflare Worker (D1, R2 and the packaged admin): first locally without an account, then in your Cloudflare account through explicit commands.

**Working directory:** the CMS installation root that contains `package.json`, `lace.config.ts` and `worker/` (for example `cms/`). Run every command from there.

**Two deployments.** The CMS Worker and the static site are separate deployments. Deploying the Worker never publishes the site, and deploying the site never deploys, migrates or configures the Worker.

**Two data sets.** Local data lives in `.lace/data/cloudflare` and is used only by the `cf:*` scripts. Remote data lives in your D1 database and R2 bucket. Nothing copies local content, accounts or media to your account.

<!-- lace-site: starter -->

Site mode: **starter**. The static site is the generated `site/`.

<!-- lace-site: end -->
<!-- lace-site: existing -->

Site mode: **existing site** at `{{SITE_PATH}}`. The generator did not modify it.

<!-- lace-site: end -->
<!-- lace-site: none -->

Site mode: **none**. This project has no site, so it has no static-site workflow and the Worker declares no build-site identity; build requests report that no trigger is configured.

<!-- lace-site: end -->

## Prerequisites

- Node `>=24.12.0` and pnpm `>=12` (tested baseline: Node `24.12.0`, pnpm `12.3.4`). The project pins Wrangler in `package.json`; always use it through `pnpm exec wrangler`.
- Lace `0.1.0-alpha.4` or a later compatible release. The private operator file, `--operator-env`, `lace cloudflare preflight` and Pages deployment tracking arrive with `0.1.0-alpha.4`; published `0.1.0-alpha.2` packages do not contain them.
- For the account part only: a Cloudflare account with Workers, D1 and R2.

## Run the Worker locally

Nothing in this section needs an account or touches remote resources. One-time, in this order:

```bash
pnpm install
pnpm env:prepare
pnpm cf:env:prepare
pnpm cf:db:migrate
pnpm cf:content:sync
pnpm cf:auth:bootstrap
pnpm cf:dev
```

- `pnpm env:prepare` creates `.env`, which selects `worker/wrangler.jsonc`, the local state directory and the configuration's D1 ID for the explicit `cloudflare-local` target.
- `pnpm cf:env:prepare` creates the protected, ignored `worker/.dev.vars` with a fresh `LACE_AUTH_SECRET` and the local origin `http://127.0.0.1:8787/`. Never commit it.
- Run migration, sync and bootstrap only while `cf:dev` is stopped; they share the simulated D1 and R2 state with it.
- Bootstrap prints one setup token that expires after one hour.

Open `http://127.0.0.1:8787/admin/`, create the first administrator on the setup screen with the token and sign in. If the token expired, stop `cf:dev`, run `pnpm cf:auth:bootstrap` again and restart.

<!-- lace-site: starter existing -->

## Build the site against the local Worker

1. In Admin publish Home (and any posts), then issue a read-only build token in Settings.
2. In `.env` set `LACE_API_BASE_URL` and `LACE_PUBLIC_BASE_URL` to `http://127.0.0.1:8787/` and put the token into `LACE_BUILD_TOKEN`. Change both origins back to use the Node runtime.
3. Build:

```bash
pnpm build
pnpm exec lace doctor --target cloudflare-local --stage ready
pnpm cf:build
```

The build reads one authenticated published export from the Worker; drafts never reach it. With current compatible packages the loader accepts both strong and weak export `ETag` values, so compressing proxies do not break conditional reads. Doctor `ready` passes once the Worker runs and a build token is set. `pnpm cf:build` bundles the Worker without credentials to check `lace.config.ts` and the configuration before any deployment.

<!-- lace-site: end -->
<!-- lace-site: none -->

## Check the local Worker

```bash
pnpm exec lace doctor --target cloudflare-local --stage setup
pnpm cf:build
```

Doctor never starts the Worker or creates local state. `pnpm cf:build` bundles the Worker without credentials.

<!-- lace-site: end -->

## Repeat local operation

Restart with `pnpm cf:dev`; content, accounts and media survive restarts. After editing `lace.config.ts`, stop `cf:dev`, run `pnpm cf:content:sync` and start it again. To reset local data, stop `cf:dev` and delete `.lace/data/cloudflare` deliberately. Changing the D1 ID in `worker/wrangler.jsonc` and `.env` selects a different, empty local database. Diagnosis and the local recovery steps: [local journey and diagnosis](lace-operations.md#local-journey-and-diagnosis).

## Move to your Cloudflare account

Every command from here on, except preflight and `whoami`, is an explicit mutation of your account. Generation, installation, upgrades and the `cf:*` scripts never perform them. Remote targets always need `--target cloudflare-remote` and an explicitly selected account and database.

### 1. Choose management credentials

Pick one workflow; the permission and credential-purpose tables are in [choose Cloudflare management credentials](lace-operations.md#choose-cloudflare-management-credentials):

- **Split credentials:** a D1-scoped API token for Lace remote migrate/sync/bootstrap, and Wrangler OAuth (`pnpm exec wrangler login`) for deploy and secrets.
- **Single token:** one sufficiently scoped token, loaded explicitly only into the intended processes.

Remote credentials belong in the protected `.lace/cloudflare-operator.env`, never in `.env` or `.env.local`, which Wrangler loads implicitly. Create it once from the managed example without overwriting an existing copy:

```bash
node --input-type=module -e 'import { copyFile, chmod, constants } from "node:fs/promises"; process.umask(0o077); await copyFile("docs/cloudflare-operator.env.example", ".lace/cloudflare-operator.env", constants.COPYFILE_EXCL); await chmod(".lace/cloudflare-operator.env", 0o600);'
```

Edit it privately: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `LACE_D1_DATABASE_ID` and `LACE_WRANGLER_CONFIG=worker/wrangler.jsonc`. Process values override it, including empty values.

### 2. Check credentials before remote work

For split credentials, remove token assignments from both `.env` and `.env.local` and clear the inherited token, then:

```bash
unset CLOUDFLARE_API_TOKEN
pnpm exec wrangler login
pnpm exec lace cloudflare preflight --target cloudflare-remote --wrangler-auth oauth --operator-env .lace/cloudflare-operator.env
pnpm exec wrangler whoami --account <account-id> --config worker/wrangler.jsonc
```

Preflight is read-only: it reports credential sources and the validated account ID and runs only `SELECT 1` against the selected D1 database. It does not prove OAuth login, account membership or Workers/Pages write permissions; `whoami` and the operation permission review do that before deploy or secret commands. A stale token in `.env` or `.env.local` makes OAuth preflight fail until you remove it. For the single-token workflow, use the explicit `node --env-file=.lace/cloudflare-operator.env ...` invocations in the [operations guide](lace-operations.md#choose-cloudflare-management-credentials) for preflight, `whoami`, provisioning, secrets and deploy.

### 3. Provision, configure, migrate and deploy

Shown for split credentials:

1. Provision: `pnpm exec wrangler d1 create <name>-cms --config worker/wrangler.jsonc` and `pnpm exec wrangler r2 bucket create <name>-media --config worker/wrangler.jsonc`.
2. Configure: put the D1 ID into `worker/wrangler.jsonc` and into `LACE_D1_DATABASE_ID` of the private operator file (and `.env` for local work), and set the Worker's public HTTPS `LACE_PUBLIC_BASE_URL` with a trailing slash in its `vars`. Repeat preflight.
3. Secrets: `pnpm exec wrangler secret put LACE_AUTH_SECRET --config worker/wrangler.jsonc` with at least 32 random bytes; this is the CMS authentication secret, not a Cloudflare credential.
4. Migrate and sync: `pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`, then `pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`.
5. Deploy: `pnpm exec wrangler deploy --config worker/wrangler.jsonc`.
6. Bootstrap: `pnpm exec lace auth bootstrap --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`, then create the first administrator at `<LACE_PUBLIC_BASE_URL>admin/` on the remote Worker.

Expected result: the remote admin at your Worker origin with its own administrator and empty remote content. Full details and options: [deploy the Worker to your account](lace-operations.md#deploy-the-worker-to-your-account).

<!-- lace-site: starter existing -->

## Configure email (optional)

Local `pnpm cf:dev` prints email to its output (`LACE_EMAIL_PROVIDER=log` in `worker/.dev.vars`). For your account, prefer `resend`: set the `LACE_EMAIL_PROVIDER` and `LACE_EMAIL_FROM` vars in `worker/wrangler.jsonc` and store the key with `pnpm exec wrangler secret put LACE_RESEND_API_KEY --config worker/wrangler.jsonc`. The `cloudflare` provider needs Workers Paid, an onboarded sending domain and the commented `send_email` binding. Redeploy, then send a test from Settings → Email delivery. See [Email delivery](lace-operations.md#email-delivery).

## Deploy the static site separately

The site is built from the published export of the remote Worker with a read-only build token issued in the remote Admin. Choose one:

- **Manual workflow:** the generated `.github/workflows/cloudflare.yml` builds `{{SITE_PATH}}` and uploads `{{SITE_PATH}}/dist` to Pages when you run it. It has no deploy hook, so you rerun it after publishing.
- **Git-connected Pages project:** Pages builds the site itself, and its deploy hook, stored only as the Worker secret `LACE_DEPLOY_HOOK_URL`, rebuilds after each publication.

Without tracking, a hook the provider accepts is recorded as **Accepted**, which never proves the site changed: confirm the deployment in Pages. With Pages deployment tracking (`LACE_PAGES_ACCOUNT_ID`, `LACE_PAGES_PROJECT_NAME` and the separate Pages-Read-only Worker secret `LACE_PAGES_API_TOKEN`), Builds follows that exact deployment to **Succeeded**, **Failed**, **Cancelled** or **Unknown** within the tracking deadline. Setup: [deploy the static site separately](lace-operations.md#deploy-the-static-site-separately) and the tracking entry in [recovery](lace-operations.md#recovery).

<!-- lace-site: end -->

## Repeat account operations

After editing `lace.config.ts`: run preflight, `pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`, then `pnpm exec wrangler deploy --config worker/wrangler.jsonc`, because the Worker bundles the configuration. After upgrading Lace packages: preflight, remote migrate, deploy. Local `cf:*` scripts never change remote data.

## Recovery

- **Preflight fails.** Follow its next action: a missing or invalid private file, conflicting account settings, a stale dotenv token or insufficient D1 permission. Selected-file failures never fall back to other sources.
- **Deploy hook unavailable or rejected.** Publication stays committed; the build stays pending with a sanitized reason and is retried, then fails. Fix the hook and use Retry in Admin.
- **Alpha.2 project with a token in `.env`.** Move it to the private file manually, remove it from both `.env` and `.env.local`, clear the shell token and repeat preflight. Upgrades never move credentials.
- More cases: [Cloudflare recovery](lace-operations.md#recovery).

Real-account deployment is verified by the release gate; local and stub tests do not prove it.

## Next steps

- Extend models, routes and blocks: [configuration, routes, renderers and styling](lace-operations.md#configuration-routes-renderers-and-styling).
- Run the CMS with Docker Compose instead: [Docker Compose development](lace-compose-dev.md).

## Backup, rotation and observation

Follow [Operator observation and recovery](lace-operations.md#operator-observation-and-recovery) for the CMS release card, health/log meanings, coordinated database/object backup, isolated restore, credential rotation and migration/upgrade recovery. Verify the whole restored site before trusting a backup. Remote account operations remain owner-operated.
