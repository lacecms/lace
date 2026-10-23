## Why

List layout controls currently remain visible even when they cannot affect the
selected mode. The user explicitly requests showing Wrap items only for flex
and Grid preset only for grid, while preserving choices when switching modes.

## What Changes

- Select **LIST2 — mode-specific list setting controls**, one follow-up session
  to the implemented, unarchived `add-reusable-list-layouts` (LIST1).
- Add bounded, generic block-setting visibility metadata driven by an always
  visible sibling select. No Gallery names or setting-name branches in admin.
- Adopt it for shared list layouts: wrap for `flex-row`/`flex-column`, preset for
  `grid`, arrangement always visible. Retain hidden values and ordinary server
  validation, defaults, save/publish and public delivery.
- Keep validation errors reachable by temporarily revealing a hidden setting
  with a relevant error; summary activation reveals and focuses its control.
- Explicitly revise architecture sections 8/17 and backlog before implementation:
  this is a user-requested exception to LIST1's all-controls-visible decision
  and the deferred conditional-forms restriction, limited to scalar block settings.
- Keep Gallery v4, model/block structural identity, Astro sources and CSS intact;
  metadata-only sync must not rewrite content. Preserve existing sync behavior,
  including published-version advancement and build requests for metadata updates.

Non-goals: conditional requiredness or server validation, general model/group/
list-item conditions, expressions, callbacks, chained dependencies or cycles.

## Capabilities

### New Capabilities

- `block-settings-visibility`: portable bounded sibling-select predicates,
  hidden-value retention, unconditional validation and reachable errors.

### Modified Capabilities

- `list-layout`: wrap and preset controls are shown only in their applicable modes.
  Its baseline is LIST1's implemented delta, pending explicit synchronization.
- `admin-draft-editor`: generic mode-dependent settings presentation, reactive
  visibility, accessible error recovery and unchanged editing lifecycle.
- `content-model-configuration`: visibility is descriptor-owner-aware projection
  metadata, excluded from structure without stripping identically named content.
- `block-registry`: Gallery uses shared layout visibility alongside its v4 settings.

## Impact

Governing sources: `docs/mvp-architecture.md` §§8/11/17, `backlog.md`, accepted
`admin-draft-editor`, `content-model-configuration`, `block-registry`, and LIST1's
`list-layout` delta. Architecture currently says all layout controls stay visible;
this proposal deliberately changes that policy rather than treating hiding as a
bug fix. Keep LIST1's completed artifacts as the previous delivery record; when
explicitly synchronizing specs, apply LIST1 before LIST2.

Affected areas: content block metadata/settings factories, config hashing,
contracts/OpenAPI, admin settings panel/viewer summary and shared field-layout
composition, documentation and tests on both runtime adapters. No SQL migration,
new endpoint, infrastructure dependency, package publication or site markup change.
