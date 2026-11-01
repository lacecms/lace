## Context

CE9 deferred general conditional forms. LIST2 added a bounded,
presentation-only exception: block `settingsVisibility`
(`packages/content/src/index.ts`, `normalizeSettingsVisibility`), where hidden
settings stay validated and delivered. SM5 needs real conditional semantics
for model fields, groups, list items and block data: hidden fields are not
required and are not published.

Relevant current code:

- `@lacecms/content`: field DSL (`field.group`, `normalizeCompositeOptions`),
  metadata round trip (`toFieldMetadata`, `normalizeFieldDefinition`),
  `defineBlock`/`toBlockMetadata`, and one recursive validator
  (`normalizeFieldValue` / `normalizeFieldMap`) used by
  `validateModelFields`, `validateBlockData`, `validateFieldValue` and
  `validateEntryAggregate`. Draft mode already enforces types, options,
  lengths, ranges and `maxItems`; only `required` and `minItems` are
  publish-only.
- `@lacecms/config`: `normalizeCommonModel` (model `layout`), SEO references
  (`seoFieldReference`, `normalizeSeoDefaults`), projection and structure
  identity (`contentModelStructure`, `withoutDisplayProperties`).
- `@lacecms/contracts`: strict model/group/block metadata validation
  (`isBlockMetadata`, `contentModelSchema`, `isFieldMetadata`) and the
  hand-written OpenAPI field schema (`field-openapi.ts`).
- `@lacecms/application`: `diffContentModelStructures`/`compareField`
  (an unknown model or field property is `breaking` today),
  `transformConfigurationSyncFields` (pure prospective rewrites with media
  references, applied by repositories generically) and block migration
  validation in `configuration-migration.ts`.

Use cases (`normalizeDraftCandidate`) store the normalized candidate as the
draft for create, save and publish; the repository copies it into the
published snapshot. Changing that copy is SM5B.

## Goals / Non-Goals

**Goals:**

- One declaration format for every field-map owner, typed and checked at load.
- One pure evaluator and one pure published projection, shared by all layers.
- Validation semantics in the single recursive validator, so every boundary
  (REST, MCP, import `--validate-only`, configuration sync, render) agrees.
- Structural identity and schema-evolution classification, including pruning
  of newly hidden published values during sync.
- Metadata round trip through contracts and OpenAPI so existing clients do not
  reject configurations that use rules.

**Non-Goals:**

- Publication, public API, build export, SDK and render type changes
  (SM5B): publication keeps copying the draft, including hidden values, until
  SM5B.
- MCP tool guidance and agent-facing descriptions beyond metadata (SM5B).
- Admin show/hide, summaries and client publish readiness (SM5C). Until then
  the admin shows every field; the server is the authority.
- Changing `settingsVisibility`, chains, rules over non-sibling fields,
  operators other than set membership.
- Database migrations or template changes.

## Decisions

### D1. Owner-level `visibility` map, not per-field `visibleWhen`

```ts
field.group({
  fields: {
    kind: field.select({ options: ["image", "video"], required: true, defaultValue: "image" }),
    media: field.media({ required: true }),
    videoUrl: field.url({ required: true, embedProviders: ["vimeo", "youtube"] }),
  },
  visibility: {
    media: { field: "kind", values: ["image"] },
    videoUrl: { field: "kind", values: ["video"] },
  },
});
```

Owners: models (`CommonModelInput.visibility`), `field.group` (also list item
groups), and block data (`defineBlock({ visibility })`). Pairs with existing
names: `layout`/`settingsLayout` and `visibility`/`settingsVisibility`.

Rejected: per-field `visibleWhen: { field, equals | in }` (roadmap draft). A
field builder does not know its siblings, so TypeScript cannot check the
controller key or its option literals; shared field objects would carry rules
into other owners; every other sibling reference (`layout`, `listFields`,
`seoDefaults`, `itemLabel`) already lives on the owner. One `values` array
replaces the `equals`/`in` pair.

Rejected: reusing the name `settingsVisibility` semantics for data. Settings
rules stay presentation-only; data rules change validation and delivery. The
shared shape keeps authoring familiar while the separate key keeps semantics
explicit. Convergence is decided in SM5C.

