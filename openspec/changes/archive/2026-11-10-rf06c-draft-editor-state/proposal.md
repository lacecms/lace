## Why

Roadmap RF6C separates draft form state and entry mutations from `EntryPage`, where form validation, transient list issues, concurrency recovery and publication currently interact. The refactor makes those responsibilities easier to change while preserving the accepted editor behavior.

## What Changes

- Move form initialization, reset, transient issues, server issue mapping, epoch and slug suggestion into `useDraftEditor` in the field-editor entity; represent transient issues in React Hook Form and derive dirty/blocking decisions from the form-owned state.
- Move save, publish, reload and conflict coordination into `useEntryMutations` at the page layer. Pass one editor object to the field renderer provider; keep layer direction and existing authoring behavior.
- Replace `as never` field-path casts in the renderer and entry page with a typed template-literal field path, covering nested fields, list indices and block data/settings.
- First fix the composite pointer-drag acceptance at the default 1280×720 viewport, preserving the three named browser suites unchanged. Keep keyboard and accessibility behavior intact.
- Keep admin `test:e2e` out of CI; run the full suite as an obligatory RF6C verification. Record measured cast count and verification in the roadmap. No API, persisted data, permissions or intended product behavior changes.
- Non-goals: RF6D list/card extraction, new editor features, changes to backend contracts or data migration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a behavior-preserving refactor and repair of an existing acceptance test; accepted `admin-draft-editor`, `admin-draft-editor-fields`, `admin-draft-editor-media-lists`, `admin-draft-editor-blocks`, `admin-draft-editor-publication` and `admin-source-structure` remain authoritative. No delta specs are required.

## Impact

Admin entry page, field-editor entity, shared editor contract if needed, colocated tests and browser-test support; no new dependency anticipated. Architecture §6, §17 and §20 remain unchanged. RF6A and RF6B are complete; RF6D follows separately. Runtime parity is unaffected because this is browser-only.
