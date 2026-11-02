## Context

See `proposal.md` (Why). Evaluators observed on commit `d7a21b17`:

| Site | Effective value | Absent controller with default | `null` controller | Used by |
| --- | --- | --- | --- | --- |
| content `isFieldVisible` (`content/src/index.ts:518`) | the value passed in | hidden (no default lookup) | `null` is not listed → hidden | `normalizeFieldMap` (`:1975`), `publishedFieldValues` (`:2015`) |
| content `normalizeFieldMap` (`:1970-1978`) | normalized unconditional values, defaults materialized | visible (default was inserted) | rejected earlier: `isFieldValue` accepts only strings/booleans | draft and publish validation |
| content `publishedFieldValues` (`:2001`) | the values passed in | hidden | hidden | publication (`application/content-use-cases.ts:976`), `publishedBlockData` (publication, `configuration-migration.ts:245`, `render/src/blocks.ts:191`), `collectInternalLinks` (`:2168`) |
| application `visibleUnder` (`configuration-fields.ts:82`) | stored value, else `controller.defaultValue` | visible | `null` is present and not listed → hidden | `pruneHidden` (`:129`), `hiddenInPublished` (`:167`), revealed checks (`:241-242`) |
| admin `effectiveFormValues` (`entities/content/visibility.ts:17`) | form value unless `undefined`/`null`, else default | visible | default | `shownFieldKeys` → `applicableErrors`, `renderedFieldKeys`, `item-summary`, `media-list`, `block-presentation`, `BlockCard`, `EntryPage`, `MediaItemPreview` |

Every product caller of `publishedFieldValues` passes normalized values
(publication validates in publish mode first; block migration and render
validate before projecting), so today's divergence is reachable only through
direct library calls and through sync over stored values that predate a
controller default. Normalized and stored controller values are never `null`:
`isFieldValue` rejects `null` for `select` and `boolean`, and the repository
stores only validated values.

Block `settingsVisibility` (`BlockSettingsFields.tsx:32`) is a separate rule
over settings with `rule.setting`; `configuration-evolution.ts:409` compares
two rules for narrowing. Neither evaluates field visibility.

## Goals / Non-Goals

**Goals:**

- One effective-value computation and one rule match, both in
  `@lacecms/content`; application and admin keep their local function names
  only as thin delegations.
- One parity case table asserted at every call site, including both runtimes.

**Non-Goals:**

- Changing `isFieldVisible`'s signature, the admin's public visibility
  helpers, or any sync result shape (`prunes`, `backfills`, `violations`).
- Moving the evaluator out of `index.ts` into its own module; RF4A splits the
  file and will place it.

## Decisions

### 1. `effectiveVisibilityValues` returns only controller entries

```ts
export function effectiveVisibilityValues(
  fields: ModelFieldDefinitions,
  visibility: FieldVisibility | undefined,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, boolean | string>>;
```

For each distinct `rule.field` in `visibility`, the result holds the present
value when it is neither `undefined` nor `null`, otherwise the controller's
`defaultValue` when declared; otherwise the key is omitted. With no rules the
result is `{}`. It never reads keys other than controllers, never mutates
`values`, and uses `Object.hasOwn` for both the rule map and the values.
`isFieldVisible(visibility, key, effective)` then decides one target.

Alternative: a combined `isTargetVisible(fields, visibility, key, values)`.
Rejected: callers that check many targets of one occurrence
(`normalizeFieldMap`, `publishedFieldValues`, `shownFieldKeys`,
`pruneHidden`) would recompute effective values per target, and the roadmap
names `effectiveVisibilityValues` as the shared entry point. Returning the
whole values object with defaults merged was rejected too: it would copy
non-controller data and blur "effective controller values" with normalized
values.

### 2. `null` counts as unset everywhere

The admin needs it (a cleared select or boolean is `null` in form state).
On the server `null` is never a stored or normalized controller value, so
treating it as unset changes no reachable result and gives every layer one
rule. The spec states it explicitly.

### 3. Content call sites

`normalizeFieldMap` computes `effectiveVisibilityValues(definitions,
visibility, controllers)` once from the normalized unconditional values and
passes it to `isFieldVisible`; the result is unchanged because defaults are
already materialized. `publishedFieldValues` computes it once per occurrence
from `values` and filters keys with it; nested groups and list items recurse
as today, so each occurrence evaluates only its own values. Key order,
non-insertion and list shape stay as specified.

