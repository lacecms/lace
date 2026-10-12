## Why

Wave 3, step CE7, session **CE7A — Composite field definitions and end-to-end data contract** establishes bounded structured data for galleries, menus and project-defined content. Today's scalar-only descriptors, metadata validators and media collectors cannot safely carry those values through saving, publication and site rendering.

## What Changes

- Add portable typed `field.group({ fields, ...options })` and `field.list({ item, minItems?, maxItems?, ...options })` builders for model fields and block data; preserve nested object, array and literal-select inference.
- Define absence, explicit empty values, draft/publication validation and recursive defaults. Enforce six containers, two consecutive groups, no direct list-of-list, 100 items per list and 500 list elements per normalized snapshot, including hidden blocks.
- Carry recursive metadata and plain JSON values through configuration, REST/OpenAPI, SDK parsing and render validation. Keep existing scalar encodings/hashes, flat blocks, scalar collection columns, SEO mappings and the CE6 settings allowlist.
- Rebuild nested media references using legacy scalar paths and JSON Pointer paths for nested locations; preserve usage, deletion guards, lifecycle copies, metadata builds and public filtering on Node and D1.
- Validate list budgets for block migration results against the resulting snapshot, including unchanged data. Add only the sync safety needed for CE7A; recursive evolution and nested rename/removal syntax remain CE7B.
- Adapt existing admin consumers to preserve and inspect composites safely pending CE7C's editing controls.
- Update architecture sections 8, 9.3–9.7, 10–13, 17, 20 and 22 before implementation and record a bounded-composites ADR. No new tables or database migration are expected.

Dependencies: archived CE1–CE6 and the owner decisions in `docs/content-editor-roadmap.md` §7. This is one end-to-end session unit; accepting the DSL without persistence/media/delivery correctness cannot be verified independently as usable structured content.

Non-goals: CE7B recursive schema evolution; CE7C nested authoring and item identity; CE7D Gallery/Navigation, navigation global, registry/starter changes; CE8/CE9; references, heterogeneous lists, nested blocks, schema recursion, new rich-text features or responsive images. No production code is edited in this proposal action.

## Capabilities

### New Capabilities

None; extend the existing capability boundaries.

### Modified Capabilities

- `field-descriptors`: typed recursive portable descriptors and bounded schema normalization.
- `content-validation`: recursive draft/publish semantics, defaults, paths and snapshot budgets.
- `content-model-configuration`: recursive projection/identity and scalar-only configuration restrictions.
- `block-registry`: composite data definitions without expanding presentational settings.
- `content-use-cases`: nested active-media checks, reference projection and lifecycle copies.
- `rest-contracts`: recursive metadata and unchanged JSON value transport with nested errors/usage paths.
- `public-sdk`: nested public values and dictionary resolution through existing reads and exports.
- `render-core`: shared recursive validation and inferred nested component data.
- `content-repository-contracts`: lifecycle, media, atomicity and bounded cross-runtime coverage.
- `schema-evolution`: safe CE7A composite introduction and whole-snapshot migration budget checks.
- `admin-draft-editor`: safe interim inspection and preservation before CE7C authoring.

## Impact

Implementation touches `packages/content`, `config`, `application`, `contracts`, `db`, both platform adapters, `test-utils`, `sdk`, `render`, server OpenAPI output and existing admin field consumers. Values remain in `fields_json`/`data_json`; paths fit the existing `content_media_references.field_path` text column. Node retains transactions; D1 retains guarded batches, ≤100 binds per statement and the existing ≤50-query maximum-save budget. No infrastructure dependencies are added.

The metadata discriminated union gains two variants, requiring exhaustive TypeScript consumers to handle them; record this source compatibility impact. Scalar-only configurations and content must retain their prior behavior and hashes. Accepted specs remain unchanged until verified delta synchronization. The architecture currently describes only scalar fields; the apply phase must explicitly update it before code, rather than treat this lower-authority roadmap as an implicit override.
