---
title: CLI and environment
description: Every lace and create-lace command, flag and exit code, and every LACE_* setting with the runtime that reads it.
kind: reference
verifiedAgainst: 0.1.0-rc3
---

Run the CLI installed in your generated project with `pnpm exec lace <command>`. The generated `package.json` wraps the common commands in scripts (`pnpm db:migrate`, `pnpm content:sync`, `pnpm auth:bootstrap`, `pnpm env:prepare` and, with Cloudflare, the `cf:*` scripts); those scripts load the root `.env` with `node --env-file=.env`. Engine-checkout commands such as `pnpm dev:node` belong to Lace contributors and are not generated-consumer scripts. `pnpm exec lace --help` and `pnpm exec lace <command> --help` print the usage of the installed release.

## create-lace

Create a project with `pnpm create lace <dir>`, which runs `create-lace`. The usage is `create-lace [create] <dir> [site mode] [--cloudflare]` or `create-lace init . [site mode] [--cloudflare]`.

| Mode                       | Purpose                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-lace create <dir>` | Generate a project in a new or empty directory; the bare form `create-lace <dir>` is the same. The directory may contain only `.git`, `README.md` and `LICENSE`. |
| `create-lace init .`       | Generate a project in the current directory under the same empty-directory rule.                                                                                 |

| Flag                     | Purpose                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--starter`              | Site mode: generate the editable Astro starter site in `site/`.                                                                                                   |
| `--existing-site <path>` | Site mode: connect an existing Astro site at a relative path (for example `..`); the generator does not modify it. Then run `lace add block --all --site <path>`. |
| `--no-site`              | Site mode: CMS only. No builder is generated and build requests fail until a site is connected.                                                                   |
| `--cloudflare`           | Add the Cloudflare CMS Worker in `worker/` and, with a site, the static-site Pages workflow. Works with every site mode.                                          |

Use at most one site-mode flag. Without one, a terminal asks for the mode (default: existing site at `..` when the parent directory is an Astro project, otherwise starter); without a terminal the starter is generated. Exit codes: `0` success, `1` generation failed, `2` usage error, including two mode flags or a missing path. See [Getting started](../../getting-started/).

## lace commands

| Command                     | Purpose                                                                                                                                                                                             | Targets                                                    | Guide                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `lace db migrate`           | Apply the release's forward database migrations; safe to repeat. Creates missing parent directories of a SQLite path. Refuses a database created before rc2 (`SCHEMA_UNSUPPORTED`).                 | `node` (default), `cloudflare-local`, `cloudflare-remote`  | [Operations](../../operations/)                                      |
| `lace content sync`         | Compare `lace.config.ts` with the stored models and apply compatible changes, including block migrations, atomically. With `--check` it only reports.                                               | `node` (default), `cloudflare-local`, `cloudflare-remote`  | [Synchronize configuration](../../content-modeling/synchronization/) |
| `lace auth bootstrap`       | Print one expiring setup token for creating the first administrator. Refused after setup is complete.                                                                                               | `node` (default), `cloudflare-local`, `cloudflare-remote`  | [Getting started](../../getting-started/)                            |
| `lace env prepare`          | Create a protected `.env` from `.env.example` with fresh local credentials, or with `--target cloudflare-local` a protected `worker/.dev.vars` from its example. Never overwrites an existing file. | project (default), `cloudflare-local`                      | [Getting started](../../getting-started/)                            |
| `lace doctor`               | Read-only diagnostics of tools, settings, site, infrastructure, migrations, API readiness and build token. Does not start services, provision resources or prove deployment permissions.            | `node`, `cloudflare-local`, `cloudflare-remote` (required) | [Operations](../../operations/)                                      |
| `lace upgrade`              | Review (default), apply or roll back an update of the generated managed files from a newer project template. Never overwrites edited files; conflicts are written for review.                       | none                                                       | [Operations](../../operations/)                                      |
| `lace add block`            | Install or update registry block components in a site, regenerate its block map and record them in `lace.site.json`. Edited files are never overwritten.                                            | none                                                       | [Create a custom block](../../content-modeling/custom-blocks/)       |
| `lace import`               | Load an import package into a running installation through the admin API, or check it offline with `--validate-only`.                                                                               | API origin from `--url` or `LACE_API_BASE_URL`             | [Import content](../../editing-content/import/)                      |
| `lace cloudflare preflight` | Check remote Cloudflare settings and credential sources with one read-only D1 query before account commands.                                                                                        | `cloudflare-remote` (required)                             | [Cloudflare deployment](../../deployment/cloudflare/)                |

