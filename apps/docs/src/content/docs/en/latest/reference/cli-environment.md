---
title: CLI and environment
description: Choose explicit targets and keep server settings out of public output.
---

Invoke the CLI installed in your generated project through `pnpm exec lace`. Check `pnpm exec lace --help` and subcommand help for the installed version. Generated scripts set project-specific paths and targets; engine-checkout commands such as `pnpm dev:node` are for contributors and are not generated-consumer scripts.

| Operation                                              | Purpose                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `lace doctor`                                          | Read-only compatibility, migration/settings/infrastructure diagnostics |
| `lace db migrate`                                      | Apply committed forward database migrations explicitly                 |
| `lace content sync --check`                            | Read-only config reconciliation; nonzero when work is pending/invalid  |
| `lace content sync`                                    | Review and apply compatible guarded changes                            |
| `lace auth bootstrap`                                  | Mint the expiring one-time first-admin setup credential                |
| `lace add block --all --site <path>`                   | Install versioned editable block source into a selected site           |
| `lace cloudflare preflight --target cloudflare-remote` | Validate selected remote management settings/read access               |

Choose `node`, `cloudflare-local` or `cloudflare-remote` explicitly where the command requires a target. Remote commands use `--operator-env .lace/cloudflare-operator.env` and explicit account/database settings. A missing or invalid selected private file must be fixed; do not fall back to another account. Doctor does not start services, provision resources or prove every deployment permission. Its documented failure groups include settings/compatibility (4), migration (5) and infrastructure (6).

## Environment boundaries

| Setting                 | Use                                                                       |
| ----------------------- | ------------------------------------------------------------------------- |
| `LACE_PUBLIC_BASE_URL`  | Public CMS/admin URL, including intended prefix and trailing slash        |
| `LACE_API_BASE_URL`     | API origin/base read by server-side site builds                           |
| `LACE_BUILD_TOKEN`      | Private read-only credential for published exports                        |
| `LACE_AUTH_SECRET`      | CMS authentication secret; never a build token                            |
| `LACE_BUILD_SITE_URL`   | Public site's canonical/build URL                                         |
| `LACE_SITE_INDEXING`    | Indexing choice; `off` for staging                                        |
| `LACE_DEPLOY_HOOK_URL`  | Private provider hook used by configured build triggering                 |
| `LACE_API_DOCS_ENABLED` | Exact string `true` enables optional `/api/docs`; absent/`false` disables |

Read the generated `.env.example`, Worker vars/bindings and provider-specific guide before adding a setting. Node storage, builder and mail options belong to the relevant service; D1/R2/KV are Worker bindings. Remote management credentials belong in the operator file, not the Worker's application vars. Never copy secrets into `VITE_*`, client JS, HTML, screenshots or source control. Invalid settings are diagnosed by name without echoing supplied secrets.

Configuration file changes require a runtime restart or Worker redeploy because definitions are loaded/bundled. Sync is still a separate explicit operation. Environment eligibility does not replace the documented tested toolchain.
