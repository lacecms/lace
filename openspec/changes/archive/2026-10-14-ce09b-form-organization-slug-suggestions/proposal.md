## Why

CE9B — Form organization and slug suggestions completes the CE9 field/form UX session after CE9A. Long recursive forms currently follow field declaration order, and creating a collection entry requires separately deriving its slug in the editor.

## What Changes

- Add optional serializable `layout` metadata to model fields, block data and group child forms, plus `settingsLayout` for declared block settings. Support ordered visual sections or tabs; preserve sibling field paths, defaults and absence.
- Validate references and placement before startup and at the metadata transport boundary. Treat layout as projection-only metadata, with unchanged hashes for configurations omitting it. Synchronization retains existing public-version/build behavior for changed public metadata.
- Render accessible persistent panels, problem indicators and exact validation-summary reveal through nested layouts and existing disclosures. Preserve the SEO card and block Content/Settings controls.
- Add an editable, initially automatic slug in the collection creation dialog. Follow title changes until manual override; keep existing entry slugs stable unless the writer explicitly enables the existing suggestion control.
- Define deterministic ASCII normalization, empty/non-Latin behavior and normal server conflict feedback; document layout and slug authoring.

Dependencies: completed CE7 recursive forms, CE8 rich-text state and CE9A guidance. Non-goals: conditional fields, data groups created by layout, custom React forms, callbacks, Unicode routes/transliteration, uniqueness prediction, migrations, or changes to content lifecycle and permissions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `field-descriptors`: portable validated layout syntax for group children and block data/settings.
- `content-model-configuration`: model layouts and descriptor-aware projection-only identity.
- `configuration-synchronization`: layout-only updates preserve all stored content and published state.
- `rest-contracts`: validated layout metadata round-trips across both runtimes.
- `admin-draft-editor`: form organization, recursive error navigation and automatic suggestions during collection creation.

## Impact

Architecture sections 8 and 17 will document presentation metadata and creation-time suggestions before implementation. Affected packages are content, config, contracts and admin; existing application/SQLite/D1 synchronization contracts verify unchanged persistence. Reference configuration, starter guidance and compatibility documentation are updated within this session. No dependency, database migration, server route contract or public content JSON change is required. Existing accepted opt-in suggestion behavior remains available in the entry editor.
