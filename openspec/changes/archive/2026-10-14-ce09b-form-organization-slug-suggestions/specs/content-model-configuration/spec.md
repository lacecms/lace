## ADDED Requirements

### Requirement: Form layout changes only presentation identity
Pages, collections and globals SHALL accept the portable sibling `layout` defined by field descriptors for their own field maps. Model system fields (title, slug and SEO), block envelope controls and other owners' fields SHALL NOT be valid references. Model, block data/settings and recursive group layouts SHALL survive runtime/admin/public metadata projection and affect model and complete-configuration projection hashes only. Structural canonicalization SHALL omit layout only at owner metadata positions; content field keys and default-value keys named `layout`, `settingsLayout`, `groups`, `mode` or `fields` SHALL remain structural. Layout edits SHALL require neither a model/block version bump nor content migration. Configurations omitting layout SHALL keep their previous encodings, structural and projection hashes. Caller mutations SHALL NOT affect normalized layouts or hashes.

#### Scenario: Reorganize a populated model
- **WHEN** only model, nested group or block data/settings layout metadata changes
- **THEN** structural hashes and canonical baselines stay equal while projection hashes change

#### Scenario: Reject a system-field reference
- **WHEN** a model layout references undeclared `title`, `slug` or `seo` system fields
- **THEN** configuration refuses the reference before startup

#### Scenario: Preserve content keys resembling metadata
- **WHEN** a declared field named `layout` or a default object's `settingsLayout` value changes
- **THEN** the key remains in canonical content structure and structural identity changes

#### Scenario: Preserve old hashes and detach metadata
- **WHEN** pre-layout fixtures are normalized or caller-owned layout arrays are mutated after normalization
- **THEN** old fixtures keep their pinned hashes and normalized layouts remain unchanged