The usage of each command is:

```text
lace <db migrate|content sync [--check]|auth bootstrap> [--target node|cloudflare-local|cloudflare-remote] [--operator-env <path>] [--json]
lace env prepare [--target cloudflare-local] [--json]
lace doctor --target node|cloudflare-local|cloudflare-remote --stage setup|ready [--mode native|compose] [--json]
lace upgrade --template <dir> [--apply] [--project <dir>] [--json]
lace upgrade --rollback [--project <dir>] [--json]
lace add block <type...>|--all [--site <dir>] [--framework astro] [--dry-run] [--write-new] [--json]
lace import <dir> [--url <origin>] [--publish] [--dry-run] [--overwrite] [--state <path>] [--json]
lace import <dir> --validate-only [--publish] [--json]
lace cloudflare preflight --target cloudflare-remote --wrangler-auth token|oauth [--operator-env <path>] [--json]
```

## Flags

| Flag                     | Commands                                                                                                 | Purpose                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--target <target>`      | `db migrate`, `content sync`, `auth bootstrap`, `env prepare`, `doctor`, `cloudflare preflight`          | Select the installation explicitly. Omitted on maintenance commands, it selects only the local Node database; a remote target is never inferred.                                                               |
| `--operator-env <path>`  | `db migrate`, `content sync`, `auth bootstrap`, `cloudflare preflight` with `--target cloudflare-remote` | Load remote account settings from a private operator file (for example `.lace/cloudflare-operator.env`). Process values override the file. A missing or unsafe file fails without a fallback.                  |
| `--check`                | `content sync`                                                                                           | Report the synchronization plan without writing; exit `2` when changes are pending or invalid.                                                                                                                 |
| `--json`                 | every `lace` command                                                                                     | Print one JSON object (`ok`, `code`, `message`, optional `data`; failures add `operation`, `reason`, `nextAction`) on stdout instead of text.                                                                  |
| `--stage <stage>`        | `doctor`                                                                                                 | `setup` reports unfinished steps (such as a missing build token) as expected; `ready` fails them.                                                                                                              |
| `--mode <mode>`          | `doctor` with `--target node`                                                                            | `native` (default) for host processes or `compose` for the Docker Compose deployment.                                                                                                                          |
| `--template <dir>`       | `upgrade`                                                                                                | The pristine project of the target release, generated by `create-lace` with the same site mode and Cloudflare choice. Required except with `--rollback`.                                                       |
| `--apply`                | `upgrade`                                                                                                | Apply a conflict-free plan, or resume a matching interrupted upgrade. Without it, upgrade writes nothing.                                                                                                      |
| `--rollback`             | `upgrade`                                                                                                | Restore the latest recorded filesystem upgrade. Does not undo database migrations or restore media.                                                                                                            |
| `--project <dir>`        | `upgrade`                                                                                                | The project to upgrade; defaults to the current directory.                                                                                                                                                     |
| `--all`                  | `add block`                                                                                              | Install every registry block instead of named types. Requires `lace.config.ts` in the working directory.                                                                                                       |
| `--site <dir>`           | `add block`                                                                                              | The site root, relative to the working directory; defaults to `site`.                                                                                                                                          |
| `--framework <key>`      | `add block`                                                                                              | The site framework; only `astro` is supported. Defaults to the value in `lace.site.json` or the detected framework.                                                                                            |
| `--dry-run`              | `add block`, `import`                                                                                    | Print the plan without writing files (`add block`) or content (`import`, which makes only read requests).                                                                                                      |
| `--write-new`            | `add block`                                                                                              | For each conflicting file, also write the registry version to a `<path>.new` file.                                                                                                                             |
| `--url <origin>`         | `import`                                                                                                 | The API origin to import into; overrides `LACE_API_BASE_URL`.                                                                                                                                                  |
| `--publish`              | `import`                                                                                                 | Publish imported entries; needs an import token issued with publishing.                                                                                                                                        |
| `--overwrite`            | `import`                                                                                                 | Replace drafts that were edited after a previous import instead of reporting a conflict.                                                                                                                       |
| `--state <path>`         | `import`                                                                                                 | The state file that maps package keys to created IDs; defaults to `<dir>/lace-import.state.json`.                                                                                                              |
| `--validate-only`        | `import`                                                                                                 | Check the package against `lace.config.ts` offline, with no token or network request. Cannot combine with `--url`, `--dry-run`, `--overwrite` or `--state`.                                                    |
| `--wrangler-auth <mode>` | `cloudflare preflight`                                                                                   | How Wrangler will authenticate: `token` (a `CLOUDFLARE_API_TOKEN` loaded for the invocation) or `oauth` (Wrangler login; preflight fails if a token in the process, `.env` or `.env.local` would override it). |

Unknown, repeated or conflicting flags are usage errors.

## Targets

| Target              | Selects                                                  | Required settings                                                                              |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `node`              | The local SQLite database                                | `LACE_DATABASE_PATH`                                                                           |
| `cloudflare-local`  | The simulated D1 state shared with `pnpm cf:dev`         | `LACE_D1_DATABASE_ID`, `LACE_CLOUDFLARE_PERSIST_TO`, `LACE_WRANGLER_CONFIG`                    |
| `cloudflare-remote` | The D1 database of a Cloudflare account, only when named | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `LACE_D1_DATABASE_ID`, `LACE_WRANGLER_CONFIG` |

A missing or invalid selected setting or operator file must be fixed; no command falls back to another target or account. Cloudflare targets need the project's installed Wrangler and Miniflare; Node targets need neither. Host SQLite commands refuse to run while a running Compose `api` or `dispatcher` uses the same database: stop them first.

## Exit codes

| Code | Meaning       | Returned when                                                                                                                                                                                                                               |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success       | The command succeeded; `--check` found nothing pending; all doctor or preflight checks passed or were expected; an upgrade or block plan has no conflicts; an import package is valid.                                                      |
| `2`  | Pending       | `content sync --check` found pending or invalid changes; `upgrade` or `add block` found conflicts or a block version mismatch; `import` found a conflict (`IMPORT_CONFLICT`).                                                               |
| `3`  | Usage         | Arguments are missing, unknown, repeated or conflicting.                                                                                                                                                                                    |
| `4`  | Configuration | A setting, operator file, `lace.config.ts`, template, upgrade manifest or block input is missing or invalid; a doctor prerequisite failed; an import package is invalid (`IMPORT_INVALID`, `IMPORT_CONFIG_MISMATCH`).                       |
| `5`  | Schema        | The database lacks migrations (`SCHEMA_OUTDATED`) or was created by an engine older than rc2 (`SCHEMA_UNSUPPORTED`); a doctor migration check failed.                                                                                       |
| `6`  | Operation     | An infrastructure or runtime operation failed: blocked synchronization, setup already complete, an existing `.env`, running Compose consumers, an upgrade lock or recovery failure, an import authorization, rate-limit or request failure. |

`lace doctor` and `lace cloudflare preflight` run their independent checks and return the lowest failing code (`4`, then `5`, then `6`). Output never contains supplied secrets; invalid settings are named without their values.

## Environment

Read the generated `.env.example`, `worker/wrangler.jsonc`, `worker/.dev.vars.example` and the generated guides in `docs/` before adding a setting. "Required" means the runtime refuses to start or the command fails without the setting.

### Node project `.env` and Docker Compose

`pnpm env:prepare` creates `.env` from `.env.example`. Docker Compose reads it for the `api`, `dispatcher`, `builder`, `minio` and `web` services, and the host `pnpm` scripts and `lace doctor` read it too.

| Setting                      | Used by                                        | Secret | Default / required                             | Purpose                                                                                                                                             |
| ---------------------------- | ---------------------------------------------- | ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LACE_PUBLIC_BASE_URL`       | API, builder                                   | No     | Required; `http://127.0.0.1:3000/` locally     | Browser-reachable CMS URL for sign-in, admin, API and media links: an absolute HTTP(S) URL ending with `/`, without credentials, query or fragment. |
| `LACE_API_BASE_URL`          | Host site builds, `lace import`, `lace doctor` | No     | `http://127.0.0.1:3000/`                       | API origin that serves the published build export. The Compose builder uses the internal `http://api:3000/` instead.                                |
| `LACE_DATABASE_PATH`         | API, `--target node` commands, doctor          | No     | Required; `./.lace/data/lace.sqlite`           | SQLite database file. Compose mounts `.lace/data` and uses `/data/lace.sqlite` inside containers; `doctor --mode compose` expects the default.      |
| `LACE_TRUSTED_PROXY_CIDRS`   | API                                            | No     | Empty                                          | Comma-separated CIDRs of your own reverse proxies whose forwarding headers identify clients. Empty trusts only the TCP peer.                        |
| `LACE_API_IMAGE`             | Compose                                        | No     | `ghcr.io/lacecms/api:0.1.0-rc3`                | API image for the `api`, `dispatcher`, `migrate` and `minio-init` services. Upgrade it together with the packages.                                  |
| `LACE_BUILDER_IMAGE`         | Compose                                        | No     | `ghcr.io/lacecms/builder:0.1.0-rc3`            | Builder image for the site builder and static output volume.                                                                                        |
| `LACE_AUTH_SECRET`           | API                                            | Yes    | Required; generated by `env prepare`           | CMS authentication secret for sessions and tokens. Never use it as a build token.                                                                   |
| `LACE_MINIO_ROOT_ACCESS_KEY` | MinIO, API                                     | Yes    | Required; generated                            | MinIO root user; Compose passes it to the API as `LACE_MINIO_ACCESS_KEY`.                                                                           |
| `LACE_MINIO_ROOT_SECRET`     | MinIO, API                                     | Yes    | Required; generated                            | MinIO root password; Compose passes it to the API as `LACE_MINIO_SECRET_KEY`.                                                                       |
| `LACE_MINIO_BUCKET`          | API, `minio-init`                              | No     | `lace-media`                                   | Object storage bucket for media (3–63 lowercase letters, digits, dots or hyphens).                                                                  |
| `LACE_MINIO_REGION`          | API, `minio-init`                              | No     | `us-east-1`                                    | Object storage region.                                                                                                                              |
| `LACE_MINIO_TIMEOUT_MS`      | API                                            | No     | `5000` (1–60000)                               | Timeout of one object storage request in milliseconds.                                                                                              |
| `LACE_BUILDER_SECRET`        | Dispatcher, builder                            | Yes    | Required with a site; generated                | Shared secret (at least 32 characters) that authenticates build requests from the dispatcher to the builder.                                        |
| `LACE_BUILD_TOKEN`           | Builder, host site builds, doctor              | Yes    | Empty until issued                             | Read-only build token from Admin Settings for published exports.                                                                                    |
| `LACE_API_PORT`              | Compose                                        | No     | `3000`                                         | Host port that publishes the API.                                                                                                                   |
| `LACE_HTTP_PORT`             | Compose                                        | No     | `8080`                                         | Host port of the web proxy that serves the built site and forwards `/api/`, `/admin`, `/mcp` and health routes to the API.                          |
| `LACE_EMAIL_PROVIDER`        | API                                            | No     | Empty (delivery not configured)                | `smtp` or `resend`; `log` writes messages to the output and is refused in production.                                                               |
| `LACE_EMAIL_FROM`            | API                                            | No     | Required with a provider                       | Sender, as an address or `Name <address>`.                                                                                                          |
| `LACE_EMAIL_TIMEOUT_MS`      | API                                            | No     | `10000` (1–60000)                              | Timeout of one delivery attempt in milliseconds.                                                                                                    |
| `LACE_SMTP_HOST`             | API                                            | No     | Required for `smtp`                            | SMTP server host name.                                                                                                                              |
| `LACE_SMTP_PORT`             | API                                            | No     | `587`                                          | SMTP server port.                                                                                                                                   |
| `LACE_SMTP_SECURITY`         | API                                            | No     | `starttls`                                     | `starttls`, `tls`, or `none` (refused in production).                                                                                               |
| `LACE_SMTP_USER`             | API                                            | No     | Optional; set with the password                | SMTP user name.                                                                                                                                     |
| `LACE_SMTP_PASSWORD`         | API                                            | Yes    | Required with a user                           | SMTP password, used verbatim.                                                                                                                       |
| `LACE_RESEND_API_KEY`        | API                                            | Yes    | Required for `resend`                          | Resend API key.                                                                                                                                     |
| `LACE_BUILD_SOURCE_ROOT`     | Compose builder                                | No     | `.` (starter) or the site path (existing site) | Host directory mounted read-only as the build source.                                                                                               |
| `LACE_BUILD_SITE_DIR`        | Builder                                        | No     | `site` (starter) or `.` (existing site)        | Site directory inside the build source.                                                                                                             |
| `LACE_BUILD_OUTPUT_DIR`      | Builder                                        | No     | `dist`                                         | Build output directory inside the site.                                                                                                             |
| `LACE_BUILD_SITE_ID`         | API                                            | No     | `main-site`                                    | Identity of the build site shown in Admin (1–64 lowercase kebab-case characters).                                                                   |
| `LACE_BUILD_SITE_LABEL`      | API                                            | No     | `Main site`                                    | Name of the build site shown in Admin.                                                                                                              |
| `LACE_BUILD_SITE_URL`        | API, builder                                   | No     | Empty                                          | Public site base URL: "Open on site" links in the editor, canonical URLs, `og:url` and `sitemap.xml`. Empty builds no sitemap.                      |
| `LACE_SITE_INDEXING`         | Builder                                        | No     | Empty (`on`)                                   | `off` marks every page `noindex` and makes `robots.txt` disallow everything, for staging and previews.                                              |
| `LACE_API_DOCS_ENABLED`      | API                                            | No     | `false`                                        | The exact string `true` enables the interactive reference at `/api/docs`.                                                                           |
| `LACE_MCP_ENABLED`           | API                                            | No     | `false`                                        | The exact string `true` enables the MCP content server. Apply migrations first; see [MCP](../mcp/).                                                 |

