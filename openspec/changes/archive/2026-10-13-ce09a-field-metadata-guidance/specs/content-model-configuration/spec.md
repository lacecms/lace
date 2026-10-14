## MODIFIED Requirements

### Requirement: Deterministic normalized configuration identity
The system SHALL return model and whole-configuration definitions as detached,
deeply readonly plain data. It SHALL provide a runtime projection containing
compiled field and block validators and a JSON admin/public projection that
contains only serializable configuration and block metadata. The public
projection SHALL provide deterministic structural and projection hashes for
every model and for the complete configuration using canonical JSON and the
portable SHA-256 contract. A model's structural hash SHALL be the hash of its
canonical structure: the model kind, key, version, fixed path or collection
route, ordered block allowlist, field definitions, and the definitions of its
allowed blocks, with the `label` and `description` display properties removed
only from the model, from each field definition, from each block definition,
and from each block field definition. Field keys, block field keys, and keys
inside default values SHALL be preserved even when they are named `label` or
`description`, `itemLabel` or `placeholder`. A list descriptor's optional `itemLabel` SHALL also be removed only at descriptor positions;
field keys and default-value keys named `itemLabel` SHALL remain structural.
The optional `placeholder` SHALL be removed only at descriptor positions, recursively in model fields, block data and block settings; placeholders SHALL remain in projection hashes. Field keys and default-value keys named `placeholder` SHALL remain structural. Configurations omitting placeholders SHALL retain their prior hashes.
Structural hashes SHALL exclude a collection's `listFields`
presentation metadata and the temporary synchronization hints (`renamedFrom`
on a model or a field, `removedFields`, `removedBlocks`); projection hashes
SHALL include the complete serializable normalized definition, including
`listFields` and list `itemLabel`, except those hints. Normalized field definitions SHALL NOT
contain the field `renamedFrom` hint. Each runtime model SHALL carry its
temporary hints, its detached canonical structure and, when it differs from
the structural hash, the structural hash produced by the earlier rule that
removed every `label` and `description` key at any depth. None of these values
SHALL appear in the public projection or in any hash. Equal semantic
configurations SHALL produce equal hashes regardless of object insertion
order.

#### Scenario: Ignore display-only changes in structural identity
- **WHEN** two otherwise identical model definitions differ only in model,
  field, or block label and description
- **THEN** their structural hashes match and their projection hashes differ

#### Scenario: Ignore list presentation in structural identity
- **WHEN** two otherwise identical collection definitions differ only in their
  `listFields`
- **THEN** their model and complete-configuration structural hashes match and
  their projection hashes differ, so synchronization treats the change as a
  projection-only update that needs no version increase

#### Scenario: Ignore temporary rename metadata in configuration identity
- **WHEN** two otherwise identical model definitions differ only by a valid
  `renamedFrom` hint
- **THEN** their model and complete-configuration structural and projection
  hashes match while the runtime model retains the hint for synchronization

#### Scenario: Ignore field and removal hints in configuration identity
- **WHEN** two otherwise identical model definitions differ only by a field
  `renamedFrom` hint, a `removedFields` list, or a `removedBlocks` list
- **THEN** their model and complete-configuration structural and projection
  hashes match, their public projections are equal and contain none of the
  hints, and the runtime model retains the hints for synchronization

#### Scenario: Detect a structural model change
- **WHEN** otherwise identical definitions differ in kind, version, fields,
  allowed blocks, block schema version or fields, fixed path, or collection route
- **THEN** their structural hashes differ

#### Scenario: Fields named like display metadata are structural
- **WHEN** two otherwise identical model definitions differ only in a field
  whose key is `description` or `label`, or in a block field with such a key
- **THEN** their structural hashes differ and the canonical structure contains
  that field

#### Scenario: Structural hash is stable for configurations without such keys
- **WHEN** a configuration has no field, block field, or default-value key
  named `label` or `description` and no descriptor placeholder
- **THEN** each model's structural hash equals the hash produced by the earlier
  rule and the runtime model carries no pre-change hash

#### Scenario: Project configuration for public metadata consumption
- **WHEN** a valid configuration including registered blocks is normalized
- **THEN** the runtime projection exposes compiled validators and each model's
  canonical structure while its JSON admin/public projection round-trips
  through JSON without functions, canonical structures, or pre-change hashes

#### Scenario: Detach normalized configuration from caller inputs
- **WHEN** caller-owned model, field-map, block-definition, block-key, or
  list-field containers are modified after configuration normalization
- **THEN** the normalized definitions, projections, and hashes remain unchanged
  and cannot be mutated through their returned values

#### Scenario: Placeholder changes only projection identity
- **WHEN** otherwise identical configurations differ only in a supported placeholder at any nested model or block data/settings leaf
- **THEN** their model and whole-configuration structural hashes match, their projection hashes differ and no version increase is required

#### Scenario: Content keys named placeholder stay structural
- **WHEN** a field key or a key inside a default value is named placeholder and its structure or value changes
- **THEN** the canonical structure retains it and the structural hash changes
