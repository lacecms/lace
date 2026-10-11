## MODIFIED Requirements

### Requirement: Typed, stable content-model definitions
The system SHALL let configuration code define page and collection models with
stable lowercase kebab-case keys, a positive integer version, optional display
label and description, typed field descriptors, allowed block-type keys, an
optional explicit `renamedFrom` key, and the optional temporary
synchronization hints `removedFields` (field keys) and `removedBlocks` (block
types). A model field MAY declare a field-level `renamedFrom` hint naming its
former field key. A page SHALL contain one fixed path; a collection SHALL
contain one route pattern. The configuration result SHALL preserve field value
inference, reject malformed definitions, reject duplicate model keys and
duplicate `renamedFrom` sources, and reject every allowed block type not
present in the supplied block registry. It SHALL reject a field rename hint
that names the field's own key, a configured field key, or a former key that
another field of the model also names. It SHALL reject a `removedFields` entry
that is not a valid field key, is repeated, is a configured field key, or is a
field rename source, and a `removedBlocks` entry that is not a valid block
type, is repeated, or is an allowed block type of the model. A removed block
type need not be registered. All `renamedFrom`, `removedFields` and
`removedBlocks` values SHALL be treated as temporary metadata for an explicit
later synchronization and SHALL NOT infer a rename or removal when absent.

#### Scenario: Define typed page and collection models
- **WHEN** configuration code defines a valid page and collection with field
  descriptors and allowed blocks that are registered
- **THEN** their inferred field value shapes, kind, version, route form, and
  allowed block types are retained in the normalized configuration

#### Scenario: Reject an unstable model identity
- **WHEN** a model has an empty or non-kebab-case key, a non-positive or
  non-integer version, an invalid `renamedFrom` key, a repeated current or former
  key, or an allowed block type absent from the registry
- **THEN** configuration normalization fails before application startup

#### Scenario: Reject contradictory synchronization hints
- **WHEN** a model field is renamed from its own key or from another configured
  field, two fields name the same former key, a `removedFields` entry is still
  configured or is also a rename source, or a `removedBlocks` entry is still
  allowed
- **THEN** configuration normalization fails and names the model and the hint

#### Scenario: Accept hints for a field and a block type that left the registry
- **WHEN** a model renames one field, lists one former field in
  `removedFields`, and lists in `removedBlocks` a block type that is no longer
  registered
- **THEN** configuration normalization succeeds and the runtime model carries
  the hints

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
`description`. Structural hashes SHALL exclude a collection's `listFields`
presentation metadata and the temporary synchronization hints (`renamedFrom`
on a model or a field, `removedFields`, `removedBlocks`); projection hashes
SHALL include the complete serializable normalized definition, including
`listFields`, except those hints. Normalized field definitions SHALL NOT
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
  named `label` or `description`
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