The Compose file sets these API settings itself; do not put them in `.env`:

| Setting                 | Used by    | Secret | Default / required                          | Purpose                                                            |
| ----------------------- | ---------- | ------ | ------------------------------------------- | ------------------------------------------------------------------ |
| `LACE_HOST`             | API        | No     | `127.0.0.1`; Compose sets `0.0.0.0`         | Address the API listens on.                                        |
| `LACE_PORT`             | API        | No     | `3000`                                      | Port the API listens on inside its container.                      |
| `LACE_MINIO_ACCESS_KEY` | API        | Yes    | Required; from `LACE_MINIO_ROOT_ACCESS_KEY` | Object storage access key.                                         |
| `LACE_MINIO_SECRET_KEY` | API        | Yes    | Required; from `LACE_MINIO_ROOT_SECRET`     | Object storage secret key.                                         |
| `LACE_MINIO_ENDPOINT`   | API        | No     | Required; `http://minio:9000`               | Object storage origin.                                             |
| `LACE_BUILDER_URL`      | Dispatcher | No     | `http://builder:8788/` with a site          | Builder origin for build requests; requires `LACE_BUILDER_SECRET`. |

Values that are empty or absent in `.env` fall back to the Compose defaults above. Invalid values stop the API at startup with the setting names only.

