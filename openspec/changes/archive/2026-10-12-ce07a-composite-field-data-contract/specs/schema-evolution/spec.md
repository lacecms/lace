## ADDED Requirements

### Requirement: CE7A composite adoption does not silently enable nested evolution
Until recursive evolution is implemented, synchronization SHALL support
composites in new models, unchanged composite structures, nested display-only
projection changes and version-bumped addition of an optional root composite
without a default. On models with snapshots, other structural model-field
changes involving composites SHALL be refused with an explicit unsupported
nested-evolution report before writes, including composite defaults/backfills,
constraint changes, root rename/removal and scalar/composite conversion. This
transitional restriction SHALL qualify the existing scalar change classes for
composites only; scalar-only CE1 behavior and version rules SHALL remain.
No nested rename/removal hint syntax SHALL be accepted in CE7A.

#### Scenario: New model and safe addition
- **WHEN** a new model declares composites, or a populated model adds an optional root group without a default with the required version bump
- **THEN** sync succeeds without rewriting existing values or inventing media references

#### Scenario: Refuse an unsafe scalar-classifier fallback
- **WHEN** a populated model adds a composite default containing nested media or changes a list maximum or renames/removes a composite root
- **THEN** check and apply explicitly refuse pending nested-evolution support and all stored content stays unchanged

#### Scenario: Display-only nested metadata
- **WHEN** only a child label changes with the same model version
- **THEN** synchronization treats it as projection-only and preserves stored values/references

### Requirement: Composite block migration results respect the snapshot budget
Versioned block migrations SHALL accept composite outputs under the shared
recursive rules. Planning SHALL count the resulting complete snapshot's model
fields and every block data value, including unchanged and hidden blocks,
after migrated defaults, before writing a guarded entry unit. Required-field
grandfathering on unrelated existing published model fields SHALL remain.
Over-budget results SHALL fail as `BLOCK_MIGRATION_INVALID` with snapshot/path
evidence. Nested references SHALL be rebuilt from migrated values and may use
only media already referenced by the snapshot. Existing revision guards,
resumability, envelope preservation and final version/build behavior SHALL stay.

#### Scenario: Unchanged blocks consume migration budget
- **WHEN** a migration produces 100 list elements while unchanged fields and blocks already consume 401
- **THEN** planning refuses it without writing that entry and identifies the offending snapshot and path

#### Scenario: Migration boundary and media relocation
- **WHEN** a migration yields exactly 500 total elements and moves already-referenced media into nested paths
- **THEN** it succeeds, rewrites the relevant references, keeps the envelope and applies existing revision/build rules

#### Scenario: New media is still forbidden
- **WHEN** a migration places a previously unreferenced media ID in a nested leaf
- **THEN** planning refuses it with the existing invalid-migration behavior

#### Scenario: Interrupted migration resumes
- **WHEN** sync stops after one guarded entry unit and is rerun
- **THEN** committed units remain valid and only stale blocks are migrated again
