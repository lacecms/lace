# Internal documentation index

The [architecture](architecture/README.md) owns product scope and invariants;
[accepted specifications](../openspec/specs/) own detailed capability behavior.
`authoritative` identifies a governing document within that authority order;
`internal note` provides engineering guidance; `historical` preserves decisions
and completed delivery order. Public guides live in `apps/docs`; this directory
is not published. See [documentation maintenance](documentation-maintenance.md)
for the public/internal topic map and [ADR index](adr/README.md) for decision status.

## Consolidated verification and history

[Verification](verification.md) replaces the former scope traceability,
real-application owner plan, local operations/security notes and internal-link
measurement note. It owns commands, limits, coverage, retained D1 measurements
and dated owner status; individual run results belong to private/local result
directories, and release readiness stays in archived release changes.

Obsolete step reports and JSON inventories were deleted rather than moved.
The last recorded commit containing the step verification directories is
`fde9c5fd` (`git show fde9c5fd:docs/archive/step-34/step-34c-verification.md`).
Git history, [archived changes](../openspec/changes/archive/), archived roadmaps
and ADRs preserve history. The tables below index maintained Markdown files;
the two indexes describe themselves and are excluded from the row count.

## docs/

| File | Status | Details |
| --- | --- | --- |
| [alpha-release.md](alpha-release.md) | internal note | §22/§25; artifact preparation, verification and owner publication |
| [auth-operations.md](auth-operations.md) | internal note | §14/§21; authentication, account security and email operations |
| [cloudflare-deployment-handoff.md](cloudflare-deployment-handoff.md) | internal note | §5/§18/§21; real-account deployment and owner checks |
| [cloudflare-worker.md](cloudflare-worker.md) | internal note | §5/§16/§18; Worker bindings, local development and limits |
| [collection-queries.md](collection-queries.md) | internal note | §8/§12/§16; configured admin list queries and runtime limits |
| [compatibility.md](compatibility.md) | internal note | §7/§22; release, template, contract and rollback compatibility |
| [composite-fields.md](composite-fields.md) | internal note | §8/§11/§17; bounded group/list modeling and authoring |
| [configuration-synchronization.md](configuration-synchronization.md) | internal note | §8/§16/§22; classified schema synchronization |
| [content-import.md](content-import.md) | internal note | §7/§12/§14; import package, credentials and CLI behavior |
| [database-migrations.md](database-migrations.md) | internal note | §16/§21/§22; migration procedure and portability |
| [documentation-maintenance.md](documentation-maintenance.md) | internal note | §6/§19/§20; public-documentation ownership and publication |
| [field-guidance.md](field-guidance.md) | internal note | §8/§17; field labels, placeholders and validation guidance |
| [form-organization.md](form-organization.md) | internal note | §8/§17; layout metadata and editor organization |
| [internal-url-links.md](internal-url-links.md) | internal note | §8/§9.6/§13; stable link identities, guards and rendering |
| [mcp.md](mcp.md) | internal note | §3/§12/§14; OAuth setup, consent, tool authority and revocation |
| [media-tags.md](media-tags.md) | internal note | §9.7/§12/§16; administrative media organization |
| [node-api.md](node-api.md) | internal note | §5/§12/§18; Node API composition and local operations |
| [personal-site-guide.md](personal-site-guide.md) | internal note | §7/§13; independent Astro application and source ownership |
| [refactoring-roadmap.md](refactoring-roadmap.md) | authoritative | Active RF1–RF8 delivery order, session boundaries and owner decisions |
| [rich-text-authoring.md](rich-text-authoring.md) | internal note | §11/§13/§17; rich-text grammar, rendering and editor tools |
| [site-styling.md](site-styling.md) | internal note | §7/§13; installed source, styling hooks and video behavior |
| [verification.md](verification.md) | internal note | §3/§14/§20/§21; commands, limits, coverage, D1 budgets and owner checks |

## docs/architecture/

| File | Status | Details |
| --- | --- | --- |
| [README.md](architecture/README.md) | authoritative | §1–§4/§24/§26; product scope, principles, authority order and section map |
| [deployment.md](architecture/deployment.md) | authoritative | §5/§18/§21; system context, development modes and operations |
| [workspace.md](architecture/workspace.md) | authoritative | §6/§19/§20; repository structure, source layout, dependencies and testing |
| [distribution.md](architecture/distribution.md) | authoritative | §7/§22/§25; generated project, compatibility and release defaults |
| [content-configuration.md](architecture/content-configuration.md) | authoritative | §8; content models, fields, blocks and configuration projection |
| [data-model.md](architecture/data-model.md) | authoritative | §9; tables, snapshots, blocks, media, outbox and table diagram |
| [publication.md](architecture/publication.md) | authoritative | §10; publication and unpublication |
| [rendering.md](architecture/rendering.md) | authoritative | §11/§13; block registry, rich text, SDK, render core and Astro adapter |
| [api.md](architecture/api.md) | authoritative | §12; REST resources and contract rules |
| [security.md](architecture/security.md) | authoritative | §14; authentication and authorization |
| [runtimes.md](architecture/runtimes.md) | authoritative | §15/§16; ports, adapters, composition, D1 constraints and runtime deltas |
| [admin.md](architecture/admin.md) | authoritative | §17; admin application |
| [history.md](architecture/history.md) | historical | §23; change-code map and release history |

## docs/adr/

