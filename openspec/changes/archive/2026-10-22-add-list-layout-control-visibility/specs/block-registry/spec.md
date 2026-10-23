## ADDED Requirements

### Requirement: Gallery adopts reusable mode-specific setting visibility
Gallery v4 SHALL declare the shared list-layout visibility rules: `layoutMode`
always visible, `layoutWrap` visible for both flex modes, and `layoutPreset`
visible for grid, subject to generic validation-error reveal. An unrelated block
SHALL be able to reuse the same scalar settings and visibility rules without
admin changes. Layout/Behavior grouping, settings/defaults, Gallery definition
version 4, migrations 2/3/4 and all image/link/lightbox semantics SHALL remain
unchanged. Setting visibility metadata SHALL not enter authored/public payloads
or change Astro registry source revisions or stylesheet ownership.

#### Scenario: Two adopters
- **WHEN** Gallery and a custom card-list block adopt shared layout settings and visibility
- **THEN** both expose the same mode-specific controls with independent retained scalar values through the ordinary editor

#### Scenario: Existing content and sites remain compatible
- **WHEN** Gallery gains visibility metadata
- **THEN** existing v4 blocks, model structural versions, Astro components, CSS hashes and public settings retain their existing contracts
