## Why

SM5A defined conditional fields: owner-level `visibility` rules, validation
in which hidden fields are never required, drafts that keep hidden values and
a pure published projection that removes them. Publication still copies the
complete draft, so a published snapshot, the public API, the build export and
rendered blocks can carry values for fields that do not apply, and published
media and internal-link references count those stale values. The SM5A branch
is not releasable until publication and delivery honor the projection.

## Roadmap unit

Session **SM5B** of step SM5 in
[`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md),
after SM5A (archived) and before SM5C (admin forms and documentation). It
builds on [ADR 0018](../../../docs/adr/0018-conditional-fields.md) and the
`conditional-fields` capability; no new owner decision is needed.

Architecture sections: §8 conditional fields (SM5), §9.3 snapshots and
references, §10 publication and the atomic publish procedure.

## What Changes

- **Publication writes the projection.** The publish use case validates the
  draft as today (hidden fields use draft semantics), then derives the
  published fields and block data with the shared projection. The guarded
  atomic publication writes those projected values to the new published
  snapshot. The stored draft keeps hidden values. Entries whose model and
  draft blocks declare no rules keep the existing copy path unchanged.
- **References follow the projection.** Media and internal-link references of
  the published snapshot come from the projected values, so a hidden media
  item counts only as draft usage and a hidden internal link is neither
  delivered nor checked for a published target. Draft link references mark
  hidden links as not delivered, so draft warnings agree with publication.
- **Server enforcement everywhere.** REST, MCP and `lace import` publish
  through the same use case; no admin-only enforcement. The atomic
  publication guard checks published internal-link targets from the projected
  references on Node SQLite and D1.
- **Delivery.** Public entry reads, published globals, collection queries,
  the paged build export and admin/MCP reads of the published snapshot
  contain no hidden values. The render core removes hidden block data after
  publication-mode parsing, so components never receive a hidden value even
  from an older export.
- **Types.** Published value types make conditional targets optional:
  `ModelFieldValues<Fields, Visibility>`, `BlockDataValues<Fields,
  Visibility>`, group values and render `BlockDataOf` for blocks that
  declare `visibility`. Draft value types are unchanged.
- **Agent and import guidance.** OpenAPI `FieldVisibility`, MCP tool
  descriptions and the MCP and import documentation state the rules: fill a
  target only when its controller selects it; hidden values are kept in the
  draft and never published.
- **Parity.** Repository contract fixtures cover projected publication,
  references, link guards, list items and block data on Node SQLite and D1.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conditional-fields`: publication writes the projection; published
  references and link checks follow it; delivery and typed published values
  omit hidden targets.
- `content-repository-contracts`: cross-runtime fixtures for projected
  publication and its references.
- `render-core`: block parsing removes hidden block data and infers optional
  targets.
- `mcp-content-server`: tool guidance describes conditional fields.
- `rest-contracts`: OpenAPI describes published omission of hidden values.

## Impact

- `@lacecms/content`: published value types; visibility-aware `delivered`
  flag in `collectSnapshotInternalLinks`; a helper that reports whether a
  model or block set declares rules.
- `@lacecms/config`: `ModelFieldValues` visibility parameter; model input
  inference of `visibility`.
- `@lacecms/application`: publish use case derives the projection,
  published media and link references; `PublishContentEntryCommand` gains an
  optional projected payload.
- `@lacecms/db`, `@lacecms/platform-node`, `@lacecms/platform-cloudflare`:
  publication writes a supplied projection and checks link targets from
  supplied rows; shared SQL for both runtimes.
- `@lacecms/test-utils`: repository contract fixtures.
- `@lacecms/render`: parsed block data projection and types.
- `@lacecms/mcp`, `@lacecms/contracts`: tool descriptions, OpenAPI text,
  regenerated `api-v1.json`.
- Docs: architecture §8/§10, ADR 0018 status, `docs/mcp.md`,
  `docs/content-import.md`, roadmap progress row. The full authoring guide
  and shipped example stay in SM5C.
- No database migration, no template version change, no public DTO shape
  change. Snapshots published on this branch before SM5B are corrected by
  republishing; no released version produced them.
- Not in this session: admin show/hide, validation summaries and client
  publish readiness (SM5C).