### Cloudflare Worker vars, secrets and bindings

Set plain vars in the `vars` of `worker/wrangler.jsonc`, secrets with `pnpm exec wrangler secret put <NAME> --config worker/wrangler.jsonc`, and local values in the ignored `worker/.dev.vars` (`pnpm cf:env:prepare`). Redeploy after a change.

| Setting                               | Used by | Secret | Default / required                  | Purpose                                                                                                                         |
| ------------------------------------- | ------- | ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `LACE_PUBLIC_BASE_URL`                | Worker  | No     | Required                            | The Worker's public HTTPS origin with a trailing slash; `worker/.dev.vars` sets `http://127.0.0.1:8787/` for local development. |
| `LACE_AUTH_SECRET`                    | Worker  | Yes    | Required                            | CMS authentication secret (at least 32 random bytes); not a Cloudflare credential.                                              |
| `LACE_ENVIRONMENT`                    | Worker  | No     | `production`                        | `development` (set in `worker/.dev.vars`) permits the `log` email provider and local HTTP stubs.                                |
| `LACE_MCP_ENABLED`                    | Worker  | No     | `false`                             | The exact string `true` enables the MCP content server. Apply migrations first.                                                 |
| `LACE_API_DOCS_ENABLED`               | Worker  | No     | Absent (disabled)                   | The exact string `true` enables `/api/docs`.                                                                                    |
| `LACE_BUILD_SITE_ID`                  | Worker  | No     | `main-site` (with a site)           | Identity of the build site shown in Admin.                                                                                      |
| `LACE_BUILD_SITE_LABEL`               | Worker  | No     | `Main site` (with a site)           | Name of the build site shown in Admin.                                                                                          |
| `LACE_BUILD_SITE_URL`                 | Worker  | No     | Absent                              | Public site URL for "Open on site" links; requires the site identity.                                                           |
| `LACE_EMAIL_PROVIDER`                 | Worker  | No     | Absent; `log` in `worker/.dev.vars` | `resend`, `cloudflare` (Workers Paid, an onboarded sending domain and the `EMAIL` binding) or `log` (development only).         |
| `LACE_EMAIL_FROM`                     | Worker  | No     | Required with a provider            | Sender, as an address or `Name <address>`.                                                                                      |
| `LACE_EMAIL_TIMEOUT_MS`               | Worker  | No     | `10000` (1–60000)                   | Timeout of one delivery attempt in milliseconds.                                                                                |
| `LACE_RESEND_API_KEY`                 | Worker  | Yes    | Required for `resend`               | Resend API key.                                                                                                                 |
| `LACE_DEPLOY_HOOK_URL`                | Worker  | Yes    | Optional                            | HTTPS deploy hook (for example of a Git-connected Pages project) that the Worker calls after each publication.                  |
| `LACE_DEPLOY_HOOK_TIMEOUT_MS`         | Worker  | No     | `10000` (1–60000)                   | Timeout of the deploy hook request in milliseconds.                                                                             |
| `LACE_PAGES_ACCOUNT_ID`               | Worker  | No     | Optional; set with the next two     | 32-hex account ID of the Pages project whose deployments Builds tracks.                                                         |
| `LACE_PAGES_PROJECT_NAME`             | Worker  | No     | Optional; set with the others       | Pages project name for deployment tracking.                                                                                     |
| `LACE_PAGES_API_TOKEN`                | Worker  | Yes    | Optional; set with the others       | Separate Cloudflare API token with Pages Read only, used for deployment tracking.                                               |
| `LACE_PAGES_TRACKING_TIMEOUT_MINUTES` | Worker  | No     | `60` (5–1440)                       | Minutes after which a tracked build is reported as Unknown.                                                                     |
| `LACE_PAGES_API_BASE_URL`             | Worker  | No     | Cloudflare API                      | Development only: the origin of a local Cloudflare API stub for tracking tests.                                                 |
| `LACE_R2_TIMEOUT_MS`                  | Worker  | No     | `10000` (1–60000)                   | Timeout of one R2 request in milliseconds.                                                                                      |

