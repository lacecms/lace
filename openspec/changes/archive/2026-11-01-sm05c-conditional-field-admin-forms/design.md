## Context

See proposal.md for motivation. Relevant current state:

- Model and block DTOs already carry validated `visibility` maps on models,
  groups (including list-item groups) and block data (SM5A). `@lacecms/content`
  exports the pure evaluator `isFieldVisible(visibility, target, values)`, which
  expects normalized values with defaults materialized.
- Admin form state is not normalized: a cleared control stores `null`
  (`withoutClearedValues` drops it before saving so the server applies the
  default), and absent values are `undefined`.
- Local admin validation (`editor-form.ts`) is draft-mode only. Server
  validation treats hidden targets as drafts, so local validation of hidden
  values is already equivalent to the server's and needs no rule awareness.
  Publication problems come only from the server and are stored in React Hook
  Form errors with type `publication`.
- `FieldLayout` already accepts `visibleKeys` (LIST2 `settingsVisibility`): it
  wraps each field in an element with `hidden`, hides sections and tabs without
  shown fields and moves the selection off a hidden tab. `BlockSettingsFields`
  shows a hidden setting with an error and the annotation "Shown to resolve a
  validation problem in this stored setting."
- Field-map owners render through three sites: model fields in
  `pages/entry/EntryPage`, block data in `widgets/block-editor/BlockCard`, and
  groups (which include every list item) in `FieldRenderer`'s group branch.
- Row and block summaries (`item-summary.ts`, `block-presentation.ts`), leaf
  previews (`previewLeaf`, `MediaItemPreview` "No alt") and media-list
  eligibility (`media-list.ts`) read values without regard to rules.
- `validation-problems.ts` walks errors in rendered order using metadata but
  not values.

## Goals / Non-Goals

**Goals:** one admin evaluation of rules that matches the server; one pure
filtering step for errors so every consumer (fields, rows, tabs, block cards,
summary) agrees on what is reachable; no change to submitted values.

**Non-Goals:** client publish-mode validation; any change outside
`apps/admin`, docs and planning documents.

## Decisions

### D1. One admin visibility helper over the shared evaluator

Add `entities/content/visibility.ts`:

- `effectiveFormValues(fields, values)` returns a detached object holding, for
  each controller key named by the owner's rules, the form value when it is
  neither `undefined` nor `null`, otherwise the descriptor's `defaultValue`
  when declared, otherwise nothing.
- `shownFieldKeys(fields, visibility, values)` returns the set of keys
  `isFieldVisible` accepts for those effective values (all keys when the owner
  has no rules).

The admin calls the exported `isFieldVisible` instead of reimplementing it, so
"listed value", "absent controller without default hides" and boolean
handling come from one function. A table test runs the same cases through the
helper and through `@lacecms/content` draft normalization plus
`isFieldVisible` to prove parity, including `null`-cleared controllers.

Rejected: evaluating on normalized values by running
`validateFieldValue(..., "draft")` per render. It throws on transient invalid
input and costs a full normalization per keystroke. Rejected: a copy of the
rule logic in the admin; it would drift.

### D2. Hide with `FieldLayout.visibleKeys` at the three owner sites

- `EntryPage` watches `fields` controllers (`useWatch` on `fields`) and passes
  `visibleKeys` for the model when `model.visibility` is defined.
- `BlockCard` already watches the block's `data`; it passes `visibleKeys` for
  `definition.visibility`.
- `FieldRenderer`'s group branch receives the group value as a prop and
  passes `visibleKeys` for `definition.visibility`; because list items render
  as groups, every item evaluates its own controller.

Hidden fields stay mounted inside `hidden` wrappers, which removes them from
the accessibility tree and tab order while keeping React and React Hook Form
state, rich-text editor instances and list item identities. Controllers are
never conditional (no chains), so a controller is always shown. `undefined`
`visibleKeys` keeps today's rendering for owners without rules.

Required markers and "Required for publication" notes live inside the hidden
wrapper and disappear with the field; nothing else is needed.

Rejected: unmounting hidden fields. It loses rich-text editing identity,
transient values and list open state, which the spec requires to survive.

### D3. Filter errors once, then show what remains

Add `applicableErrors(fields, visibility, values, errors)` to
`visibility.ts`. It walks errors alongside metadata and values: for each key
of an owner, when the key is hidden it removes every `publication`-type error
in that subtree; when shown it recurses into groups and list items with their
own values and rules. It returns a new object and leaves form state untouched,
so a stored publication issue reappears if the controller makes its target
visible again, until the next validation replaces it.

Every consumer reads filtered errors: `EntryPage` model fields, `BlockCard`
(`error.data`, `hasError`, `contentProblems`), `FieldRenderer` group and list
nodes (they receive already filtered errors from their owner), `FieldLayout`
indicators, and `validationProblems`.

