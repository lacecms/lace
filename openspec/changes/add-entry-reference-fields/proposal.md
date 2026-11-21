## Why

A service page needs to select three reviews in editorial order, and a post
needs an author whose biography or photo can change in one place. Existing
URL fields require a routed destination and expose a path. This pre-1.0
priority adds reusable content to the single-entry preview and publication workflow.

## What Changes

- Add `field.reference({ models })` for one entry ID and compose it with
  `field.list` for ordered selections. Pages, collections and globals can own
  references, including in group/list values and block data. Targets can be
  pages and routed or route-less collection entries.
- Offer model-filtered search, draft/publication status, ordered multi-selection,
  and direct “Where used” navigation to the editable field or block.
- Keep saved-draft and published dependencies acyclic independently. Editors
  can stage a reversal in drafts and receive actionable publication-order guidance.
- Block deleting or unpublishing a target with a delivered published dependency.
  Deleting a target used only by drafts requires reviewed confirmation and
  leaves a repairable missing selection. Keep ordinary URL link review separate.
- Resolve IDs one hop at a time from the complete export in Astro routes and
  blocks. A preview overlays one saved routed draft on frozen published
  context. A selected new review must be published before previewing its page.
- Extend schema evolution and import so every supported writer observes the
  same rules, including changes of order, configuration migrations and retries.

Rich-text links, transitive “Where used”, runtime dependency tracking of Astro
templates, inverse authored fields, recursive expansion, bulk publication,
automatic source rewriting and previews of multiple drafts are outside REL1.

## Capabilities

### New Capabilities

- `entry-reference-fields` — typed entry identity, constrained targets, separate acyclic graphs, guarded writes, direct impact and removal policy.

### Modified Capabilities

- `field-descriptors` — scalar reference builder, portable schema and field capabilities.
- `schema-evolution` — model allowlists, graph-safe rewrites and route-removal evidence.
- `internal-url-links` — scope URL-only eligibility and impact acknowledgment alongside data dependencies.
- `content-use-cases` — guard lifecycle commands, including revert into the current draft graph.
- `rest-contracts` — bounded reference lookups, direct impact, confirmations and actionable conflicts.
- `admin-draft-editor-fields` — single/ordered selection, exact usage navigation and lifecycle feedback.
- `published-site-loader` — shared one-hop lookup of routed entries and route-less records.
- `draft-preview` — publication-ready relations in the single-draft frozen view.
- `content-import-cli` — descriptor-aware entry keys and cycle-safe draft and publication ordering.

## Impact

Roadmap **REL1** is one product unit following PV1, explicitly requested as
one proposal with six implementation sessions. REL1A covers configuration,
REL1B persistence and graph integrity, REL1C lifecycle and admin API, REL1D
site delivery and preview, REL1E editor workflows, and REL1F import and
end-to-end acceptance. Each has a verification checkpoint. Shipping any
writer before the removal, projection and cycle guards are integrated would
expose an incomplete integrity contract. EX5, EX7 and RC5 preparation proceed
independently. See the [active roadmap](../../../docs/extensibility-roadmap.md).

Architecture §§8–10, 12–13, 16–17 and 22/25 govern this change. It builds on
accepted `conditional-fields`, `content-repository-contracts`,
`d1-content-repositories`, `render-core`, `astro-draft-preview` and
`publication-visibility`. A forward database migration and matching
engine/admin/SDK packages are needed to adopt the field. Existing sites can
upgrade without changing their models. Implementation spans content/config,
contracts, application/shared DB plans, SQLite/D1, server, SDK/render/Astro,
admin and CLI. No additional external service is required.
