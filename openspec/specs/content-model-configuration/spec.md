# content-model-configuration Specification

## Purpose

Defines the portable content-model configuration contract that lets a Lace
installation describe typed pages and collections with deterministic public
routes and configuration identity hashes.

## Requirements

### Requirement: Typed, stable content-model definitions
The system SHALL let configuration code define page and collection models with
stable lowercase kebab-case keys, a positive integer version, optional display
label and description, typed field descriptors, allowed block-type keys, and
an optional explicit `renamedFrom` key. A page SHALL contain one fixed path; a
collection SHALL contain one route pattern. The configuration result SHALL
preserve field value inference, reject malformed definitions, reject duplicate
model keys and duplicate `renamedFrom` sources, and reject every allowed block
type not present in the supplied block registry. `renamedFrom` SHALL be treated
as temporary metadata for an explicit later synchronization and SHALL NOT infer
a rename when it is absent.

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

### Requirement: Canonical page and collection routes
The system SHALL accept only canonical absolute page paths and collection route
patterns. A page path SHALL be fixed. A collection route SHALL contain exactly
one complete `:slug` segment and no other parameter segment. Paths and patterns
SHALL reject query strings, fragments, dot segments, duplicate slashes, and a
trailing slash other than the root path. The configuration SHALL reject duplicate
page paths, duplicate collection patterns, and a page path that matches a
collection route pattern.

#### Scenario: Normalize valid fixed and collection routes
- **WHEN** a page uses `/` or `/about` and a collection uses `/blog/:slug`
- **THEN** configuration retains those canonical paths and patterns

#### Scenario: Reject an ambiguous or unsafe route
- **WHEN** a path or pattern includes a query string, fragment, dot segment,
  duplicate slash, non-root trailing slash, missing slug placeholder, multiple
  slug placeholders, or another parameter segment
- **THEN** configuration normalization fails before application startup

#### Scenario: Reject a fixed-path collision visible in configuration
- **WHEN** two pages share a path, two collections share a pattern, or a page
  path matches a collection's slug route pattern
- **THEN** configuration normalization fails and identifies the conflicting
  model identities

### Requirement: Safe collection-route resolution
The system SHALL resolve a canonical collection route pattern with a submitted
slug only when the slug is lowercase ASCII letters or digits joined by single
hyphens and the resolved result remains a canonical absolute path. Resolution
SHALL substitute exactly the route's one slug segment and SHALL not interpret
the slug as another route segment, query string, fragment, or path traversal.

#### Scenario: Resolve a collection item path
- **WHEN** a collection route `/blog/:slug` is resolved with slug
  `release-notes`
- **THEN** the resolved public path is `/blog/release-notes`

#### Scenario: Reject an unsafe collection slug
- **WHEN** route resolution receives a slug with a slash, uppercase character,
  empty segment, query, fragment, or dot segment
- **THEN** resolution fails without producing a public path

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
presentation metadata and the temporary `renamedFrom` synchronization hint;
projection hashes SHALL include the complete serializable normalized
definition, including `listFields`, except `renamedFrom`. Each runtime model
SHALL carry its detached canonical structure and, when it differs from the
structural hash, the structural hash produced by the earlier rule that removed
every `label` and `description` key at any depth. Neither value SHALL appear in
the public projection or in any hash. Equal semantic configurations SHALL
produce equal hashes regardless of object insertion order.

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

### Requirement: Collection list fields
The system SHALL let a collection definition declare an optional ordered
`listFields` array naming the model's own fields that entry lists display.
Each name SHALL identify a field declared by the same collection whose type is
text, textarea, number, boolean, select, date, datetime, or URL. Configuration
SHALL reject a non-array value, a non-string or unknown name, a duplicate name,
and a rich-text or media field before application startup. An omitted or empty
`listFields` SHALL normalize to no list fields and SHALL leave the normalized
model without a `listFields` property. The normalized collection and its JSON
admin/public projection SHALL retain the declared order. Page definitions SHALL
not carry list fields. Typed configuration code SHALL restrict `listFields`
names to the collection's declared field keys.

#### Scenario: Declare list fields on a collection
- **WHEN** a collection with `author` text and `category` select fields
  declares `listFields: ["category", "author"]`
- **THEN** the normalized collection and its JSON projection contain
  `listFields` `["category", "author"]` in that order

#### Scenario: Reject an invalid list field
- **WHEN** a collection's `listFields` names an undeclared field, repeats a
  name, or names a rich-text or media field
- **THEN** configuration normalization fails with a configuration error before
  application startup

#### Scenario: Omit empty list fields
- **WHEN** a collection omits `listFields` or declares an empty array
- **THEN** its normalized model has no `listFields` property and its hashes
  equal those of the same model without the option