| File | Status | Details |
| --- | --- | --- |
| [0001-package-dependency-boundaries.md](adr/0001-package-dependency-boundaries.md) | authoritative | ADR 0001: Preserve package dependency boundaries |
| [0002-d1-batches-and-node-transactions.md](adr/0002-d1-batches-and-node-transactions.md) | authoritative | ADR 0002: Use guarded D1 batches and interactive Node transactions |
| [0003-media-reference-projection-and-deletion.md](adr/0003-media-reference-projection-and-deletion.md) | authoritative | ADR 0003: Project media references and delete objects asynchronously |
| [0004-fixed-command-vps-builder.md](adr/0004-fixed-command-vps-builder.md) | authoritative | ADR 0004: Use a private fixed-command VPS builder |
| [0005-admin-owned-component-source.md](adr/0005-admin-owned-component-source.md) | authoritative | ADR 0005: Generate admin components as Lace-owned source |
| [0006-shared-rendering-core-and-installed-block-source.md](adr/0006-shared-rendering-core-and-installed-block-source.md) | authoritative | ADR 0006: Share rendering logic as packages and install block markup as source |
| [0007-schema-evolution-during-sync.md](adr/0007-schema-evolution-during-sync.md) | authoritative | ADR 0007: Evolve populated content models during configuration sync |
| [0008-entry-lifecycle-commands.md](adr/0008-entry-lifecycle-commands.md) | authoritative | ADR 0008: Entry lifecycle commands |
| [0009-media-metadata.md](adr/0009-media-metadata.md) | authoritative | ADR 0009: Media metadata |
| [0010-global-models.md](adr/0010-global-models.md) | authoritative | ADR 0010: Global models |
| [0011-seo-system-group.md](adr/0011-seo-system-group.md) | authoritative | ADR 0011: SEO system group |
| [0012-block-envelope.md](adr/0012-block-envelope.md) | authoritative | ADR 0012: Block envelope |
| [0013-bounded-composite-fields.md](adr/0013-bounded-composite-fields.md) | authoritative | ADR 0013: Bounded composite fields |
| [0014-expanded-rich-text-format.md](adr/0014-expanded-rich-text-format.md) | authoritative | ADR 0014: Expanded shared rich-text format |
| [0015-mcp-publication-scope.md](adr/0015-mcp-publication-scope.md) | authoritative | ADR 0015: MCP publication scope |
| [0016-import-credentials.md](adr/0016-import-credentials.md) | authoritative | ADR 0016: Import credentials |
| [0017-content-import-client.md](adr/0017-content-import-client.md) | authoritative | ADR 0017: Content import client |
| [0018-conditional-fields.md](adr/0018-conditional-fields.md) | authoritative | ADR 0018: Conditional fields |
| [0019-error-model.md](adr/0019-error-model.md) | authoritative | ADR 0019: One portable error model and classifier |
| [0020-source-layout.md](adr/0020-source-layout.md) | authoritative | ADR 0020: Domain source layout and shrinking size baseline |
| [0021-single-site-static-architecture.md](adr/0021-single-site-static-architecture.md) | authoritative | ADR 0021: Single-site installation with a static Astro site |
| [0022-hono-rest-valibot-schemas.md](adr/0022-hono-rest-valibot-schemas.md) | authoritative | ADR 0022: Hono REST API with Valibot schemas |
| [0023-admin-spa-stack.md](adr/0023-admin-spa-stack.md) | authoritative | ADR 0023: Admin single-page application stack |
| [0024-sqlite-dialect-capability-adapters.md](adr/0024-sqlite-dialect-capability-adapters.md) | authoritative | ADR 0024: One SQLite dialect with capability adapters |
| [0025-better-auth-role-permissions.md](adr/0025-better-auth-role-permissions.md) | authoritative | ADR 0025: Better Auth with role-mapped permissions |
| [0026-code-defined-models-two-snapshots.md](adr/0026-code-defined-models-two-snapshots.md) | authoritative | ADR 0026: Code-defined models with draft and published snapshots |
| [0027-outbox-triggered-rebuild.md](adr/0027-outbox-triggered-rebuild.md) | authoritative | ADR 0027: Publication through an outbox-triggered rebuild |
| [0028-spec-driven-delivery-toolchain.md](adr/0028-spec-driven-delivery-toolchain.md) | authoritative | ADR 0028: Spec-driven delivery and workspace toolchain |
| [0029-rc1-baseline.md](adr/0029-rc1-baseline.md) | authoritative | ADR 0029: rc1 is the oldest supported state |
| [0030-rc2-oldest-supported.md](adr/0030-rc2-oldest-supported.md) | authoritative | ADR 0030: rc2 is the oldest supported release |
| [0031-route-less-collections.md](adr/0031-route-less-collections.md) | authoritative | ADR 0031: Route-less collections |

## docs/archive/

| File | Status | Details |
| --- | --- | --- |
| [content-editor-roadmap.md](archive/content-editor-roadmap.md) | historical | §8/§17; completed CE content/editor delivery order |
| [mvp-implementation-roadmap-summary.md](archive/mvp-implementation-roadmap-summary.md) | historical | §23; completed MVP roadmap summary |
| [mvp-implementation-roadmap.md](archive/mvp-implementation-roadmap.md) | historical | §23; completed MVP delivery order and sessions |
| [site-migration-roadmap.md](archive/site-migration-roadmap.md) | historical | §7/§13; completed SM site-migration delivery order |
