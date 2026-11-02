## Context

See `proposal.md` (Why) for the motivation. Current copies of field type
facts, observed on commit `478e4a03`:

| Fact | Copies |
| --- | --- |
| List-queryable kinds | `config` `LIST_FIELD_TYPES` and two `ListQueryFieldKey` unions; `contracts` `hasValidListFields` and the `listOptions` check; `application` `CollectionQueryFieldType` |
| Search / SEO text kinds | `config` `SEO_TEXT_FIELD_TYPES` (used for both) and the `searchableFields` union; `contracts` `listOptions` check |
| Filter operators per kind | `application` `resolveCollectionQuery` branches; admin `CollectionFilters` `operations()`; admin `collectionFilterProblem` |
| String sort family, datetime instants | `db/collection-list.ts` `strings` set and `field.type === "datetime"` branches |
| Item label kinds | `content` `itemLabel` normalization; `field-openapi.ts` description; admin `item-summary.ts` and `block-presentation.ts` priorities |
| Placeholder kinds | `content` builders' allowed-option lists; `field-openapi.ts` |
| Default value JSON kind | `field-openapi.ts` nested ternary |
| Scalar kinds and block setting kinds in OpenAPI | `field-openapi.ts` `scalarTypes` and `["text","number","boolean","select"]` |
| Admin per-type behavior | `editor-form.ts` `fieldProblem` switch, `list-columns.ts` `formatListValue`, `CollectionFilters.tsx`, `collection-query.ts`, `item-summary.ts`, `composite-values.ts` `draftItemValue`, `field-guidance.ts` |

Every consumer already depends on `@lacecms/content` (`config`,
`contracts`, `application`, `db`, admin), so no dependency edge is added.
Generated OpenAPI (`apps/api/scripts/generate-openapi.mjs`) sorts object keys
recursively, so only array order (`oneOf`, `required`, enums) is
order-sensitive in `api-v1.json`. The generated file currently lacks URL
`embedProviders`, group `layout` and `BlockMetadata` `layout` /
`settingsLayout`; the owner chose to fix that drift in this session.

## Goals / Non-Goals

**Goals:**

- One frozen declaration per fact, in `packages/content`; every other site
  reads it or a type derived from it.
- Totality enforced by the type checker in `content` and in the admin.
- OpenAPI descriptor schemas derived from the same declaration and proven
  equivalent to the normalizer on a generated corpus.
- No runtime behavior change: identical accepted sets, messages, SQL,
  cursors and pages on Node and D1.

**Non-Goals:**

- Moving per-type option validation (lengths, ranges, options, providers)
  out of the content builders, or making the builders data-driven.
- Admin controls and previews (`builtInRenderers`, preview registries),
  which are already keyed by type.
- CLI block scaffolding (`packages/cli/src/blocks-map.ts`), whose `default`
  branch already covers unknown kinds.
- `packages/content/src/index.ts` structure; RF4A splits it.

## Decisions

### 1. Table shape: a discriminated, frozen record keyed by `FieldType`

```ts
type FieldSortFamily = "string" | "number" | "boolean" | "date" | "datetime";
type FieldFilterKind = "text" | "select" | "number" | "boolean" | "date" | "datetime";
type FieldValueKind = "string" | "number" | "boolean" | "object" | "array";

interface FieldTypeCapabilityBase {
  readonly searchable: boolean;
  readonly seoText: boolean;
  readonly itemLabel: boolean;
  readonly placeholder: boolean;
  readonly valueKind: FieldValueKind;
}
type FieldTypeCapability = FieldTypeCapabilityBase &
  (
    | { readonly listQueryable: true; readonly sortableAs: FieldSortFamily; readonly filterKind: FieldFilterKind }
    | { readonly listQueryable: false; readonly sortableAs?: never; readonly filterKind?: never }
  );

export const fieldTypeCapabilities = deepFreeze({
  text: { listQueryable: true, sortableAs: "string", filterKind: "text", searchable: true, … },
  …
} as const satisfies { readonly [Type in FieldType]: FieldTypeCapability });

export const FIELD_FILTER_OPERATIONS = deepFreeze({
  text: ["contains", "eq"], select: ["in"], number: ["eq", "range"],
  boolean: ["eq"], date: ["range"], datetime: ["range"],
} as const satisfies Record<FieldFilterKind, readonly string[]>);
```

`as const satisfies` keeps literal values, so derived types are exact:

```ts
type TypesWhere<Key, Value> = { [T in FieldType]: (typeof fieldTypeCapabilities)[T][Key] extends Value ? T : never }[FieldType];
export type ListQueryableFieldType = TypesWhere<"listQueryable", true>;
export type SearchableFieldType   = TypesWhere<"searchable", true>;
export type SeoTextFieldType      = TypesWhere<"seoText", true>;
export type ItemLabelFieldType    = TypesWhere<"itemLabel", true>;
export type PlaceholderFieldType  = TypesWhere<"placeholder", true>;
export function fieldTypesWith(capability): readonly FieldType[]  // declaration order
```