An owner then shows `shownFieldKeys ∪ { key | hidden and layoutHasProblems
(filtered error) }`. A hidden key that remains in the set has only draft
problems; it renders with the annotation
"Shown to fix a problem in a stored value. Applies when <controller label> is
<value labels joined with "or">." (booleans read "on"/"off"), mirroring the
settings annotation. When the problem disappears the key leaves the set and
the field hides again.

`validationProblems` gains the entry's field values (blocks are already
passed) and calls `applicableErrors` per owner before listing, so the summary
and the controls agree. Reading order and targets are unchanged; a revealed
hidden field is focused through the existing control id and reveal events.

Rejected: clearing publication errors on controller change with `clearErrors`.
It loses issues that the writer can bring back by switching again and needs
per-controller subscriptions; read-time filtering is pure and testable.

### D4. Summaries and previews read shown keys only

`itemSummary`, `previewLeaf`, `holdsMedia` and the block summary in
`block-presentation.ts` restrict a group's or block's keys to
`shownFieldKeys` for that occurrence (recursively for nested groups and
items). When `itemLabel` names a hidden key it is ignored. The "No alt" check
in `MediaItemPreview` only runs for a shown media leaf because previews come
from `previewLeaf`; the `alt` override is read only when `alt` is shown.

### D5. Media-list eligibility evaluates the starting value

`mediaListTarget(item)` additionally computes the item's starting value
(`draftItemValue(item) ?? fieldStartingValue(item, {})`, as Add uses) and
requires the media key to be in `shownFieldKeys` for it. The result is still a
function of metadata alone. `mediaListItems` keeps copying the starting value,
so appended items carry the controller default (for example `kind: "image"`).

### D6. `settingsVisibility` stays separate (owner decision for SM5C)

Settings are presentation: they are always validated, defaulted and delivered,
and render code reads them unconditionally. Converging them on `visibility`
would make settings disappear from published blocks and from
`BlockProps.settings` types, a breaking change for every site component, with
no editorial benefit over the existing presentation-only hiding. Both maps
stay, documented side by side. ADR 0018 records the decision.

Rejected: deprecating `settingsVisibility` in favour of `visibility` on
settings; rejected: allowing settings to control data fields (cross-scope
controllers break "same object occurrence").

### D7. Documentation

- Public: new page `content-modeling/conditional-fields.md` ("Conditional
  fields") with the declaration, rules, rejected forms, value policy, types,
  synchronization and a complete list-item example (custom block in the
  reader's `lace.config.ts`, so it does not depend on SM5D); a paragraph and
  link from `composites.md`; editing notes in `editing-content/index.md`.
- Internal: `docs/field-guidance.md` and `docs/form-organization.md` describe
  admin behavior (shown keys, shown-to-fix annotation, error filtering);
  `docs/composite-fields.md` notes per-item evaluation;
  `docs/documentation-maintenance.md` topic map lists the page;
  `docs/mvp-architecture.md` §8 replaces "The admin hides fields in SM5C";
  ADR 0018 status "accepted; implemented"; roadmap SM5C done marker is left to
  archive, SM5D added now.

No generated-template guide changes, so no template version or snapshot
change in this session.

### D8. Verification

- Unit: `visibility.test.ts` (parity table, effective values, error
  filtering), `item-summary`, `media-list`, `validation-problems`,
  `FieldLayout`, `FieldRenderer` group, `BlockCard`, `EntryPage` tests.
- Playwright `conditional-fields.e2e.ts` with mocked API metadata built from
  `defineBlock`/`field` (list-item `kind` select, model boolean controller,
  tab layout with only conditional fields): switching, toggle-back values in
  the saved request, viewer mode, stale publication issue, hidden invalid
  value, summary reveal in collapsed item, multi-select Add on a conditional
  list, and axe at 320 px.

## Risks / Trade-offs

- [Admin and server disagree on effective values] → D1 uses the exported
  evaluator and a parity table test against draft normalization.
- [Extra `useWatch` subscriptions re-render large forms] → Owners already
  watch their values (`BlockCard` data, group value props); the model watch
  is one subscription, and evaluation is O(rules).
- [A hidden field with a server draft problem is unreachable if its error
  path cannot be mapped] → Unmapped issues stay in the summary as text, as
  today.
- [Writers may not notice that hidden values are saved] → Documented; no UI
  indicator in this session (non-goal).
- [Revert drops hidden draft values] → Accepted behavior from SM5A; documented
  for editors.

## Migration Plan

Admin and documentation only; no data, API or template change. Deploy with the
admin bundle; rollback by redeploying the previous admin, which shows every
field as before while the server keeps enforcing rules.
