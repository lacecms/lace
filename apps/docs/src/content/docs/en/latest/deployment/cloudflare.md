---
title: Deploy on Cloudflare
description: Run the CMS as a Worker with D1 and R2, and deploy the static site separately on Pages.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

On Cloudflare, the CMS API and Admin run as a Worker with D1 for content and accounts and a private R2 bucket for media. Your Astro site is a separate static deployment, usually on Cloudflare Pages, that reads published content from the Worker at build time. This guide runs the Worker locally, prepares your account, deploys the Worker and connects the site's deployment.

## Before you start

- A project generated with `--cloudflare`. It owns `worker/index.ts`, `worker/wrangler.jsonc` and a matching packaged Admin.
- Node **>=24.12.0** and pnpm **>=12**. Use the project-pinned Wrangler through `pnpm exec wrangler`.
- For the account steps only: a Cloudflare account with Workers, D1 and R2.
- The generated `docs/lace-cloudflare.md` and `docs/lace-operations.md`, which contain the complete credential, provisioning and single-token sequences for your project.

## Run the Worker locally

From the generated CMS root:

```sh
pnpm install
pnpm env:prepare
pnpm cf:env:prepare
pnpm cf:db:migrate
pnpm cf:content:sync
pnpm cf:auth:bootstrap
pnpm cf:dev
```

`pnpm cf:env:prepare` runs `lace env prepare --target cloudflare-local`: it creates the protected, ignored `worker/.dev.vars` with a fresh `LACE_AUTH_SECRET` and the local origin `http://127.0.0.1:8787/`. Run migration, sync and bootstrap while `cf:dev` is stopped. These commands use simulated local D1 and R2 under `.lace/data/cloudflare` and never touch your account.

Open `http://127.0.0.1:8787/admin/` and create the first administrator. Publish Home, create a read-only build token in Settings and set the API and public origins (`http://127.0.0.1:8787/`) and the token in the ignored `.env`. `pnpm build` builds the site; `pnpm cf:build` bundles the Worker without deploying it. Local email is printed to the `cf:dev` output.

## Prepare account operations

Remote content, accounts and media are a separate data set: nothing uploads your local database. Every remote step is an explicit change to your account; generation, upgrades and the `cf:*` scripts never perform them.

Choose credentials deliberately:

- **Split credentials:** a D1-scoped API token for Lace migrate, sync and bootstrap, and Wrangler OAuth (`pnpm exec wrangler login`) for deploys and secrets.
- **Single token:** one token with every intended permission, loaded explicitly only into the processes that need it.

