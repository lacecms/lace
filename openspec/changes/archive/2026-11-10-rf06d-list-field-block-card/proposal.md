## Why

Roadmap RF6D completes RF6's admin editor restructuring. `FieldRenderer` remains a 1,478-line baseline exception that mixes recursive field rendering with list editing, while block cards combine menus and tabs and receive individual callbacks from `BlockEditor`.

## What Changes

- Extract list rendering, rows, summaries and focus handling into the field-editor slice's `ListField` unit; leave `FieldRenderer` as a dispatcher, targeting fewer than 500 lines, and remove its oversized-source baseline entry once within the limit.
- Extract the block card menu and tabs into focused components, and pass a single typed `BlockActions` object from `BlockEditor` to each card, created once per editor rather than as per-card callback bundles.
- Preserve all editor behavior, data, accessibility, layer boundaries and public package exports. Existing list, block, keyboard and browser acceptance tests remain behaviorally unchanged.
- This is RF6D only; no editor features, UI redesign, API or persistence changes, or RF7 work. RF6A–RF6C are complete dependencies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a behavior-preserving refactor; `admin-draft-editor`, `admin-draft-editor-fields`, `admin-draft-editor-media-lists`, `admin-draft-editor-blocks`, `admin-draft-editor-publication` and `admin-source-structure` remain authoritative. No delta specifications are required.

## Impact

The admin field-editor entity, block-editor widget, colocated tests, source-size baseline and refactoring roadmap are affected. Architecture §§6, 17 and 20 remain unchanged. No dependencies, public API, saved data, migration, permissions or runtime behavior change; Node and Cloudflare parity is unaffected by the browser-only refactor.