The Worker also needs the bindings `DB` (D1 database, required), `MEDIA` (R2 bucket, required) and `ASSETS` (the installed admin), and accepts `CACHE` (KV namespace, optional derived cache) and `EMAIL` (`send_email`, required for the `cloudflare` email provider). See [Cloudflare deployment](../../deployment/cloudflare/).

### Cloudflare operator settings

Local Cloudflare commands read these from `.env`. Remote account commands read them from the private operator file `.lace/cloudflare-operator.env` (owner-only permissions), selected with `--operator-env`. Keep the API token out of `.env` and `.env.local`, which Wrangler loads implicitly.

| Setting                      | Used by                               | Secret | Default / required                               | Purpose                                                                                  |
| ---------------------------- | ------------------------------------- | ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `LACE_D1_DATABASE_ID`        | Cloudflare targets, doctor, preflight | No     | Required; placeholder until `wrangler d1 create` | D1 database ID; must equal the `DB` `database_id` in `worker/wrangler.jsonc`.            |
| `LACE_WRANGLER_CONFIG`       | Cloudflare targets, doctor, preflight | No     | `worker/wrangler.jsonc`                          | Worker configuration whose migrations and `DB` binding the commands use.                 |
| `LACE_CLOUDFLARE_PERSIST_TO` | `cloudflare-local`                    | No     | `./.lace/data/cloudflare`                        | Local simulated Cloudflare state shared with `pnpm cf:dev`.                              |
| `CLOUDFLARE_ACCOUNT_ID`      | `cloudflare-remote`, preflight        | No     | Required for remote                              | 32-hex Cloudflare account ID.                                                            |
| `CLOUDFLARE_API_TOKEN`       | `cloudflare-remote`, preflight        | Yes    | Required for remote                              | Operator API token with D1 access; only in the operator file or the process environment. |

