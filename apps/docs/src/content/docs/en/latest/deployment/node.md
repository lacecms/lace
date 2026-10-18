---
title: Deploy on Docker or a VPS
description: Run the packaged Node CMS and a private static-site builder.
---

Create a matching generated project and complete local setup first. In production retain the generated Compose scenario guides: they name your exact site mode and storage mappings. Use matched alpha.6 package/API/builder versions; deploying the engine checkout is not the consumer installation path.

## Prepare persistent services

Review ignored `.env` privately: image references, public API URL, host ports, MinIO credentials and builder credentials. Keep SQLite data and object storage persistent. The public origin must include the intended path/trailing slash and match the reverse proxy and admin session origin. Terminate HTTPS at your proxy. Do not publish MinIO or the builder's private authenticated endpoint to browsers.

Stop `api` and `dispatcher` before host database maintenance. Run `pnpm db:migrate`, review/apply `pnpm content:sync`, bootstrap only an uninitialized installation, then start the generated production Compose topology using its `docs/lace-compose-production.md`. Ordinary restarts preserve data; never recreate volumes as a dependency-cache workaround on production data.

## Configure automatic builds

The first-party builder uses a fixed image-defined command and fixed mounts. Give it the selected user-owned site source, required server-side build settings and a published-content read token. It ignores request-provided command/path/environment overrides. Content publication queues work through the outbox; the dispatcher triggers the configured private builder.

The builder stages a release, builds it, and atomically switches the served output after success. A failure preserves the previous served release. Builds records the covering result; output may become visible shortly before its success status is recorded. Configure `LACE_BUILD_SITE_URL` and indexing behavior for your public host. A build token never belongs in browser environment variables.

## Verify and recover

Check API readiness, Admin login, a published page, media, Builds, and the final HTTPS site after a new publication. Confirm cached responses revalidate. If a build fails, inspect sanitized diagnostics, correct source/token/settings, then Retry in Builds. CMS publication remains committed even if the site build fails.

If publications stop triggering builds after a host SQLite command, stop/restart API and dispatcher and investigate the maintenance window. See [operations](../../operations/) before upgrades, storage moves or restores. Real VPS deployment, restoration and credential rotation require checking your actual infrastructure.
