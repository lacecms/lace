## ADDED Requirements

### Requirement: Composite metadata and identity remain portable and compatible
Pages, collections and globals SHALL accept validated composites in their model
fields and block data. The runtime and public projections SHALL retain recursive
metadata. Structural identity SHALL exclude display labels/descriptions at every
descriptor position and preserve child keys and all default-value keys, including
`label` and `description`. Nested display-only changes SHALL be projection-only.
Scalar-only configurations SHALL keep their hashes and encodings. Collection
listFields and SEO mappings SHALL remain restricted to their existing supported
root scalar fields; composites and nested paths SHALL be refused there.

#### Scenario: Nested display change
- **WHEN** only a group child's label or list item's description changes
- **THEN** the structural hash stays equal and the projection hash changes

#### Scenario: Content keys remain structural
- **WHEN** a child field named `label` or a default object property named `description` changes
- **THEN** the structural hash changes and the key remains in the canonical structure

#### Scenario: Scalar hash compatibility
- **WHEN** the pre-CE7A scalar-only configuration fixtures are normalized
- **THEN** their canonical values, structural hashes and projection hashes remain unchanged

#### Scenario: Scalar-only presentation options
- **WHEN** listFields or an SEO fallback mapping names a group, list or nested path
- **THEN** configuration refuses the option before startup