### Site build

The site's server-side build reads these, for example from the site's ignored `.env` or the Pages workflow variables. Never prefix them with `PUBLIC_`.

| Setting                           | Used by                    | Secret | Default / required  | Purpose                                                                                                           |
| --------------------------------- | -------------------------- | ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `LACE_API_BASE_URL`               | Site loader, image service | No     | Required            | Origin of the Lace API that serves the published build export.                                                    |
| `LACE_BUILD_TOKEN`                | Site loader                | Yes    | Required            | Read-only build token; read only in server code.                                                                  |
| `LACE_PUBLIC_BASE_URL`            | Site loader                | No     | `LACE_API_BASE_URL` | Browser-facing API origin for media URLs.                                                                         |
| `LACE_EXPECTED_PUBLISHED_VERSION` | Site loader                | No     | Optional            | Published version the build must read; the Compose builder sets it so a build fails if content changes mid-build. |
| `LACE_BUILD_SITE_URL`             | Site loader, Astro adapter | No     | Optional            | Public site base URL for canonical URLs, `og:url` and `sitemap.xml`.                                              |
| `LACE_SITE_INDEXING`              | Site loader, Astro adapter | No     | `on`                | `off` keeps staging builds out of search engines.                                                                 |

### CLI shell only

| Setting             | Used by       | Secret | Default / required                | Purpose                                                                                                                                                                  |
| ------------------- | ------------- | ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LACE_IMPORT_TOKEN` | `lace import` | Yes    | Required except `--validate-only` | Short-lived import token from Admin Settings. Set it for the shell session only; never in `.env` or source control. See [Import content](../../editing-content/import/). |

## Secrets and configuration changes

Node storage, builder and mail settings belong to the service that reads them; D1, R2 and KV are Worker bindings. Remote management credentials belong in the operator file, not in the Worker's application vars. Never copy secrets into `VITE_*` or `PUBLIC_*` variables, client JavaScript, HTML, screenshots or source control. Invalid settings are diagnosed by name without echoing supplied secrets.

Changes to `lace.config.ts` or to settings require a runtime restart or Worker redeploy, because definitions and settings are loaded at startup or bundled. Configuration synchronization is still a separate explicit `lace content sync`. Meeting the minimum tool versions does not replace the documented tested toolchain.