### 4. Application wrapper keeps the rule-level call shape

`visibleUnder(rule, fields, parent)` is called with a single rule, including
`change.visibility.before/after`, which are not the owner's current rule map.
It becomes:

```ts
function visibleUnder(rule, fields, parent): boolean {
  if (rule === undefined) return true;
  const rules = { target: rule };
  return isFieldVisible(rules, "target", effectiveVisibilityValues(fields, rules, parent));
}
```

The placeholder key is local and never escapes. Alternative: rewrite the
callers to pass owner rule maps. Rejected: before/after rules belong to a
change, not to the owner, and the rewrite would touch sync logic outside this
session's scope.

### 5. Admin wrapper keeps `unknown` input

`effectiveFormValues(fields, visibility, values: unknown)` keeps its export
and turns a non-record into `{}` before delegating. Its current tests stay
unchanged and pass.

### 6. One parity case table in test-utils, exposed by a subpath

`packages/test-utils/src/visibility-parity.ts` exports
`visibilityParityCases`: each case has a name, a field map built with
`field.*`, its rules, one occurrence's values and the expected visible keys.
Cases: default select controller (omitted, present, `null`); optional select
without default (absent, present); boolean controller with `false` listed;
boolean without default absent; a group with its own rules inside a visible
target; a list of group items with differing controllers; a hidden group
hiding its subtree. The module imports only `@lacecms/content`, so admin tests
under jsdom can load it without application, platform or SQL code.

It is exported from the package index and from a new subpath
`@lacecms/test-utils/visibility-parity` (`package.json` `exports` plus a
`vitest.shared.mjs` alias to the source file, following the existing
`@lacecms/platform-node/test` alias). Admin imports the subpath.

Content cannot import test-utils (test-utils depends on content), so the
content-level assertions live in `packages/test-utils/src/visibility-parity.test.ts`:
for every case, the visible keys from `isFieldVisible` over
`effectiveVisibilityValues`, the keys kept by `publishedFieldValues` (for
values holding every field), the keys `validateModelFields` validates in the
selected mode (observed via a required target that is missing), and the keys
`transformConfigurationSyncFields(..., "published", rules)` keeps all equal
the expected set. Admin's `visibility.test.ts` asserts `shownFieldKeys`
equals the same expected set for each case.

Alternative: duplicate small fixtures per package. Rejected: parity is the
point; one table guarantees the inputs are identical.

### 7. Runtime parity through the repository contract

One new case in `repository-contract/conditional.ts`, registered after the
existing conditional cases and added to the pinned list in
`case-names.test.ts`:

1. Seed a v1 model without rules and create entries whose published
   snapshots store parity-table values raw (through `repository.create` and
   `repository.publish`, as the existing sync prune case does), including an
   occurrence that omits a defaulted controller.
2. Synchronize to v2, which adds the rules.
3. Assert each stored published snapshot holds exactly the case's expected
   keys, and that publishing the same values through `ContentUseCases`
   stores the same projection.

The contract runs on Node SQLite and D1 through the existing runtime
harnesses; the in-memory store uses the same application transform.

### 8. Guard

`tests/shared-vocabulary.test.mjs` adds `effectiveVisibilityValues` and
`isFieldVisible` to the single-owner names, and flags `rule.values.includes(`
outside `packages/content/src`, allowlisting the block `settingsVisibility`
match in `BlockSettingsFields.tsx` with its reason. A fixture with an inline
rule match fails with file and line.

## Risks / Trade-offs

- [A direct library caller relied on `publishedFieldValues` hiding targets of
  an absent defaulted controller] → No product caller does (Context); the
  accepted spec already requires the default; the new scenario pins it.
- [Placeholder key in the application wrapper reads as a trick] → One-line
  comment; the key never leaves the function.
- [Admin tests import test-utils code under jsdom] → The subpath module
  imports only content; task 3.2 verifies the admin suite loads it.
- [Pinned contract case order] → The new case is appended and the pinned
  list is updated in the same task.

## Migration Plan

None. No stored data, schema, configuration or template change; revert is a
code revert.
