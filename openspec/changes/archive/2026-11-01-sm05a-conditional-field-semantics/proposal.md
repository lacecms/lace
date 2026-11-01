## Why

Migrated portfolio content needs fields that apply only in some cases, for
example a gallery item whose `kind` decides whether `media` or `videoUrl` is
filled. Today every declared field is always shown, always required when
marked `required`, and always delivered, so such content needs either loose
optional fields with no server guarantee or a custom block per variant. CE9
deferred general conditional forms; owner decision 6 (2026-10-31) selects them
as a complete system. This session defines the declaration and the
validation semantics that every later layer builds on.

## Roadmap unit

Session **SM5A** of step SM5 in
[`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md).
SM5B (server enforcement and delivery) and SM5C (admin forms and
documentation) are separate sessions on the same branch. No dependency on SM4.

Owner decisions (2026-11-01), settling the roadmap's open points:

1. Rules live on the field-map owner as a `visibility` map
   `{ target: { field, values } }`, mirroring block `settingsVisibility`,
   instead of a per-field `visibleWhen` option.
2. Controllers are sibling `select` or `boolean` fields; one form `values`
   replaces the roadmap's `equals`/`in` pair.
3. Chains are not allowed: a controller is never itself conditional.
4. Controllers may be optional; an absent controller without a default
   matches no rule, so its targets are hidden.
5. Hidden values stay in drafts and are omitted from published snapshots.
6. `seoDefaults` must not name a conditional field.
7. Block `settingsVisibility` keeps its presentation-only semantics.

This change refines decision 3 of the agreed preview: a hidden field is
validated with **draft** semantics (types, options, URL and rich-text safety,
lengths, ranges and `maxItems` still apply; `required`, nested requiredness
and `minItems` do not), instead of skipping lengths and ranges as well. Draft
mode already accepts incomplete values, so a hidden value is exactly a value
that could have been saved as a draft, and no third validation tier appears.

## What Changes

- **Declaration.** Models (`definePage`, `defineCollection`, `defineGlobal`),
  `field.group` (including groups used as list items at any CE7 depth) and
  block data (`defineBlock({ visibility })`) accept an optional `visibility`
  map. Each key names an immediate sibling field; each rule is exactly
  `{ field, values }`. TypeScript restricts targets and controllers to the
  owner's keys and `values` to the controller's option literals or booleans.
- **Load-time checks.** Normalization rejects unknown targets and
  controllers, self references, non-`select`/`boolean` controllers, chains,
  empty or duplicate or undeclared values and extra properties, with a
  configuration path. Scalar list items and list descriptors take no rules.
- **Evaluation.** A target is visible when its controller's effective value
  (the present value, else its declared default) is listed in `values`. A
  pure exported evaluator and a pure published-value projection are shared by
  every later layer.
- **Validation.** Draft and publish validation evaluate rules per object
  occurrence. A hidden subtree is always validated in draft mode, so it is
  never required. Visible fields keep their existing semantics. Node and
  Cloudflare share the same code.
- **Value policy.** Hidden values are retained in drafts and omitted from the
  published projection. This session defines the projection and uses it in
  configuration synchronization; SM5B applies it to publication and delivery.
- **Identity and metadata.** `visibility` is structural: it enters structure
  identity, needs a model version increase, and a block data rule change
  needs a block version increase and migration. Model, group and block
  metadata cross REST and OpenAPI as validated JSON.
- **Schema evolution.** New change kinds `field-visibility-added`,
  `field-visibility-removed` and `field-visibility-changed`. Narrowing
  visibility is `compatible` and prunes newly hidden published values in the
  guarded sync mutation, advancing the published-state version and requesting
  one build (ADR 0007). Widening is `validated` against newly visible
  published occurrences.
- **SEO.** Global `seoDefaults` must not reference a conditional field.
- **Documentation.** Architecture §8 lifts the CE9/LIST2 deferral; ADR 0018
  records the format and semantics.

## Capabilities

### New Capabilities

- `conditional-fields`: the `visibility` declaration, its load-time rules,
  evaluation, value retention and published projection.

### Modified Capabilities

- `content-validation`: hidden fields use draft semantics in both modes.
- `content-model-configuration`: model-level `visibility`, structural
  identity of rules, `seoDefaults` restriction.
- `schema-evolution`: classification and application of visibility changes,
  including published pruning and visibility-aware evidence.
- `rest-contracts`: visibility metadata crosses model, group and block
  metadata boundaries and OpenAPI.
- `block-settings-visibility`: the exclusion of model fields, block data and
  group items from conditional behavior now points to `conditional-fields`;
  settings semantics are unchanged.

## Impact

- `@lacecms/content`: `FieldVisibility` types, `normalizeFieldVisibility`,
  `isFieldVisible`, `publishedFieldValues`, group and block descriptor
  options, `normalizeFieldMap` evaluation, metadata round trip.
- `@lacecms/config`: model input and normalization, SEO reference checks,
  identity projection.
- `@lacecms/contracts`: model/group/block metadata validation and OpenAPI
  field schema; regenerated `api-v1.json`.
- `@lacecms/application`: configuration evolution diff, evidence, and pure
  published rewrite results; no repository or migration change.
- Docs: `docs/mvp-architecture.md`, ADR 0018, roadmap progress row.
- Not in this session: publication omission, public API/export/SDK types,
  MCP guidance (SM5B); admin show/hide and summaries, user docs, example
  (SM5C). Between SM5A and SM5B on the branch, publication still copies
  hidden draft values; the branch is not released in between.
- No template version change, no database migration.
