# Cloudflare real-account deployment handoff

This is the procedure and checklist for the Step 34 release gate. It deploys a
project generated with `create-lace --cloudflare` to a real Cloudflare account:
the CMS Worker (D1, R2, packaged admin, scheduled recovery) and the separate
static Astro site rebuilt through a deploy hook.

**Local acceptance does not count.** `pnpm acceptance:cloudflare` runs the
generated Worker under `wrangler dev --local` with Miniflare-simulated D1 and R2
and a local HTTPS stand-in for the deploy hook. It proves the packaged consumer
journey, not deployment. Real-account deployment stays unverified until the
evidence in [Evidence and pass criteria](#evidence-and-pass-criteria) exists.
Missing account access blocks the gate. It does not pass it.

This document contains no credentials, account IDs or resource IDs. Record the
real values privately, never in the repository.

## Inputs

- The exact candidate artifacts from Step 33: `create-lace`, `@lacecms/*`
  packages (including `@lacecms/platform-cloudflare` with `admin/`) at one
  version and template version. Record both versions.
- Node `>=24.12.0` and pnpm `>=12` (minimums declared by the generated project; tested with Node 24.12.0 and pnpm 12.3.4).
- A Git repository (GitHub or GitLab) the release owner controls, for the
  static site's Pages project.
- A dedicated Cloudflare account, or one where creating and deleting the
  resources below is allowed.

## Account prerequisites and permissions

Products: Workers (a `workers.dev` subdomain or a zone for a custom domain),
D1, R2 (enabled on the account) and Pages. KV is optional.

Create an account API token for the operator CLI and Wrangler with at least:

| Permission | Used for |
| --- | --- |
| Account · Workers Scripts · Edit | `wrangler deploy`, `wrangler secret put` |
| Account · D1 · Edit | `wrangler d1 create`, remote migration, `lace … --target cloudflare-remote` |
| Account · Workers R2 Storage · Edit | `wrangler r2 bucket create` |
| Account · Cloudflare Pages · Edit | creating the Pages project and its deploy hook from the CLI (optional when done in the dashboard) |
| Account · Workers KV Storage · Edit | only when adding the optional `CACHE` binding |
| Account · Account Settings · Read | Wrangler account resolution |
| Zone · Workers Routes · Edit (and DNS · Edit) | only for a custom domain instead of `workers.dev` |

For Pages deployment tracking create a second, separate token with only
*Account · Cloudflare Pages · Read*. It is stored only as the Worker secret
`LACE_PAGES_API_TOKEN` and is never the operator token above.

`wrangler login` (OAuth) is acceptable for the release owner's shell. The token
is still needed for the `cloudflare-remote` CLI target, which reads
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from the project's private
`.env`. The Pages Git integration needs the Cloudflare app installed on the Git
repository. Record which permissions were actually required. If any table row
was insufficient or unnecessary, correct this document.

## Values to record

| Value | Where it goes |
| --- | --- |
| Account ID | `.env` `CLOUDFLARE_ACCOUNT_ID` (private) |
| D1 database name and ID | `worker/wrangler.jsonc` `database_id`, `.env` `LACE_D1_DATABASE_ID` |
| R2 bucket name | `worker/wrangler.jsonc` `bucket_name` |
| KV namespace ID (optional) | `worker/wrangler.jsonc` `kv_namespaces` |
| Worker name and public origin (`https://<name>.<subdomain>.workers.dev/` or custom domain) | `worker/wrangler.jsonc` `name` and `vars.LACE_PUBLIC_BASE_URL` (trailing slash) |
| Pages project name and production URL | Pages settings, evidence |
| Deploy hook name | evidence. The URL itself is secret. |
| Provider deployment IDs | evidence |

Secrets are never recorded in evidence: `LACE_AUTH_SECRET`, the deploy-hook
URL, `CLOUDFLARE_API_TOKEN`, the setup token, the administrator password and the
read-only build token.

## Procedure

Every step below except generation is an explicit account mutation run by the
release owner. Generated `cf:*` scripts stay local. Run from the generated
project root unless noted.

1. **Generate and install.** `create-lace <dir> --cloudflare` (starter mode),
   `pnpm install`, `pnpm env:prepare`, `pnpm cf:env:prepare`, then
   `pnpm cf:build` to confirm the account-free bundle. Commit the project to the
   Git repository, which must not contain `.env`, `.env.local`,
   `.lace/cloudflare-operator.env` or `worker/.dev.vars`. All commands run from
   the generated CMS root. Follow `docs/lace-operations.md` to choose either
   a private D1 operator token with separate Wrangler OAuth, or a single token
   with the necessary D1/Workers/Pages permissions. Copy the credential-free
   `docs/cloudflare-operator.env.example` to the private path with mode `0600`,
   then edit it privately. For existing alpha.2 projects, install the current
   CLI and upgrade the template; move the token out of both root dotenv files,
   remove both assignments and `unset CLOUDFLARE_API_TOKEN` before OAuth.
2. **Provision.** `pnpm exec wrangler d1 create <name>-cms`,
   `pnpm exec wrangler r2 bucket create <name>-media`, optionally
   `pnpm exec wrangler kv namespace create CACHE`.
3. **Configure.** Put the D1 ID into `worker/wrangler.jsonc` and `.env`
   (`LACE_D1_DATABASE_ID`), add the optional KV binding, set
   `vars.LACE_PUBLIC_BASE_URL` to the Worker's HTTPS origin, and set
   the account, token, database and config path in `.lace/cloudflare-operator.env`.
   Align any root dotenv account setting. For the split workflow run
   `pnpm exec wrangler login`, then
   `pnpm exec lace cloudflare preflight --target cloudflare-remote --wrangler-auth oauth --operator-env .lace/cloudflare-operator.env --json`,
   and `pnpm exec wrangler whoami --account <account-id> --config worker/wrangler.jsonc`.
   Preflight only probes D1 with SELECT 1; OAuth membership and deploy/secret
   permissions require separate review. For the single-token workflow use
   `node --env-file=.lace/cloudflare-operator.env` for both the CLI preflight
   (`--wrangler-auth token`) and `node_modules/wrangler/bin/wrangler.js`.
4. **Secrets.** `openssl rand -hex 32 | pnpm exec wrangler secret put LACE_AUTH_SECRET --config worker/wrangler.jsonc`.
   The deploy hook is added in step 9.
5. **Migrate.** `pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`.
   A placeholder ID must be refused. Test this once before setting the ID.
6. **Sync.** `pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`.
7. **Deploy the Worker.** `pnpm exec wrangler deploy --config worker/wrangler.jsonc`.
   Confirm `GET <origin>health/ready` returns `{"status":"ready"}`.
8. **Bootstrap and set up.** `pnpm exec lace auth bootstrap --target cloudflare-remote --operator-env .lace/cloudflare-operator.env` prints
   one expiring token. Open `<origin>admin/`, create the administrator in the
   browser setup screen, sign in, upload an image, edit and publish the home
   page and one post, and issue a read-only build token in Admin Settings.
9. **Static site through Pages Git integration.** Deploy hooks exist only for
   Pages projects connected to Git. The generated manual workflow uses direct
   upload and is not started by a hook. Create a Pages project from the
   repository:
   - root directory: the generated project (the CMS directory);
   - build command: `pnpm build`; build output directory: `site/dist`;
   - build variables: `NODE_VERSION=24.12.0`, `PNPM_VERSION` matching
     `packageManager` (confirm that the Pages build image honours it; record
     the image version), `LACE_API_BASE_URL` and `LACE_PUBLIC_BASE_URL` set to
     the Worker origin, and `LACE_BUILD_TOKEN` as an encrypted variable.
   Then create a deploy hook for the production branch and store its URL with
   `pnpm exec wrangler secret put LACE_DEPLOY_HOOK_URL --config worker/wrangler.jsonc`.
   Any other provider is acceptable only if its build hook accepts a bodiless
   `POST` without credentials. Enable tracking: set `LACE_PAGES_ACCOUNT_ID` and
   `LACE_PAGES_PROJECT_NAME` in `worker/wrangler.jsonc` `vars`, store the
   Pages-Read token with
   `pnpm exec wrangler secret put LACE_PAGES_API_TOKEN --config worker/wrangler.jsonc`,
   and redeploy the Worker.
10. **Publish and rebuild.** Publish a change in Admin. Within a few minutes the
    scheduled trigger (cron every minute) or the post-commit pass calls the hook.
    Admin's build history must show the build `running` with the Pages
    deployment ID and its current stage, then `succeeded` after the Pages
    deploy stage succeeds (or `failed`/`cancelled`/`unknown` with a reason).
    Without tracking the build stays `accepted`, which means only that the
    provider accepted the request.
11. **Confirm the deployment separately.** In the Pages dashboard or with
    `wrangler pages deployment list --project-name <project>`, confirm that the
    deployment with the recorded ID succeeded and matches the tracked outcome.
    Then fetch the published page from the Pages URL and confirm the new
    content and Worker-origin media URLs. Only this step verifies the served
    static site.
12. **Recovery checks.** Revoke or rename the hook temporarily, or set an
    invalid hook secret and redeploy. Confirm that publication stays committed
    and the build records a sanitized `provider_failed` or `trigger_unavailable`
    reason. Restore it and use Admin retry for a terminal failure. Confirm that
    an expired or used setup token is refused and that setup stays closed after
    a Worker redeploy.
13. **Diagnose.** `node --env-file=.env --env-file=.lace/cloudflare-operator.env node_modules/@lacecms/cli/dist/bin.js doctor --target cloudflare-remote --stage ready`
    with the build token present: migrations pass and the report contains no
    secret.

## Evidence and pass criteria

Record privately and summarize, without secrets, in the release record:

- artifact versions, template version, Wrangler version, date, account type;
- output of `health/ready` and of remote doctor `ready`;
- the browser setup, sign-in, media upload and publication outcome;
- the build history entry with status `succeeded`, stage `deploy` and the
  provider deployment ID, next to the provider's own `success` result for that
  ID (or `accepted` when tracking is deliberately not configured);
- the served Pages page containing the published change, its media loading
  from the Worker origin, and a later unpublished draft absent from it;
- the recovery-check outcomes in step 12;
- a scan of the deployed site output and Worker logs (`wrangler tail` during
  the run) showing no secret listed above.

The gate passes only when every item is present. If the provider accepted the
hook but the deployment cannot be confirmed, the gate fails with that reason.

## Cleanup

Delete the Pages project and its hook, the Pages-Read tracking token, the Worker
(`wrangler delete --config worker/wrangler.jsonc`), the D1 database, the R2
bucket (after emptying it) and the KV namespace, and revoke the API token and
build token. Deleting resources is irreversible. Confirm the account before
running any delete.