Keep remote management credentials in the protected `.lace/cloudflare-operator.env`, created from the generated `docs/cloudflare-operator.env.example`. Do not put them in `.env` or `.env.local`, which Wrangler loads implicitly. The private file holds `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `LACE_D1_DATABASE_ID` and `LACE_WRANGLER_CONFIG=worker/wrangler.jsonc`. Process values override it, including empty values.

## Deploy the Worker

With split credentials, clear stale inherited and dotenv API tokens, authenticate Wrangler, then provision and configure:

1. Create the resources: `pnpm exec wrangler d1 create <name>-cms --config worker/wrangler.jsonc` and `pnpm exec wrangler r2 bucket create <name>-media --config worker/wrangler.jsonc`.
2. Record the D1 ID in `worker/wrangler.jsonc` and the private operator file, and set the Worker var `LACE_PUBLIC_BASE_URL` to its public HTTPS origin with a trailing slash.
3. Set the authentication secret with at least 32 random bytes: `pnpm exec wrangler secret put LACE_AUTH_SECRET --config worker/wrangler.jsonc`.

Then check, migrate, deploy and bootstrap:

```sh
pnpm exec lace cloudflare preflight --target cloudflare-remote --wrangler-auth oauth --operator-env .lace/cloudflare-operator.env
pnpm exec wrangler whoami --account <account-id> --config worker/wrangler.jsonc
pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
pnpm exec wrangler deploy --config worker/wrangler.jsonc
pnpm exec lace auth bootstrap --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
```

Preflight is read-only: it validates the selected credentials and runs one `SELECT 1` against the selected D1 database. It does not prove deployment permissions or OAuth membership; `whoami` and your permission review do. Finally create the first administrator at `<LACE_PUBLIC_BASE_URL>admin/` on the remote Worker.

For transactional email, prefer the `resend` provider (it works on Workers Free): set `LACE_EMAIL_PROVIDER` and `LACE_EMAIL_FROM` in the Worker vars and store the key with `wrangler secret put LACE_RESEND_API_KEY`. The `cloudflare` provider needs Workers Paid, an onboarded sending domain and the `send_email` binding. Redeploy, then send a test from **Settings → Email delivery**.

## Deploy the site separately

The Worker and the static site have separate deployments; deploying one never deploys the other. Give the remote site build the Worker origin as `LACE_API_BASE_URL` and `LACE_PUBLIC_BASE_URL`, and a read-only build token created in the remote Admin. Choose one:

- **Manual workflow:** the generated `.github/workflows/cloudflare.yml` builds the site and uploads it to the Pages project named by the `CLOUDFLARE_PAGES_PROJECT` repository variable. Configure the origins and optional site settings as repository variables, and `LACE_BUILD_TOKEN`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets. Run it again after each publication; a direct upload has no deploy hook.
- **Git-connected Pages project:** Pages builds the site itself. Set the project's root directory to the CMS project, the build command to `pnpm build` and the output directory to the site's `dist` (for the starter, `site/dist`), with build variables for the two origins and an encrypted `LACE_BUILD_TOKEN`. Make sure the build environment uses the project's Node and pnpm versions. Create a deploy hook for the production branch and store its URL only as the Worker secret `LACE_DEPLOY_HOOK_URL`; the Worker then triggers a rebuild after each publication. Pages offers deploy hooks only for Git-connected projects. Another provider works if its hook accepts a bodiless `POST` without credentials.

Either way, set `LACE_BUILD_SITE_URL` to the served site URL (also in the Worker vars, for "Open on site") and `LACE_SITE_INDEXING=off` for staging or preview builds.

A hook result of **Accepted** means only that the provider accepted the request, not that readers see new content. Optional Pages deployment tracking uses `LACE_PAGES_ACCOUNT_ID`, `LACE_PAGES_PROJECT_NAME` and a separate Pages-read-only `LACE_PAGES_API_TOKEN` secret; set all three or none. Builds then follows the exact deployment to **Succeeded**, **Failed**, **Cancelled** or **Unknown** at its deadline (`LACE_PAGES_TRACKING_TIMEOUT_MINUTES`, default 60).

A scheduled Worker invocation runs every minute and recovers build and media work left unfinished; you do not need to configure it beyond the generated cron trigger.

## Apply configuration changes and upgrades

After editing `lace.config.ts`, run preflight, sync the remote target explicitly and redeploy the Worker, which bundles the configuration. After upgrading Lace packages, run preflight, migrate the remote database explicitly and then deploy. Local `cf:*` commands never change remote data. Follow [upgrade and roll back](../../operations/#upgrade-and-roll-back) for backups and the complete sequence. Back up D1 and R2 together and test restoration; local tests cannot establish account backups or production deployment correctness.

## Image assets and build caches

The site's user-owned `public/_headers` gives successful content-hashed `/_astro/` files thirty-day immutable caching and keeps HTML revalidating; without it, Pages sends `max-age=0` for every file. Adopt the file from a matching starter when upgrading an existing site, and inspect the actual hosted responses after deployment.

The generated Pages workflow restores and saves the site's `node_modules/.astro` directory with `actions/cache`, reusing image variants and placeholders. That cache is disposable and does not back up D1, R2 or content. Other build providers need their own equivalent configuration.

## Optional assistant connections

After applying D1 migrations, set the string var `LACE_MCP_ENABLED` to `true` and redeploy; local Worker development uses `worker/.dev.vars`. No extra binding is needed. Use the canonical HTTPS public origin in production. Follow [Connect an AI assistant](../../operations/mcp/) for client setup, permissions, revocation and the checks to repeat on your deployed Worker.

## Reference

- [CLI and environment](../../reference/cli-environment/): Worker vars, secrets and bindings, the operator file settings and the `lace cloudflare preflight` options.
- [API documentation](../../reference/api/): the build export read by the site.