Declaration order is `text, textarea, richText, number, boolean, date,
datetime, select, url, media, group, list`, the current OpenAPI `oneOf`
order, so the derived scalar list reproduces the existing alternatives order.
`isSet`/`isNotSet` stay outside `FIELD_FILTER_OPERATIONS` as the universal
operators (spec), appended by consumers that list operators.

The discriminated entry type rejects `sortableAs` on a non-queryable kind at
compile time; a unit test checks the same at runtime on the frozen value.

Alternative rejected: separate `Set`s per capability (`LIST_FIELD_TYPES`
moved to content). Sets are not total, so a new kind silently defaults to
"unsupported" everywhere — the failure mode this session removes.

### 2. Two capabilities beyond the roadmap: `searchable` and `itemLabel`

Search targets and SEO text sources are both `text | textarea` today, and
`config` reuses `SEO_TEXT_FIELD_TYPES` for search. They are different rules
(search is SQL `LIKE` over a stored string; SEO text is a title/description
source), so they get separate columns; collapsing them would couple a future
change of one to the other. `itemLabel` (`text, textarea, select, url`) is
copied in content normalization, the OpenAPI description and the admin
summary priority. The roadmap's six columns are therefore eight; the roadmap
text is updated when this change is archived.

### 3. Consumers

| Package | Before | After |
| --- | --- | --- |
| `config` | `LIST_FIELD_TYPES`, `SEO_TEXT_FIELD_TYPES`, literal unions in `CollectionListOptions` | Both constants deleted (no consumer outside the package; packaged export list updated); `normalizeListFields`, `normalizeListOptions` and SEO source checks read the table; `ListQueryFieldKey<Fields, ListQueryableFieldType>` and `<…, SearchableFieldType>`. Messages unchanged. |
| `contracts` | Literal arrays in `hasValidListFields` and the `listOptions` check; `field-openapi.ts` lists | Table reads; decision 4 for OpenAPI. |
| `application` | `CollectionQueryFieldType` union; per-operator `includes` branches | `CollectionQueryFieldType = ListQueryableFieldType` (kept as an alias so the exported name stays); the operator gate checks `FIELD_FILTER_OPERATIONS[filterKind]` first and value validation switches on `filterKind`. Pointers (`/op`, `/value`, …) unchanged. |
| `db` | `strings` set, `datetime` branches | `sortableAs === "string"` / `"datetime"` through one local helper `sortFamily(field)`. SQL text byte-identical. |
| `content` | `itemLabel` literal list; placeholder in allowed-option lists | `fieldTypeCapabilities[child.type].itemLabel`; placeholder option added when `fieldTypeCapabilities[type].placeholder`. |

The application's validation branch order changes from "operator then type
list" to "kind's operator set then operand check". To keep the failing
pointer identical, an operator outside the kind's set still fails at
`/filters/<i>/op`, and operand failures still fail at the operand member;
existing tests pin both.

### 4. OpenAPI derivation and the drift fix

`field-openapi.ts` keeps hand-written JSON Schema for structure that is not a
per-type fact, and derives the per-type parts:

- scalar kinds: `fieldTypesWith` non-composite kinds in declaration order;
- `placeholder` property: `capabilities.placeholder`;
- `defaultValue.type`: `capabilities.valueKind`;
- type-specific options (`minLength/maxLength`, `min/max`, `options` +
  `presentation`, `embedProviders`) from a `Partial<Record<FieldType, …>>`
  of extras in `field-openapi.ts`; a kind without special options needs no
  entry, so a new kind does not break compilation in contracts;
- block setting alternatives: declaration order filtered by
  `BLOCK_SETTING_FIELD_TYPES`, which yields the current
  `text, number, boolean, select` order.

New schema content: `embedProviders` on the URL alternative
(`{type: "array", minItems: 1, uniqueItems: true, items: {enum: ["youtube", "vimeo"]}}`),
a `FormLayout` component, and `layout` on `GroupFieldDefinition`,
`layout` + `settingsLayout` on `BlockMetadata`. Only these schemas change in
`api-v1.json`; a test-side diff check (task 4.4) confirms the rest is
identical.

Alternative rejected: keep `api-v1.json` byte-identical and give the parity
test a known-gap list. The owner chose the fix; a gap list would also keep
OpenAPI clients rejecting real responses.

### 5. Parity test without a new dependency

