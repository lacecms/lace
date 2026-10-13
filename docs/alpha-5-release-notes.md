# Alpha.5 release preparation and upgrade notes

Selected candidate: `0.1.0-alpha.5`, npm channel `next`, ownership template
`0.29.0`. Preparation is in progress. Publication, exact-artifact acceptance
and real deployment results are recorded separately; this document does not
announce availability. See [release preparation](./alpha-release.md) and
[owner verification](./real-application-verification.md).

## Changes since alpha.4

- CE1: explicit schema evolution, field rename/removal hints and block migrations.
- CE2: unpublish, revert, duplicate and delete entry actions.
- CE3: descriptive media metadata and resolved media in public delivery.
- CE5: route-less global singletons and site-wide settings.
- CE4: entry SEO, site defaults, canonical/social metadata and indexing controls.
- CE6: block anchors, classes, hidden blocks and declared settings.
- CE7: nested group/list fields, composite editor controls, Gallery and Navigation blocks.
- CE8: expanded rich-text format and editing tools.
- CE9: field descriptions/defaults/validation, organized section/tab forms and collection slug suggestions.

The release includes the completed content-editor waves. Future work remains in
[backlog.md](../backlog.md).

## Public-contract and site changes

Upgrade the engine, admin, SDK, Astro/render integration and generator together.
All fourteen `@lacecms/*` packages and `create-lace` use `0.1.0-alpha.5`; both
runtime images use the matching tag. These coordinates become downloadable only
after explicit publication. Keep user-owned site components and configuration
under review; managed template upgrade does not migrate them automatically.

CE3 changes public entry reads to include the entry and its resolved `media`
dictionary, collection reads to include items/media/cursor, and build export to
include resolved media. SDK consumers must use the matching response types and
pass the resolved media to image/render helpers. Media IDs remain the stored
references; nested composite media references use the same resolution rules.

CE6 extends published block envelopes with anchor, class name and settings.
Hidden blocks are omitted from public delivery and build export. Custom block
components must forward declared envelope props when needed; the Astro adapter
passes them without adding a wrapper. An old engine can expose hidden content
or discard saved envelope values, so reverting only binaries after adoption is
unsafe. Group/list fields and the expanded rich-text union also require review
of exhaustive TypeScript consumers and custom renderers. Use the matching SDK
and render validators rather than assuming older payload shapes.

## Upgrade and migration order

1. Record the installed package/template/image and configuration versions.
   Stop writes and dispatch; capture a coordinated backup of database, object
   bytes and configuration. Retain the existing served site and its source.
2. Generate a target template with the same site mode/path and Cloudflare
   selection. Review the CLI upgrade plan and managed-file conflicts before
   applying it. `.env`, configuration, README, Worker operator settings and
   Astro source remain user-owned; update their coordinates explicitly.
3. Install the matching Lace dependencies and set the alpha.5 API/builder
   images. Review user-owned image definitions for media metadata and bump
   applicable block/model versions with explicit migrations when needed.
4. Apply forward database migrations in journal order, then synchronize the
   configuration explicitly. Do not hand-apply isolated SQL files or bypass
   schema compatibility checks. Upgrade does not execute these deployment steps.
5. Start/deploy the matching engine/admin and builder, build the site with the
   matching SDK, and check content, resolved media, globals, SEO, hidden blocks,
   composites, rich text and form behavior before resuming normal operation.

For Node/Compose, stop `api` and `dispatcher`, copy the whole stopped
`.lace/data` directory, preserve the matching MinIO objects/configuration,
run `pnpm db:migrate` then `pnpm content:sync`, and restart using the generated
[Compose production guide](../packages/create-lace/templates/docs/lace-compose-production.md).
Keep database consumers stopped throughout host maintenance.

For Cloudflare, capture D1 export/Time Travel evidence and coordinated R2/config
backups. Run `pnpm exec lace cloudflare preflight`,
`pnpm exec lace db migrate --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`
and `pnpm exec lace content sync --target cloudflare-remote --operator-env .lace/cloudflare-operator.env`,
then deploy the rebuilt Worker and verify its packaged admin. Follow the generated
[Cloudflare guide](../packages/create-lace/templates/docs/lace-cloudflare.md).
Local D1/R2 simulation is not a remote restore check.

## Database and rollback boundaries

The release preparation itself adds no DDL. Depending on the installed baseline,
apply all pending migrations, including earlier account-token migration 0004:

| Migration | Change | Rollback boundary |
| --- | --- | --- |
| 0005_content_model_structure | Add model structure baselines | Additive columns; existing data unchanged |
| 0006_media_descriptive_metadata | Add alt/caption/focal point | Additive columns; existing data unchanged |
| 0007_content_model_global_kind | Rebuild model kind constraint for globals | After creating globals, restore the matching backup to return to an older engine |
| 0008_content_snapshot_seo | Add nullable SEO snapshot data | Older engines leave stored SEO unused |
| 0009_content_block_envelope | Add anchor/class/hidden/settings and anchor uniqueness | After envelope adoption, restore the matching backup; older engines can expose hidden blocks and reset envelopes |

Node and D1 use their existing migration implementations for atomicity and
foreign-key handling. Content schema/block migrations run through explicit
configuration synchronization. After storing composites or expanded rich text,
a return to an older engine requires a matching backup or an explicitly reviewed
validated conversion. Filesystem upgrade rollback does not undo database/content
migration. Restore database, media and configuration together into an isolated
origin with replacement secrets and production hooks disabled before validation.

## Candidate evidence and owner handoff

Source checks, immutable artifact inventory and exact-artifact acceptance remain
pending until their results are recorded. The preparation baseline is in
[the change readiness record](../openspec/changes/prepare-alpha-five-release/readiness.md).
Historical alpha.4 owner confirmations on 2026-10-10 remain valid for that
baseline and do not certify alpha.5. Recheck affected real VPS/Cloudflare upgrade,
content/build, backup/restore and recovery scenarios against the selected
alpha.5 artifacts. Preserve private logs/digests separately; record redacted
results in [real-application verification](./real-application-verification.md).
Publication remains a separate owner action using saved verified artifacts.
