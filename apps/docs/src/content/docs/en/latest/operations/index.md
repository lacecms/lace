---
title: Operate and recover Lace
description: Maintain persistence, credentials, builds and compatible upgrades.
---

Use the generated installation's `docs/lace-operations.md` for commands tied to your layout. Keep internal engineering verification separate from your own production evidence.

## Observe the system

Read readiness and sanitized structured logs alongside Admin Builds. Readiness is not proof that your static site reflects the latest publication. Check the final site URL and expected content version. Accepted, succeeded, failed, cancelled and unknown build states have distinct meanings; retry only after diagnosing the trigger, source, token or provider failure.

Keep site source, `lace.config.ts`, managed-file ownership and package locks version controlled. Keep environment files, auth secrets, build tokens and remote management credentials private. A builder credential authorizes private build requests; it is different from the read-only published-export token and the authentication secret.

## Back up and restore

Back up configuration/source/locks, SQLite or D1, and all corresponding MinIO/R2 objects as a coordinated set. SQL alone cannot restore binary media. Select a consistent maintenance point, stop writers for the chosen backup procedure, and record the installed version and migration state. Protect backups as private data.

Restore into an isolated environment first. Use matching packages and storage mappings, validate database migration state and media access, sign in, read/edit/publish content and complete a new site build. Do not point a restored test installation at production storage or deploy hooks. A successful archive command does not prove a usable restore.

## Upgrade and roll back

Upgrade all Lace packages and API/builder images together. Read release-specific compatibility instructions, back up, stop services for host SQLite maintenance, apply forward database migrations explicitly, review config sync, and restart/deploy the matching runtime. For Cloudflare choose the remote target explicitly; local `cf:*` commands never migrate the account.

The supported upgrade path starts at rc1 (`0.1.0-rc1`). The database starts from one baseline migration, so an rc1 database is recreated rather than migrated: `lace db migrate` and `lace doctor` report `SCHEMA_UNSUPPORTED` for it and change nothing. Keep the content you need in source files for `lace import`, back up configuration, source, database and objects, upgrade packages and images together, recreate and migrate the database, run config sync and bootstrap, then restore content and rebuild the site. The generated project's upgrade instructions list the exact commands for Compose and Cloudflare.

Custom direct-export consumers must traverse export pages and accept build-export format 2; use a matching SDK. Block definitions and rich text have their own version constraints. Do not assume a downgrade can read newly stored shapes. Database migrations are forward-only; rollback requires restoring matching configuration, database and objects, not just selecting an old image. Builder and Pages caches are disposable and are never application backups.

## Rotate credentials

Issue a replacement build token, update server-side site/build settings, verify a fresh build, then revoke the old token. Rotate object-store, private-builder, email and management credentials through their respective configuration boundaries, restarting/redeploying the consumers. Review user sessions after account compromise. Auth-secret changes affect session behavior and need a deliberate maintenance plan.

If setup is complete, do not try to bootstrap a second first administrator. Use supported account recovery or your tested restore plan. For revision conflicts, preserve local JSON before explicitly reloading a server draft; for invalid config, fix the reported field rather than deleting data to force sync.

## Enable MCP

MCP is disabled by default. Apply migrations before enabling it and follow
[account connections](../editing-content/accounts/) and the client-specific setup
in Settings. Review your canonical public origin and proxy routes, keep OAuth
credentials out of logs, and test owned revocation. Consent and current roles
limit tools; publication additionally requires the separately consented
`content:publish` scope, and unpublication and deletion remain unavailable.
Local checks do not establish your production deployment or restore.