### D2. Types

```ts
type FieldVisibilityRule<Fields, Controller extends keyof Fields> = {
  readonly field: Controller;
  readonly values: readonly ControllerValue<Fields[Controller]>[];
};
type FieldVisibility<Fields extends ModelFieldDefinitions> = Readonly<
  Partial<{ [Target in keyof Fields & string]: {
    [C in ControllerKeys<Fields>]: FieldVisibilityRule<Fields, Exclude<C, Target>>
  }[ControllerKeys<Fields>] }>
>;
```

`ControllerKeys` are keys whose descriptor is `select` or `boolean`;
`ControllerValue` is the select's option literal union or `boolean`. Runtime
normalization is authoritative; types catch common mistakes. Published value
type inference (conditional targets becoming optional in delivered types) is
SM5B, together with delivery.

### D3. One normalizer, shared by DSL, config and contracts

`normalizeFieldVisibility(value, fields, path)` in `@lacecms/content` mirrors
`normalizeSettingsVisibility`: JSON-normalize, check targets, rule keys,
controller existence/type/self, no chains (a controller may not appear as a
target key), nonempty unique `values` within options or booleans; then
`deepFreeze`. `field.group`, `normalizeFieldDefinition` (forged metadata),
`defineBlock`, `normalizeCommonModel` and contracts all call it, so errors and
accepted shapes are identical everywhere. `toFieldMetadata` and
`toBlockMetadata` emit `visibility` only when present, keeping old encodings
and hashes.

Optional controllers are allowed (unlike settings). An absent controller
without a default matches nothing, so the target is hidden: content that
never chose a kind publishes no kind-specific values.

### D4. Evaluation and validation inside `normalizeFieldMap`

`normalizeFieldMap` gains an optional `visibility` argument (the owner's
rules; groups pass `definition.visibility`). Algorithm per occurrence:

1. Unknown-key check as today.
2. Normalize unconditional fields (all fields that are not rule targets) with
   the selected mode, including defaults. Controllers are unconditional by D3,
   so their normalized values are now known.
3. For each target, `isFieldVisible(rule, output)` reads the controller's
   normalized output value (present value or materialized default; absent
   means no match).
4. Normalize visible targets with the selected mode; hidden targets with
   `"draft"` mode, recursively (the whole subtree is draft).
5. Emit keys in declaration order, as today.

Hidden targets keep defaults and normalized values in the output, because the
output is the stored draft. This is the value-retention policy at the only
place values are normalized. `validateModelFields`, `validateBlockData`,
`validateEntryAggregate` (via a new optional `EntryAggregateModel.visibility`)
and `validateFieldValue` for groups forward rules. The list budget counts
hidden lists. Issue codes and paths are unchanged.

Rejected: "type only" for hidden fields (no lengths/ranges). It would add a
third validation tier and let stored drafts violate constraints that drafts
otherwise always satisfy. Draft semantics are exactly "a value that could be
saved", which is what retention needs.

Rejected: clearing hidden values on save. It loses work when an editor
toggles a controller and contradicts the agreed policy.

### D5. Published projection

`publishedFieldValues(definitions, visibility, values)` (and a block-data
variant) recursively removes hidden targets from already normalized values,
walking visible groups and list items, without inserting or reordering.
`isFieldVisible` and the projection are exported from `@lacecms/content`.
In SM5A they are used by configuration sync (D7) and tests; SM5B wires the
projection into publication, delivery and media/link reference collection.

### D6. Identity

`visibility` is not display metadata, so `withoutDisplayProperties` and
`fieldDefinitionStructure` keep it: it enters both projection and structure
identity at model, group and block-data positions. `legacyStructureForHash`
needs no change because legacy structures cannot contain it. Unopted
configurations keep their hashes (verified by existing hash fixtures).
`settingsVisibility` remains stripped from structure.

`normalizeSeoDefaults` rejects a reference to a target of model-level
visibility. Model `seo` fallbacks, `listFields`, `listOptions` and `itemLabel`
stay allowed; an absent hidden value already behaves like an unset one there.

