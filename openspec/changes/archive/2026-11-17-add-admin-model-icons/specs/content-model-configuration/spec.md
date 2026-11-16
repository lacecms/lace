## ADDED Requirements

### Requirement: Models accept an optional sidebar icon
Page, collection, and global definitions SHALL accept an optional `icon`
string. Its value SHALL be one of the case-sensitive names `book-open`,
`calendar-days`, `file-text`, `globe`, `house`, `images`, `layers`, `menu`,
`newspaper`, `settings`, `tags`, or `users`, or exactly one emoji sequence
recognized by the release's pinned Unicode emoji data. The input SHALL fit
within 64 UTF-16 code units. Normalization SHALL preserve accepted strings
exactly and omit `icon` when it is absent. Invalid values SHALL produce a
configuration diagnostic naming the model and its `icon` option.

#### Scenario: Each model kind can specify a sidebar icon
- **WHEN** configuration defines a page with `icon: "house"`, a collection
  with `icon: "newspaper"`, and a global with `icon: "🧭"`
- **THEN** all three icons are present as strings in their normalized model
  definitions and serializable model metadata

#### Scenario: An emoji sequence is one icon
- **WHEN** the configured string is `"👩‍💻"`, `"⚙️"`, `"👍🏽"`, or `"🇮🇹"`
- **THEN** the same complete emoji sequence is carried as a single icon

#### Scenario: Invalid values fail configuration normalization
- **WHEN** a model supplies an unknown name such as `"setings"`, an unsupported
  Lucide name, an empty string, two emoji, an emoji surrounded by text or
  whitespace, or a non-string value
- **THEN** the model fails validation with a diagnostic for its `icon` option
  with the same acceptance rules on Node and Cloudflare

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
Structural hashes SHALL exclude the root model `icon`, a collection's
`listOptions` and `listFields` presentation metadata, and the temporary
synchronization hints (`renamedFrom`
on a model or a field, `removedFields`, `removedBlocks`); projection hashes
SHALL include the complete serializable normalized definition, including
`icon`, `listOptions`, `listFields` and list `itemLabel`, except those hints. Normalized field definitions SHALL NOT
contain the field `renamedFrom` hint. Each runtime model SHALL carry its
temporary hints, its detached canonical structure and, when it differs from
the structural hash, the structural hash produced by the earlier rule that
removed every `label` and `description` key at any depth. None of these values
SHALL appear in the public projection or in any hash. Equal semantic
configurations SHALL produce equal hashes regardless of object insertion
order.

Each runtime model SHALL additionally carry an internal `publicProjectionHash`,
computed with the same canonical JSON and SHA-256 model projection inputs as
`projectionHash`, omitting the root model `icon` and the collection's root
`listOptions`. Labels, `listFields`, SEO mappings, blocks and consumer field
and default-value keys named `listOptions` or `icon` SHALL remain in that input.
The internal hash SHALL be excluded from the serializable projection and all
structural/full projection hash inputs. Models without an icon or nonempty
listOptions SHALL have equal public and full projection hashes. Configurations
omitting icons SHALL retain their prior hashes.
Runtime listQueryLimits SHALL remain separate from model definitions and all structural/full/public projection hash inputs; deploying the same model on Node or Cloudflare SHALL NOT cause a configuration hash or sync change solely due to search policy. Synchronization SHALL use the persisted public-identity baseline and legacy
proof rules in collection-query-options to decide public-state/build impact;
projection-only SHALL NOT by itself imply that all display changes skip builds.

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

#### Scenario: Query options change only projection identity
- **WHEN** sortableFields, filterableFields or searchableFields changes without a content schema change
- **THEN** projection hashes change, structural hashes and required model version remain unchanged, and synchronization reports a display-only change without content rewrites

#### Scenario: Query options preserve public identity
- **WHEN** a collection's only change is to enable, edit, reorder or remove listOptions
- **THEN** its full projection hash changes for a different normalized projection, its public-projection hash remains equal, and its structural hash and model version stay unchanged

#### Scenario: Public metadata remains part of public identity
- **WHEN** listOptions changes together with an SEO fallback mapping or model label
- **THEN** the public-projection hash changes while listOptions remains excluded only at the root collection descriptor

#### Scenario: Internal public identity preserves serialized hash compatibility
- **WHEN** an old configuration without listOptions is normalized with the new internal identity
- **THEN** prior structural/full projection hashes and serialized metadata are unchanged, the runtime public hash equals the model full projection hash, and no internal public hash is exposed through REST metadata

#### Scenario: Adding, switching or removing an icon changes display identity
- **WHEN** a model changes only its root `icon`, including adding it, switching
  between a name and an emoji, or removing it
- **THEN** the model and configuration full projection hashes change and the
  structural hashes, model version, and model public projection hash remain equal

#### Scenario: An icon-named content field remains structural
- **WHEN** only a field named `icon` or a default-value property named `icon`
  changes its structure or default value
- **THEN** the canonical structure retains that field or property and the
  change is reflected in the structural and public projection hashes
