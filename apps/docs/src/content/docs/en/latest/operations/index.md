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

Alpha.6 includes version-bound paginated exports. Custom direct-export consumers must traverse pages; use a matching SDK and adopt its compatibility policy. Composite fields and block/rich-text versions have their own constraints. Do not assume a downgrade can read newly stored shapes. Database migrations are forward-only; rollback can require restoring matching configuration, database and objects, not just selecting an old image.

Alpha.7 adds the image delivery changes. Upgrade the user-owned site's dependencies and image configuration, then review image/gallery/hero component updates and lightbox/link styles. Review managed nginx, Compose and Pages workflow conflicts; adopt the site's `public/_headers` manually. The ownership template is 0.35.0; it does not automatically rewrite your site or `lace.config.ts`.

There is no new SQL migration since alpha.6. Configuration synchronization is a separate operation: raise versions of models allowing image/gallery and sync to image/gallery schemas 4/3, with matching components ready before the next build. Older components fail with `block_version_mismatch`. Back up first; after sync, rolling back to alpha.6 can require restoring matching configuration/content and source components as well as packages/images. Retain corresponding media objects. Package-only downgrade does not reverse stored schemas. Builder and Pages caches are disposable and are never application backups.

## Rotate credentials

Issue a replacement build token, update server-side site/build settings, verify a fresh build, then revoke the old token. Rotate object-store, private-builder, email and management credentials through their respective configuration boundaries, restarting/redeploying the consumers. Review user sessions after account compromise. Auth-secret changes affect session behavior and need a deliberate maintenance plan.

If setup is complete, do not try to bootstrap a second first administrator. Use supported account recovery or your tested restore plan. For revision conflicts, preserve local JSON before explicitly reloading a server draft; for invalid config, fix the reported field rather than deleting data to force sync.

## Upgrading to alpha.8

Upgrade all Lace dependencies and API/builder images together, including the
site SDK/render/Astro packages. Alpha.8 uses build-export format 2 and adds SQL
migrations 0010–0013 since alpha.7. Back up matching database, object storage,
configuration, site source and deployment files before migration or content sync.
Review managed deployment changes and user-owned component conflicts, including
internal-link renderers, Link and optional videoEmbed. Restore matching backups
for rollback; changing package tags cannot reverse content or schema changes.

MCP remains disabled by default. Apply migrations before enabling it and follow
[account connections](../editing-content/accounts/) and the client-specific setup
in Settings. Review your canonical public origin and proxy routes, keep OAuth
credentials out of logs, and test owned revocation. Consent and current roles
limit tools to model/list/get/create/save-draft; publishing and deletion remain
unavailable. Local checks do not establish your production deployment or restore.
