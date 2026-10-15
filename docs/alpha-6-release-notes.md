# Alpha.6 release preparation and upgrade notes

Selected candidate: `0.1.0-alpha.6`, npm channel `next`, ownership template
`0.30.0`. Preparation is in progress; publication and real deployment approval
remain separate. These notes do not announce availability. See
[release preparation](./alpha-release.md) and
[owner verification](./real-application-verification.md).

## Changes since alpha.5

- Public SDK reads tolerate additive unknown API fields while retaining required
  keys, types, constraints and hidden-block safety. Server responses remain
  strictly validated. Unsupported export formats fail with an actionable error.
- Build export declares `formatVersion: 1` and is delivered in version-bound
  keyset pages. The SDK assembles them into one export; the builder probes with
  `limit=1`. This bounds per-request work on Node and Cloudflare.
- The media panel offers confirmed deletion with detachment from using drafts.
  Published usage remains protected and no published snapshot is rewritten.

## Public-contract compatibility

**The raw HTTP build-export response changed.** `GET /api/v1/public/build-export`
returns a first page with entries, globals, SEO, media and optional `nextCursor`;
continuation pages contain entries/media and omit globals/SEO. Follow
`?after=<cursor>` until no cursor remains. Optional `limit` is 1–100. Each page
has the same published version and `formatVersion: 1`, with page-scoped media.
Do not decode cursors or treat the first page as the complete site.

Publication between pages returns HTTP 409 `BUILD_EXPORT_VERSION_CHANGED`.
The matching SDK `getBuildExport()` restarts once and returns one consistent
assembled export. A pinned site build fails with `version_mismatch` instead of
switching versions. First-page conditional retrieval still supports `304`.
Use matching SDK/site loaders rather than implementing unchecked page merging.

Upgrade API/admin, builder, all Lace site dependencies and generator together.
All fourteen scoped packages and `create-lace` use `0.1.0-alpha.6`, and both
images use that tag. An alpha.5 SDK cannot safely consume the new response contract; an alpha.6
SDK rejects an older export without `formatVersion`. Tolerant parsing does not
make these release sets interchangeable. Custom code using the former
repository export port must adopt its page-oriented replacement. Review
exhaustive TypeScript consumers against the matching declarations.

## Upgrade and migration order

1. Record installed versions; stop writes/dispatch and back up matching database,
   configuration, object bytes and site source/output.
2. Generate template 0.30.0 with the same site mode/path and Cloudflare selection.
   Review `lace upgrade` managed-file conflicts. User-owned `.env`, site files,
   `lace.config.ts`, README and Worker operator settings require manual review.
3. Install matching alpha.6 Lace dependencies and explicitly update API/builder
   image tags. Update user-owned Astro dependencies together, then rebuild the
   Cloudflare Worker when applicable. Coordinates are downloadable only after
   publication.
4. Apply any pending forward database migrations and synchronize configuration
   explicitly. There are no new migration files relative to the accepted
   alpha.5 artifact source. Older baselines still require their pending journal
   migrations; see [alpha.5 migration notes](./alpha-5-release-notes.md).
5. Start/deploy the coordinated engine/admin and builder, rebuild the site, and
   verify a multi-page export, rendered media and publication/build recovery.

For Node/Compose, stop `api` and `dispatcher` throughout host database work,
copy the stopped `.lace/data` and matching MinIO/configuration, then run the
generated `pnpm db:migrate` and `pnpm content:sync` commands as required.
For Cloudflare, retain coordinated D1 export/Time Travel and R2/config backups;
use explicit `cloudflare-remote` migration/sync and operator environment selection
from the [Cloudflare guide](../packages/create-lace/templates/docs/lace-cloudflare.md).
Local D1/R2 checks do not prove remote restore.

## Draft-media detachment and rollback

`DELETE /api/v1/admin/media/:id?detach=drafts` requires both `media:write` and
`content:write`. It refuses published usage, inactive media and more than 50
using entries before any draft changes. It removes matching nested media values
and SEO images through ordinary revision-guarded draft saves, then requests
deletion through the existing usage guard. Drafts can become incomplete and
must be repaired before publication. No public content or build changes occur.

Each draft save is atomic; the overall request is not. If a later save conflicts,
earlier detachment remains saved, later drafts remain unchanged and media stays
active. Refresh usage and retry. A reference created concurrently can still
block the final deletion. Object cleanup remains asynchronously recoverable.

Rollback requires coordinated compatible engine/site/builder versions and
matching configuration/data. Template filesystem rollback does not restore
detached draft values, deleted object bytes or database/content migrations.
Restore matching backups when necessary, first at an isolated origin with
replacement secrets and production hooks disabled. Automatic database downgrade
is not supported. Earlier composite/envelope/rich-text rollback restrictions
remain in force.

## Candidate evidence

Fresh source checks, immutable artifact preparation and exact-artifact acceptance
are pending. Results will be recorded in the
[change readiness record](../openspec/changes/prepare-alpha-six-release/readiness.md).
Alpha.5 receipts remain historical; alpha.4 owner deployment confirmations do
not certify alpha.6. Authenticated publishing rights and affected real
VPS/Cloudflare upgrade/restore/recovery checks remain separate owner prerequisites.
