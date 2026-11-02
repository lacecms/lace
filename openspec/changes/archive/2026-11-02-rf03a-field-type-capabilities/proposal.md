## Why

The facts about each field type — whether it can be a list column, sorted,
filtered or searched, whether it carries a placeholder or SEO text, what JSON
kind its default value has — are written out separately in `config`,
`contracts` (twice), `application`, `db` and five admin modules. The audit
baseline counts five copies of the list-queryable set alone plus five admin
switches, and the copies have already drifted: generated OpenAPI omits URL
`embedProviders` and group/block `layout`, so the documented descriptor
schemas (`additionalProperties: false`) reject metadata the server really
emits. Adding a field type today means finding every copy by hand. This is
Session RF3A of [`docs/refactoring-roadmap.md`](../../../../docs/refactoring-roadmap.md),
first of Step RF3 (shared vocabulary), and it precedes the RF4 file splits so
they move one definition instead of five.

## What Changes

- **One capability table in `@lacecms/content`.** `fieldTypeCapabilities`,
  keyed by `FieldType` and total over it, declares for every field type:
  `listQueryable`, `sortableAs`, `filterKind`, `searchable`, `seoText`,
  `itemLabel`, `placeholder` and `valueKind`. `FIELD_FILTER_OPERATIONS`
  declares the operators of each filter kind. Derived types
  (`ListQueryableFieldType`, `SearchableFieldType`, `SeoTextFieldType`, …)
  replace hand-written unions. The roadmap's six columns gain `searchable`
  and `itemLabel` because search targets and list item labels are two more
  copied sets (`design.md` decision 2).
- **Copies become derivations and are deleted.** `LIST_FIELD_TYPES` and
  `SEO_TEXT_FIELD_TYPES` leave `@lacecms/config` (no consumer outside the
  package); its `ListQueryFieldKey` unions, `hasValidListFields` and the
  `listOptions` check in contracts, `CollectionQueryFieldType` and the
  per-operator type lists in `application`, the `strings` set and `datetime`
  special cases in `db/collection-list.ts`, and the item-label and
  placeholder lists inside content builders all read the table.
  **BREAKING (internal):** two `@lacecms/config` exports are removed.
- **OpenAPI descriptor schemas are derived and corrected.** `field-openapi.ts`
  builds scalar descriptor schemas from the table (placeholder, default-value
  kind, block-setting alternatives from `BLOCK_SETTING_FIELD_TYPES`) and now
  documents URL `embedProviders`, group `layout` and block `layout` /
  `settingsLayout` through a new `FormLayout` component. Owner decision
  (2026-11-02): fix the drift rather than keep `apps/api/openapi/api-v1.json`
  byte-identical; the file changes only in those descriptor schemas.
- **Parity test.** A contracts test runs a descriptor corpus generated from
  the capability table through both `normalizeFieldDefinition` and the
  OpenAPI descriptor schema and requires identical structural verdicts.
- **Admin support table.** `apps/admin/src/entities/content/field-types.ts`
  gains `fieldTypeSupport: Record<FieldType, FieldTypeSupport>` with
  `problem`, `listCell`, `filter`, `summary`, `guidance` and `draftValue`.
  `editor-form.ts`, `list-columns.ts`, `CollectionFilters.tsx`,
  `collection-query.ts`, `item-summary.ts`, `composite-values.ts` and
  `field-guidance.ts` consume it, so a new field type fails to compile until
  every admin surface declares its support.
- **Vocabulary guard.** A root test rejects field-type literal lists outside
  the two tables, so the copies cannot return.
- **Documentation.** Architecture §8 *Initial field types* gains the
  capability table; the roadmap baseline row moves.

Non-goals: conditional-visibility evaluation (RF3C), slug/limit sharing
(RF3B), error classes (RF3D); moving `BLOCK_SETTING_FIELD_TYPES` (already one
definition); field-specific option validation inside content builders
(length, range, options, providers); admin field controls and previews,
whose registries are already keyed by type; documenting model-level `layout`
in OpenAPI (model schemas are generated from Valibot, outside
`contentMetadataOpenApi`). No query, validation, storage or delivery behavior
changes; no migration; no template version bump.

Depends on RF2A (source tests in `content`, `config`, `contracts`), which is
done.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `field-descriptors`: a new requirement that field type capabilities are
  declared once in the content package, are total over the field kinds, and
  that every layer, including the admin, derives its type-specific support
  from that declaration.
- `collection-query-options`: a new requirement that sort, filter and search
  eligibility, sort families and filter operators derive from the shared
  capability table, with unchanged accepted sets.
- `rest-contracts`: a new requirement that generated OpenAPI descriptor
  schemas are derived from the same capabilities and accept exactly the
  descriptor shapes the shared normalizer accepts, including `embedProviders`
  and form layouts.

## Impact

- Architecture: §8 *Initial field types* gains the capability table and the
  rule that layers derive from it. No dependency-direction change: every
  consumer (`config`, `contracts`, `application`, `db`, admin) already
  depends on `@lacecms/content`.
- Code: `packages/content/src/index.ts` (table, operators, derived types,
  builder use); `packages/config/src/index.ts`;
  `packages/contracts/src/{index.ts,field-openapi.ts}` and a new parity test;
  `packages/application/src/collection-queries.ts`;
  `packages/db/src/collection-list.ts`; the seven admin modules above; a new
  root `tests/field-type-vocabulary.test.mjs`; packaged export lists of
  `content` and `config`.
- API documentation: `apps/api/openapi/api-v1.json` regenerated; diff limited
  to `FieldDefinition` alternatives, `GroupFieldDefinition`,
  `ListFieldDefinition`, `BlockMetadata` and the new `FormLayout`.
- Runtime behavior: none. Existing tests of config, contracts, application,
  db, admin and the repository contract suite pass unchanged.
- Dependencies: none added.
