---
title: Deploy on Cloudflare
description: Keep Worker state and the static site as separate deployments.
---

Generate with `--cloudflare`. The project owns `worker/index.ts`, `worker/wrangler.jsonc` and a matching packaged admin. Use the project-pinned Wrangler through `pnpm exec wrangler`.

## Start locally

Run from the generated CMS root:

```sh
pnpm install
pnpm env:prepare
pnpm cf:env:prepare
pnpm cf:db:migrate
pnpm cf:content:sync
pnpm cf:auth:bootstrap
pnpm cf:dev
```

Run migration/sync/bootstrap with local dev stopped. These commands use simulated local D1/R2 under `.lace/data/cloudflare`, never your account. Open `http://127.0.0.1:8787/admin/` for setup. Publish Home and create a build token; set the API/public origins and token in the ignored site environment. `pnpm build` builds the site; `pnpm cf:build` bundles the Worker without deploying.

## Prepare account operations

Remote content/accounts/media are a separate data set. Nothing uploads your local database automatically. Provision D1/R2, record the actual resource IDs in Wrangler config, set the public HTTPS URL and configure Worker secrets. Choose credentials deliberately: a D1 management token for Lace operations with Wrangler OAuth for deployment, or an explicitly loaded token with all intended permissions.

Keep remote management credentials in protected `.lace/cloudflare-operator.env`, created from the generated example; do not put them in `.env`/`.env.local`, which Wrangler can load implicitly. The private file includes the account ID, token, D1 ID and Wrangler config selection. Process values override it, including empty values.

For the split-credential path, clear stale inherited/dotenv API tokens, authenticate Wrangler, then run:

```sh
pnpm exec lace cloudflare preflight --target cloudflare-remote --wrangler-auth oauth --operator-env .lace/cloudflare-operator.env
pnpm exec wrangler whoami --account <account-id> --config worker/wrangler.jsonc
pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
pnpm exec wrangler deploy --config worker/wrangler.jsonc
pnpm exec lace auth bootstrap --target cloudflare-remote --operator-env .lace/cloudflare-operator.env
```

Run only after provisioning/binding the selected D1/R2 resources and setting `LACE_AUTH_SECRET` with at least 32 random bytes via Wrangler secrets. Preflight is read-only; it does not prove deployment privileges or OAuth membership. Use the generated `docs/lace-cloudflare.md` and operations guide for the full credential/provisioning sequence and single-token commands.

## Deploy the site separately

The Worker and static Astro site have separate deployments. Give the remote site build its remote API origin and a read-only build token created in the remote Admin. Either manually run the generated Pages upload workflow after publication, or connect the site to Git-backed Pages and configure its deploy hook as Worker secret `LACE_DEPLOY_HOOK_URL`.

Set `LACE_BUILD_SITE_URL` to the served site and `LACE_SITE_INDEXING=off` for staging. A hook result of Accepted means the provider accepted the request, not that readers see new content. Optional exact-deployment tracking uses `LACE_PAGES_ACCOUNT_ID`, `LACE_PAGES_PROJECT_NAME` and the separate Pages-read-only `LACE_PAGES_API_TOKEN`; it records a confirmed result or Unknown at its deadline.

After changing config, sync the explicitly selected remote target and redeploy the Worker, which bundles `lace.config.ts`. After an upgrade, migrate explicitly before the corresponding deployment. Back up D1 and R2 together and test restoration; local tests cannot establish account backup or production deployment correctness.

## Image assets and build caches

The site's user-owned `public/_headers` gives successful content-hashed `/_astro/` assets thirty-day immutable caching and keeps HTML revalidating. Adopt the file from a matching starter when upgrading an existing site; inspect actual hosted responses after deployment. The generated Pages workflow restores and saves the site's `node_modules/.astro` directory with `actions/cache`, reusing image variants and placeholders. That cache is disposable and does not back up D1, R2 or content. Other build providers need their own equivalent configuration. Local workflow/header checks do not prove a Pages deployment.