### D7. Schema evolution

Diff (`configuration-evolution.ts`):

- Model level: `visibility` is compared per target instead of falling into
  `model-property-changed`; group level: `compareField` excludes `visibility`
  from `FIELD_PROPERTIES` handling and a separate comparison reports
  visibility kinds at the group child's schema path.
- Rules are compared after mapping rename hints for the target path and the
  controller key (`baselineFieldAt` logic), so pure renames report nothing.
- Kinds and classes: added → `compatible`; removed → `validated`; changed →
  `compatible` when the controller is the same and values strictly narrow,
  else `validated`. All need evidence (`changeNeedsEvidence`).
- Block data rules stay inside `block-definition-changed`.

Rewrite (`transformConfigurationSyncFields`): it gains the configured
model-level rules (group rules travel inside definitions), and visibility
changes carry their baseline and configured rule (`change.visibility`, the
baseline controller expressed by its configured key). After renames, removals
and backfills, for published snapshots only:

- every value hidden under the configured rules is deleted (the published
  projection), recorded in `prunes` per schema address. Pruning all hidden
  values, not only newly hidden ones, needs no baseline structure in the
  repositories and also cleans values that publication copied before SM5B;
- an occurrence visible under `after` but hidden under `before` (both on the
  transformed values) is validated with publish semantics for validated
  visibility changes, recording a violation at the concrete path. A target
  revealed only by a controller default backfill is not refused; the next
  publication enforces it, like an added required field;
- backfills skip hidden published occurrences; constraint evidence for a
  hidden published occurrence uses draft semantics.

The rewrite runs on the existing recursive path, which is now selected when
either structure declares model-level rules as well as for composites.
Evidence counts prunes (`ModelSnapshotEvidence.prunes`) and reports them as
`affected` on visibility changes. Repositories pass `configuration.visibility`.
Media references are recomputed from the
rewritten fields by the existing `collectFieldMedia` call, so pruned media lose
their published usage. Internal-link references follow the existing rewrite
path. The existing mutation advances the published-state version and coalesces
one build request when a published snapshot changes (ADR 0007). Drafts are not
pruned.

Block migrations (`configuration-migration.ts`) validate migrated data with
the configured block rules; published block rewrites apply the block-data
projection before writing.

Rejected: classifying every visibility change as `breaking` or `migration`.
Adding a rule is the common case on populated sites and is safe; the data
decision (prune versus refuse) is made from evidence like other classes.

### D8. Contracts and OpenAPI

`isBlockMetadata` allows `visibility` and passes it to `defineBlock`;
`contentModelSchema` adds `visibility` with a check that equals its
normalization against `fields`; group metadata goes through
`normalizeFieldDefinition`. `field-openapi.ts` adds a shared
`FieldVisibility` schema referenced by group field metadata, block metadata
and content models; `api-v1.json` is regenerated. Content DTOs do not change.

## Risks / Trade-offs

- [Branch-only inconsistency between SM5A and SM5B: publication still copies
  hidden values while sync prunes them] → Not released; SM5B lands on the same
  branch before any release. Documented in the roadmap log.
- [Admin may flag hidden required fields before SM5C] → Server accepts the
  publish; admin client readiness changes in SM5C.
- [Removing a rule from a required field can be refused when published items
  lack values] → Same remedy as making a field required today: make it
  optional first, republish, then tighten. The diagnostic names snapshots.
- [Type complexity of `FieldVisibility`] → Runtime normalization is
  authoritative; type tests cover keys, controller kinds and literals.
- [Revert after SM5B restores published values without hidden ones] →
  Accepted and stated in the spec; retention is guaranteed for saves and
  duplication.

## Migration Plan

No database or template migration. Configurations without `visibility` keep
their hashes and behavior. Adding rules to a populated model needs a model
version increase (and a block version plus identity migration for block data);
sync then prunes newly hidden published values and requests one build.
Rollback: remove the rules and increase the version; values hidden in drafts
are still there, published values come back on the next publication.

## Open Questions

None. Convergence of `settingsVisibility` with `visibility` is SM5C scope.
