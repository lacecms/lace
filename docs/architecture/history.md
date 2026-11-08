# Architecture history

Part of the [Lace architecture](README.md): what introduced the current
behavior, and the release record. Until RF8A the architecture was one file,
`docs/mvp-architecture.md`, the path archived changes still link to.

## 23. Primary implementation sequence

The completed MVP roadmap followed this dependency order:

1. Workspace, tooling, package boundaries, and CI.
2. Config DSL and serializable content-model representation.
3. Drizzle schema, Node SQLite adapter, and migrations.
4. Domain/application use cases for models, entries, drafts, blocks, and publication.
5. Hono REST contracts and Node composition root.
6. Better Auth bootstrap and permission policy.
7. Astro SDK and reference site build.
8. Basic admin navigation, collection lists, and block editor.
9. MinIO media adapter and media UI.
10. Outbox, site-build tracking, and a Node/VPS build trigger.
11. Cloudflare D1, R2, KV, Worker, and deploy-hook adapters.
12. CLI generator, managed-file manifest, and upgrade command foundation.
13. Cross-runtime contract tests, security pass, and deployment documentation.

## Change codes

Codes formerly cited in the architecture and the changes that delivered them;
[`docs/archive/`](../archive/) keeps the full delivery order.

| Code | Archived change | Introduced |
| --- | --- | --- |
| CE1 | [`ce01a-structure-baseline-compatible-changes`](../../openspec/changes/archive/2026-10-10-ce01a-structure-baseline-compatible-changes/), [`ce01b-field-rename-removal-hints`](../../openspec/changes/archive/2026-10-10-ce01b-field-rename-removal-hints/), [`ce01c-block-migrations`](../../openspec/changes/archive/2026-10-11-ce01c-block-migrations/) | Configuration-sync structure baselines, schema-evolution classification, rename/removal hints and block migrations. |
| CE3C | [`ce03c-public-delivery-contract`](../../openspec/changes/archive/2026-10-11-ce03c-public-delivery-contract/) | Published-only public wire schema, replacing the former v1 entry representation; planned removal of the snapshot `revision` from public entries. |
| CE4B | [`ce04b-site-seo-output`](../../openspec/changes/archive/2026-10-12-ce04b-site-seo-output/) | SEO site output: `site.seo(entry)`, `resolveSeo`, `LaceSeo`, sitemap and robots. |
| CE4C | [`ce04c-admin-seo-editing`](../../openspec/changes/archive/2026-10-12-ce04c-admin-seo-editing/) | SEO card in the entry editor. |
| CE7, CE7A | [`ce07a-composite-field-data-contract`](../../openspec/changes/archive/2026-10-12-ce07a-composite-field-data-contract/) | Bounded composite fields `field.group` and `field.list`, their nesting and list budgets, and composite variants in exhaustive TypeScript consumers. |
| CE7B | [`ce07b-nested-schema-evolution`](../../openspec/changes/archive/2026-10-12-ce07b-nested-schema-evolution/) | Recursive synchronization of group children and list items. |
| CE7C | [`ce07c-generic-group-list-editing`](../../openspec/changes/archive/2026-10-12-ce07c-generic-group-list-editing/) | Recursive admin authoring of groups and lists; list `itemLabel`. |
| CE7D | [`ce07d-gallery-navigation-site-examples`](../../openspec/changes/archive/2026-10-13-ce07d-gallery-navigation-site-examples/) | Built-in `gallery` and `navigation` blocks and registry items besides `hero`, `richText`, `image`, `quote` and `cta`. |
| CE8A | [`ce08a-shared-document-format-rendering`](../../openspec/changes/archive/2026-10-13-ce08a-shared-document-format-rendering/) | Expanded shared rich-text format. |
| CE8B | [`ce08b-rich-text-authoring`](../../openspec/changes/archive/2026-10-13-ce08b-rich-text-authoring/) | Expanded format in every rich-text field with the selection bubble menu. |
| CE9A | [`ce09a-field-metadata-guidance`](../../openspec/changes/archive/2026-10-13-ce09a-field-metadata-guidance/) | Field guidance metadata (`placeholder`), required markers, constraint guidance and counters. |
| CE9B | [`ce09b-form-organization-slug-suggestions`](../../openspec/changes/archive/2026-10-14-ce09b-form-organization-slug-suggestions/) | Visual form organization (`layout`, `settingsLayout`): sections and tabs. |
| CE10 | [`ce10-internal-url-links`](../../openspec/changes/archive/2026-10-24-ce10-internal-url-links/) | Internal URL links (`entry:` destinations), the Link block and build-export format 2. |
| LIST1 | [`add-reusable-list-layouts`](../../openspec/changes/archive/2026-10-22-add-reusable-list-layouts/) | Choice-card select presentation, `listLayoutSettings()`, `.css` registry companions; Gallery adopted shared layout settings. |
| LIST2 | [`add-list-layout-control-visibility`](../../openspec/changes/archive/2026-10-22-add-list-layout-control-visibility/) | Mode-specific, reactive block-setting visibility (`settingsVisibility`). |
| CQ1 | [`add-configurable-collection-queries`](../../openspec/changes/archive/2026-10-25-add-configurable-collection-queries/) | Configurable collection queries, internal `publicProjectionHash` and query-only `listOptions` synchronization. |
| MCP1 | [`add-oauth-mcp-server`](../../openspec/changes/archive/2026-10-29-add-oauth-mcp-server/) | Optional OAuth-delegated MCP content assistance and its auth boundary. |
| MCP2 | [`add-mcp-settings-and-local-enablement`](../../openspec/changes/archive/2026-10-29-add-mcp-settings-and-local-enablement/) | Read-only MCP section in admin Settings and local enablement. |
| SM5, SM5A | [`sm05a-conditional-field-semantics`](../../openspec/changes/archive/2026-11-01-sm05a-conditional-field-semantics/) | Conditional fields (`visibility` rules). |
| SM5B | [`sm05b-conditional-field-delivery`](../../openspec/changes/archive/2026-11-01-sm05b-conditional-field-delivery/) | Published projection without hidden targets. |
| SM5C | [`sm05c-conditional-field-admin-forms`](../../openspec/changes/archive/2026-11-01-sm05c-conditional-field-admin-forms/) | Admin presentation of conditional fields. |
| SM5D | [`sm05d-gallery-video-items`](../../openspec/changes/archive/2026-11-01-sm05d-gallery-video-items/) | Gallery version 5 with image and video items. |
| Step 21 | [`step-21b-fixed-command-builder`](../../openspec/changes/archive/2026-09-27-step-21b-fixed-command-builder/), [`step-21c-vps-composition-build-ui`](../../openspec/changes/archive/2026-09-27-step-21c-vps-composition-build-ui/) | Fixed-command builder and the Builds screen reading persisted builds (earlier, the editor showed the dispatch result of the latest publish). |
| Step 30 | [`step-30a-rendering-architecture`](../../openspec/changes/archive/2026-10-04-step-30a-rendering-architecture/), [`step-30b-rendering-core`](../../openspec/changes/archive/2026-10-04-step-30b-rendering-core/), [`step-30c-astro-adapter`](../../openspec/changes/archive/2026-10-04-step-30c-astro-adapter/), [`step-30d-add-block-command`](../../openspec/changes/archive/2026-10-04-step-30d-add-block-command/), [`step-30e-optional-starter-site-modes`](../../openspec/changes/archive/2026-10-04-step-30e-optional-starter-site-modes/) | Shared rendering layers: published-site loader, `@lacecms/render`, `@lacecms/astro`, block registry and `lace add block`. |
| Step 34 | [`step-34a-cross-runtime-browser-verification`](../../openspec/changes/archive/2026-10-07-step-34a-cross-runtime-browser-verification/), [`step-34b-local-security-resilience`](../../openspec/changes/archive/2026-10-10-step-34b-local-security-resilience/), [`step-34c-local-operations-owner-handoff`](../../openspec/changes/archive/2026-10-10-step-34c-local-operations-owner-handoff/) | Local cross-runtime, security and operations verification and the owner handoff for real VPS/Cloudflare acceptance. |
| RF4 | [`rf04a-content-module-split`](../../openspec/changes/archive/2026-11-03-rf04a-content-module-split/), [`rf04x-workspace-guards`](../../openspec/changes/archive/2026-11-04-rf04x-workspace-guards/), [`rf04j-remaining-flat-packages`](../../openspec/changes/archive/2026-11-08-rf04j-remaining-flat-packages/) and the other RF4 sessions | Domain-directory source layout adopted by the flat packages, with its guards. |
| RF5B | [`rf05b-shared-content-reader`](../../openspec/changes/archive/2026-11-08-rf05b-shared-content-reader/) | `platform-node` and `platform-cloudflare` adopt the source layout; shared `SqlContentReader`. |
| RF6, RF7C | [refactoring roadmap](../refactoring-roadmap.md) | Planned sessions: admin editor structure and the `cli` source layout. |

## Release record

Experimental versions on npm channel `next` are immutable, each with its own
ownership template version: alpha.1 (`0.4.0`), alpha.2 (`0.14.0`), alpha.3
(`0.17.0`), alpha.4 (`0.20.0`, real VPS/Cloudflare application testing
owner-confirmed 2026-10-10), alpha.5 (`0.29.0`), alpha.6 (`0.30.0`), alpha.7
(`0.35.0`) and alpha.8 (`0.39.0`). The selected candidate is `0.1.0-rc1`
(template `0.46.0`, migrations through 0015, gallery schema 5); its fresh
acceptance and owner deployment checks are separate from the alpha.4 evidence.
[`release/alpha.json`](../../release/alpha.json) is the authoritative record and
[compatibility](../compatibility.md) holds per-release upgrade notes.
