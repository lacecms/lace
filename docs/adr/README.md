# Architectural decision index

These records govern decisions within the [architecture](../architecture/README.md)
and [accepted specifications](../../openspec/specs/). See the
[internal index](../README.md) for document ownership. Status follows each
record: ADR 0029 is amended by ADR 0030; every other decision remains accepted.
An `amended` or `superseded` decision must identify its amendment or successor.

| Number | Title | Status | Superseding ADR |
| --- | --- | --- | --- |
| 0001 | [Preserve package dependency boundaries](0001-package-dependency-boundaries.md) | accepted | — |
| 0002 | [Use guarded D1 batches and interactive Node transactions](0002-d1-batches-and-node-transactions.md) | accepted | — |
| 0003 | [Project media references and delete objects asynchronously](0003-media-reference-projection-and-deletion.md) | accepted | — |
| 0004 | [Use a private fixed-command VPS builder](0004-fixed-command-vps-builder.md) | accepted | — |
| 0005 | [Generate admin components as Lace-owned source](0005-admin-owned-component-source.md) | accepted | — |
| 0006 | [Share rendering logic as packages and install block markup as source](0006-shared-rendering-core-and-installed-block-source.md) | accepted | — |
| 0007 | [Evolve populated content models during configuration sync](0007-schema-evolution-during-sync.md) | accepted | — |
| 0008 | [Entry lifecycle commands](0008-entry-lifecycle-commands.md) | accepted | — |
| 0009 | [Media metadata](0009-media-metadata.md) | accepted | — |
| 0010 | [Global models](0010-global-models.md) | accepted | — |
| 0011 | [SEO system group](0011-seo-system-group.md) | accepted | — |
| 0012 | [Block envelope](0012-block-envelope.md) | accepted | — |
| 0013 | [Bounded composite fields](0013-bounded-composite-fields.md) | accepted | — |
| 0014 | [Expanded shared rich-text format](0014-expanded-rich-text-format.md) | accepted | — |
| 0015 | [MCP publication scope](0015-mcp-publication-scope.md) | accepted | — |
| 0016 | [Import credentials](0016-import-credentials.md) | accepted | — |
| 0017 | [Content import client](0017-content-import-client.md) | accepted | — |
| 0018 | [Conditional fields](0018-conditional-fields.md) | accepted | — |
| 0019 | [One portable error model and classifier](0019-error-model.md) | accepted | — |
| 0020 | [Domain source layout and shrinking size baseline](0020-source-layout.md) | accepted | — |
| 0021 | [Single-site installation with a static Astro site](0021-single-site-static-architecture.md) | accepted | — |
| 0022 | [Hono REST API with Valibot schemas](0022-hono-rest-valibot-schemas.md) | accepted | — |
| 0023 | [Admin single-page application stack](0023-admin-spa-stack.md) | accepted | — |
| 0024 | [One SQLite dialect with capability adapters](0024-sqlite-dialect-capability-adapters.md) | accepted | — |
| 0025 | [Better Auth with role-mapped permissions](0025-better-auth-role-permissions.md) | accepted | — |
| 0026 | [Code-defined models with draft and published snapshots](0026-code-defined-models-two-snapshots.md) | accepted | — |
| 0027 | [Publication through an outbox-triggered rebuild](0027-outbox-triggered-rebuild.md) | accepted | — |
| 0028 | [Spec-driven delivery and workspace toolchain](0028-spec-driven-delivery-toolchain.md) | accepted | — |
| 0029 | [rc1 is the oldest supported state](0029-rc1-baseline.md) | amended | [0030](0030-rc2-oldest-supported.md) |
| 0030 | [rc2 is the oldest supported release](0030-rc2-oldest-supported.md) | accepted | — |
| 0031 | [Route-less collections](0031-route-less-collections.md) | accepted | — |