`packages/contracts/src/field-openapi.test.ts` contains a minimal JSON Schema
evaluator for the keywords `contentMetadataOpenApi` uses (`type`, `const`,
`enum`, `required`, `properties`, `additionalProperties`, `propertyNames`,
`pattern`, `items`, `minItems`, `maxItems`, `uniqueItems`, `minimum`,
`maximum`, `minLength`, `oneOf`, `$ref`). It throws on any other keyword, so
a schema that starts using one cannot silently pass. The corpus is generated
from the capability table: per kind, a maximal valid descriptor built through
`field.*`; per kind, mutations adding an unknown key, each other kind's
type-specific option, a placeholder where `placeholder` is false, and a
default of the wrong `valueKind`; group/list descriptors with and without
`layout`. Verdict equality is checked for every corpus member. Semantic
constraints (spec) are excluded from the corpus by construction.

Alternative rejected: add `ajv` as a dev dependency. It would validate more
keywords than the schema uses, but adds a dependency for one test; the
evaluator is ~60 lines and fails loudly on unsupported keywords.

### 6. Admin `fieldTypeSupport`

`apps/admin/src/entities/content/field-types.ts` gains:

```ts
export interface FieldTypeSupport {
  readonly problem: (definition, value) => string;          // fieldProblem's per-type message
  readonly listCell?: (value) => string;                    // listQueryable kinds only
  readonly filter?: { control: "text" | "number" | "date" | "datetime-local" | "boolean" | "select" };
  readonly summary?: { priority: 0 | 1 | 2; text: (value) => string };
  readonly guidance?: (definition) => readonly string[];    // declared bounds
  readonly draftValue?: () => unknown;                      // new list item without default
}
export const fieldTypeSupport: Readonly<Record<FieldType, FieldTypeSupport>>;
```

Operators come from `FIELD_FILTER_OPERATIONS` plus `isSet`/`isNotSet`, not
from the admin entry, so the admin and server cannot disagree (spec
scenario). `listCell` and `filter` are required exactly for list-queryable
kinds; a unit test checks that against `fieldTypeCapabilities`. The record
lives in `entities/content` (it needs `shared/lib` formatters only), so
`widgets/collection-entries` and `widgets/block-editor` may import it under
the existing layer order. `formatListValue`, `fieldProblem`, `operations()`,
`texts()` priorities in `item-summary.ts` and `block-presentation.ts`,
`draftItemValue` and `fieldGuidanceParts` read it; their exported names and
messages stay, so component and e2e tests are unchanged.

### 7. Vocabulary guard

`tests/field-type-vocabulary.test.mjs` scans non-test `.ts`/`.tsx` under
`packages/*/src` and `apps/*/src` with the TypeScript scanner already used by
`scripts/check-boundaries.mjs` and fails on an array literal, `new Set([...])`
argument or union type containing two or more distinct field kind string
literals, outside `packages/content/src` capability declaration and
`apps/admin/src/entities/content/field-types.ts`. Comparison chains
(`a === "text" || a === "textarea"`) are not flagged; they are single
decisions, not lists. Fixtures cover a flagged array, a flagged union and an
allowed comparison.

Alternative rejected: a check in `check-boundaries.mjs`. That script owns
dependency structure; the guard is about vocabulary and has its own test.

### 8. Totality experiment

The spec scenario "a new kind must declare its capabilities" is verified once
by hand during apply: add a `DummyFieldDefinition` (`type: "dummy"`) to
`FieldType` and the descriptor union, run `pnpm typecheck`, record every
reporting file in `verification.md`, then revert. A reporting file outside
`packages/content` and the admin's `field-types.ts` / `FieldControls`
declarations is converted into a derivation in this change.

A permanent type test cannot express "the rest of the workspace still
compiles with an extra kind" without forking the union, so the experiment is
recorded instead.

## Risks / Trade-offs

- [Application branch reordering changes which pointer a doubly-invalid
  filter reports] → keep operator-first evaluation; existing pointer tests
  plus new cases for each kind's rejected operators.
- [OpenAPI consumers that relied on the old schema rejecting
  `embedProviders`] → none known; the server always emitted it, so the old
  schema was wrong for every real response with a provider-restricted URL.
- [Mini evaluator diverges from JSON Schema semantics] → it throws on any
  unhandled keyword, and corpus members include a valid descriptor per kind
  that must pass, so an evaluator bug shows as a verdict mismatch.
- [Guard false positives on unrelated literals such as `"select"` modes] →
  two distinct field kind literals in one list are required; fixtures cover
  the `MediaGrid` mode union (`"choose" | "open" | "select"`).
- [Removing two `@lacecms/config` exports] → no workspace, template or
  documentation consumer; recorded as internal breaking in the proposal.

## Migration Plan

No data or configuration migration and no template version bump. Rollback
is a revert of the change commit; `api-v1.json` is regenerated from source.
