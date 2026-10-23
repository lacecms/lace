## Context

See proposal.md for the user request and explicit change of LIST1 policy.
LIST1 is implemented and validated but not yet synchronized/archived. Its
list-layout and choice-card requirements are this follow-up's prerequisite
baseline; eventual explicit spec synchronization must apply LIST1 before LIST2.
Do not rewrite the completed LIST1 plan to pretend the new behavior already shipped.

Observed integration points:

- Content `BlockDefinitionInput`/`BlockMetadata`, `defineBlock` and `toBlockMetadata`
  already normalize optional `settingsLayout` against declared scalar settings.
- The list settings helper returns three independent scalar descriptors. Gallery
  v4 uses them in Layout followed by Behavior sections.
- Config canonicalization handles actual block owners separately from content and
  defaults. Application sync already treats projection-only updates as display
  operations with baseline guards.
- Contracts validate forged metadata by reconstructing block definitions;
  `field-openapi.ts` documents the separate recursive transport shape.
- Admin `BlockSettingsPanel` and `BlockSettingsSummary` each render a `FieldLayout`
  with the same `FieldRenderer`. `useWatch` is already used for reactive values.
  `FieldLayout` force-mounts tab contents and reveals them through the shared
  reveal-control event. Error relevance follows hidden-on-site publication rules.

Architecture §8 and backlog explicitly require all layout controls to stay
visible and defer visibility-only conditional forms. Before runtime edits, update
architecture §§8/17 and backlog to select LIST2 as a bounded exception requested
by the user. Full conditional forms remain deferred. No production change is
permitted while that governing policy still excludes this scoped behavior.

## Goals / Non-Goals

**Goals:** reactive setting visibility for arbitrary blocks, complete value
retention, portable metadata and a reachable path to correct invalid hidden data.

**Non-Goals:** new field kinds, model/data/group/list-item conditions, conditional
validation/requiredness, authored expressions, permission changes, CSS/site changes,
Gallery version 5 or database migrations.

## Decisions

### D1. A block-level map with one-hop select predicates

Add optional `settingsVisibility` to block input and metadata:

```ts
settingsVisibility: {
  layoutWrap: { setting: "layoutMode", values: ["flex-row", "flex-column"] },
  layoutPreset: { setting: "layoutMode", values: ["grid"] },
}
```

Targets and controllers are keys in the same declared settings map. Controllers
must be required selects with valid defaults and must not themselves be targets.
This rejects self-references, cycles and dependency chains at configuration time
without introducing a general expression/dependency engine. Match effective
controller values, falling back to their declared defaults only when absent;
present invalid values remain invalid rather than being normalized by the UI.
The controller's own ordinary validation/error path remains reachable.

Validate exact rule keys, plain objects, finite portable JSON, a nonempty unique
subset of controller options and declared target/controller names. Normalize,
detach and deeply freeze. Export `SettingsVisibility` with setting-key type
constraints and `normalizeSettingsVisibility` for the shared configuration and
REST boundary. Descriptors, default values and inferred authored types stay intact.
Reject this option on model/field/envelope owners rather than silently ignoring it.

Rejected: hard-coded Gallery/layout names in React; descriptor `visibleWhen`
available at every recursive position; arbitrary expressions; general conditional
validation. The map defines only the bounded setting presentation actually needed.

### D2. Share list adoption without coupling admin to settings names

Export `listLayoutSettingsVisibility()` returning a fresh immutable map alongside
`listLayoutSettings()`. Gallery sets `settingsVisibility` from this helper; a
custom card list adopts both helpers using the public DSL. Arrangement has no
rule. Leave Layout/Behavior groups, all values/defaults, migrations 2/3/4 and
Gallery definition/source versions at 4. No renderer/CSS/lock update is needed.

### D3. Presentation identity and transport only

Include the map in projection/admin metadata, omit absent properties, and strip
it only from real block-definition positions in structural/legacy identity.
Do not recursively remove keys from authored/default JSON. Application's existing
projection-diff path remains authoritative; test that it requires no content
writes and rejects stale plans on both runtimes. Preserve the existing sync
behavior: projection updates advance the published version and request/coalesce
a build, even when only admin metadata changed. Separately classifying admin-only
updates is outside this change, as confirmed by the user during apply.
Options/defaults retain structural behavior. Extend the strict contracts whitelist
and reconstruct the map through `defineBlock` for forged validation. Document the
shape in OpenAPI using scalar-setting key references and option constraints in
text where JSON Schema cannot express cross-property references.

### D4. One settings composition path, stable mounted values

Factor declared-setting composition shared by the editor panel and viewer summary
in the block-editor layer. Subscribe to `blocks.<index>.settings` with `useWatch`;
compute visible setting keys from validated metadata and relevant errors.
Conditions are evaluated in that block's scope, never against another list item,
model field or global registry state. The ordinary scalar renderer stays unchanged.

Hide wrappers using native `hidden` while preserving mounted controls/form
registration; never disable a field merely because it is inapplicable, remove it
from the form state, or call reset/setValue on a mode change. Filter empty section
headings/tab triggers from navigation while retaining mounted contents. Extend
FieldLayout with an optional presentational visible-key input if needed; predicate
interpretation stays in block settings, not in the general recursive renderer.
When a selected tab becomes empty, choose the first visible tab without moving
focus unexpectedly. Existing callers without visibility keep their exact behavior.

Relevant errors force a setting visible and add concise associated text explaining
why. Reuse existing error classification, including hidden-block publication
exceptions. Summary focus uses the existing reveal event to expose enclosing
block/settings tabs and disclosures and focus the radio/switch/input normally.
Correcting or clearing the error restores predicate-based visibility. No silent
mode change is needed to repair an inactive value. Read-only viewers follow the
same presentation and read choice labels; lifecycle requests retain editing locks.

### D5. Existing content lifecycle remains unconditional

Server validation never evaluates visibility when deciding whether to validate
or publish a setting. All scalars remain in draft/public/export payloads. Reuse
save/discard/revert/duplicate/move/conflict handling, proving it with focused tests.
Do not add visibility metadata to authored JSON or introduce a persistence path.
Node and D1 share the same scalar validation and projection synchronization.

## Risks / Trade-offs

- [An inapplicable field has invalid retained data] → reveal it with its error and
  explanation; summary focus remains reachable, and both runtimes still reject it.
- [Scope expands into deferred forms] → only scalar declared settings, one-hop
  unconditional select controllers, no conditional validation or recursive scopes.
- [Hidden inputs vanish from submitted values] → mounted wrappers and unchanged
  registration; tests inspect saves/public exports after multiple mode switches.
- [Layout groups become empty] → hide their navigation/headings, keep contents
  mounted and choose a visible tab while preserving value/focus identities.
- [Out-of-order spec synchronization] → explicitly record LIST1 before LIST2;
  neither synchronization nor archival is authorized by this proposal.

## Migration Plan

1. During apply, revise governing architecture/backlog first with the explicit
   selected exception and retention/error rules. Keep previous delivery artifacts.
2. Ship matching content/config/contracts/admin changes, then update block
   definitions through the helper. Older packages reject the new optional map.
3. Run ordinary projection-only sync where needed, preserving snapshot versions,
   audit/media data. Preserve existing published-version advancement and build
   outbox coalescing for metadata updates. No model/block bump or SQL migration.
4. Verify light/dark narrow/desktop UI, keyboard navigation, error-reveal, both
   flex modes, grid, independent blocks and lifecycle paths.
5. Rollback by removing the map/helper adoption and deploying matching earlier
   packages. Retained content remains compatible with Gallery v4 and its site CSS.
