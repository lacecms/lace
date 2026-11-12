---
title: Operate and recover Lace
description: Observe, back up, restore, upgrade and roll back an installation, and rotate its credentials.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Running Lace means keeping its database, media and configuration consistent, telling content publication apart from site deployment, and changing versions and credentials deliberately. This guide covers observation, backup and restore, upgrades from rc2, rollback and credential rotation for both runtimes. The generated `docs/lace-operations.md` contains the exact commands for your project's layout.

## Before you start

- A deployed installation on [Docker/VPS](../deployment/node/) or [Cloudflare](../deployment/cloudflare/).
- Your project in version control: site source, `lace.config.ts`, `.lace/manifest.json` and package locks. Keep environment files, the authentication secret, build tokens and remote management credentials private and outside version control.
- For upgrades: an installation on **0.1.0-rc2** or later. rc2 is the oldest supported release.

## Observe the system

Settings → Site status → **CMS version** identifies the running API package; compare it with your selected release. Read `/health/ready` and sanitized structured logs alongside Admin **Builds**. Readiness checks the migration ledger only: it does not prove configuration sync, storage, authentication or that your static site reflects the latest publication. Check the final site URL and the expected content.

Build states have distinct meanings. **Accepted** means a provider took a deploy-hook request; only **Succeeded** proves the release changed. Failed, Cancelled and Unknown builds can be retried after diagnosing the trigger, source, token or provider. `pnpm content:sync --check` compares code configuration with the stored models without writing.

Credentials are separate: a builder credential authorizes private build requests, a read-only build token reads the published export, and the authentication secret signs sessions.

## Back up and restore

Back up configuration, source and locks, the SQLite or D1 database and all corresponding MinIO or R2 objects as one coordinated set. SQL alone cannot restore media. Choose a maintenance point, stop writers (on Compose `docker compose stop api dispatcher builder`) and record the installed version and migration state. Use SQLite's backup API (or the CLI `.backup` command) rather than copying the database file, and copy every object through the S3 API with its key and bytes. On Cloudflare, export D1 with `wrangler d1 export` and copy R2 objects through the account's S3-compatible endpoint. Protect backups as private data: they contain password hashes and sessions.

Restore into an isolated environment first: a new database, bucket, origin and build output, with external deploy hooks disabled and replacement credentials. Use matching packages and storage mappings, check migration state and media access, sign in, read, edit and publish content and complete a new site build. Never point a restored test installation at production storage or hooks. A successful archive command does not prove a usable restore.

## Upgrade and roll back

Upgrades are supported from **rc2** (`0.1.0-rc2`) onward. An rc2 database already starts from the baseline migration, so it is upgraded in place with forward migrations, never recreated. Databases created before rc2 predate the baseline and are not supported: `lace db migrate` and `lace doctor` report `SCHEMA_UNSUPPORTED` for them and change nothing.

1. **Back up** configuration, source, package locks, deployment settings, the database and media objects together, as above.
2. **Update managed project files.** Generate a pristine project with the target `create-lace` release in a separate directory, using the same project name, site mode and `--cloudflare` choice. From your project, review the plan, then apply it:

   ```sh
   mkdir -p /work/upgrade-target && cd /work/upgrade-target
   pnpm dlx create-lace@<target-release> create my-site --starter
   cd /work/my-site
   pnpm exec lace upgrade --template /work/upgrade-target/my-site
   pnpm exec lace upgrade --template /work/upgrade-target/my-site --apply
   ```

   Replace the paths, `<target-release>` and the site-mode flag with your own.

   The plan is read-only. Files you edited conflict instead of being overwritten; apply then changes nothing and writes proposed files and diffs under `.lace/conflicts/` for you to merge. `lace.config.ts`, the site, README and environment files are never changed. `lace upgrade` does not install packages, migrate databases or contact services.

3. **Update packages and images together.** Install the reviewed dependencies, update the site's Lace packages to the same release, and set `LACE_API_IMAGE` and `LACE_BUILDER_IMAGE` (Compose) to the matching images. Update installed block components with `lace add block` as described in [Connect an Astro site](../astro-integration/#update-installed-components).
4. **Migrate the database explicitly.** Compose: stop `api` and `dispatcher`, then run `pnpm db:migrate`. Local Cloudflare: `pnpm cf:db:migrate`. Remote Cloudflare: `pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`. Local `cf:*` commands never migrate your account.
5. **Synchronize configuration** with `pnpm content:sync` or the selected Cloudflare target.
6. **Restart or redeploy and rebuild.** Run `pnpm prod:start`, or deploy the Worker, then rebuild the site and check it on the selected runtime: CMS version, sign-in, media and a successful build.

Rollback means restoring the backed-up packages, images, configuration, source, database and media together. `lace upgrade --rollback` restores only the managed project files of the latest upgrade; it does not undo database migrations, uploaded media or content. Migrations are forward-only and a newer engine may store shapes an older one cannot read, so a package-only downgrade is not supported. Builder and Pages caches are disposable and never part of a backup.

Custom code that reads the REST build export directly must follow its pagination and accept build-export format 2; sites using the SDK need the matching SDK version.

## Rotate credentials

- **Build token:** create a replacement in Settings, update the server-side site or builder settings, verify a fresh build, then revoke the old token. After a compromise, revoke immediately and accept temporary build downtime.
- **Authentication secret:** replace `LACE_AUTH_SECRET` while writes and dispatch are stopped, recreate the API or redeploy the Worker and expect every user to sign in again.
- **Builder secret and MinIO credentials:** change both sides together (API and dispatcher, and the builder or storage), recreate the affected services and verify that old credentials are refused and new ones work.
- **Deploy hook and Pages token:** replace the provider hook and the Worker secret together and revoke the old hook; rotate the Pages read-only token separately and verify tracking with the replacement.

Review user sessions after an account compromise. If setup is complete, do not try to bootstrap a second first administrator; use account recovery or your tested restore plan. For a revision conflict in Admin, keep the local copy before reloading the server draft; for an invalid configuration, fix the reported field rather than deleting data to force a sync.

## Enable optional features

MCP is disabled by default. [Connect an AI assistant](mcp/) explains enabling it after migrations, proxy routing, client setup, separately consented publication and revocation. The optional interactive API reference at `/api/docs` is described in the [API documentation](../reference/api/).

## Reference

- [CLI and environment](../reference/cli-environment/): `lace upgrade`, `lace db migrate`, `lace content sync`, `lace doctor` and every setting.
- [API documentation](../reference/api/): the build export format and health and build endpoints.
