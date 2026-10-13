# content-model-configuration Specification

## Purpose

Defines the portable content-model configuration contract that lets a Lace
installation describe typed pages and collections with deterministic public
routes and configuration identity hashes.

## Requirements

### Requirement: Typed, stable content-model definitions
The system SHALL let configuration code define page and collection models with
stable lowercase kebab-case keys, a positive integer version, optional display
label and description, typed field descriptors, allowed block-type keys, an
optional explicit `renamedFrom` key, and the optional temporary
synchronization hints `removedFields` (root field keys or nested schema paths)
and `removedBlocks` (block types). A model field MAY declare a field-level
`renamedFrom` hint naming its former sibling field key. A page SHALL contain one fixed path; a collection SHALL
contain one route pattern. The configuration result SHALL preserve field value
inference, reject malformed definitions, reject duplicate model keys and
duplicate `renamedFrom` sources, and reject every allowed block type not
present in the supplied block registry. It SHALL reject a field rename hint
that names the field's own key, a configured sibling field key, or a former key that
another field of the same sibling map also names. It SHALL reject a
`removedFields` entry that is not a valid root key or nested schema path, is
repeated after normalization, is a configured field address, or is a field
rename source, and a `removedBlocks` entry that is not a valid block
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
`description` or `itemLabel`. A list descriptor's optional `itemLabel` SHALL also be removed only at descriptor positions;
field keys and default-value keys named `itemLabel` SHALL remain structural.
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

### Requirement: Global models are route-less configuration singletons
The system SHALL let configuration code define a `global` model with
`defineGlobal`, accepting the same stable key, version, optional label and
description, typed fields, allowed block types and temporary synchronization
hints (`renamedFrom`, `removedFields`, `removedBlocks`) as a page, with the
same validation. A global SHALL have no path, route or `listFields`, and
configuration SHALL reject a global definition that supplies one of them.
Model keys SHALL be unique across pages, collections and globals, and a
`renamedFrom` source SHALL not repeat any configured key of any kind. A global
SHALL take part in no path or route collision check. The normalized model, the
runtime projection and the public projection SHALL carry `kind: "global"`, and
both the structural and projection hashes SHALL include the kind, so changing
a model's kind changes its structural hash.

#### Scenario: Define a global model
- **WHEN** configuration defines `defineGlobal({ key: "settings", version: 1, label: "Site settings", fields: { siteName: field.text({ required: true }) } })`
- **THEN** the normalized configuration contains a `global` model `settings`
  with that field, no path or route, and deterministic hashes

#### Scenario: Reject a key shared with another kind
- **WHEN** a page and a global both use the key `settings`
- **THEN** configuration normalization fails and names the duplicate key

#### Scenario: Reject routing options on a global
- **WHEN** a global definition supplies `path`, `route` or `listFields`
- **THEN** configuration normalization fails before application startup

#### Scenario: A kind change changes the structure
- **WHEN** two otherwise identical definitions with the same key are declared
  once as a page without blocks and fields and once as a global
- **THEN** their structural hashes differ

### Requirement: Routable models opt into the SEO system group
Configuration code SHALL be able to enable per-entry SEO metadata on a page or
collection with `seo: true`, or with `seo: { description?, image? }` naming
fallback fields of the same model. `seo: false` or an absent option SHALL mean
SEO is disabled. A named `description` field SHALL exist on the model and be a
`text` or `textarea` field. A named `image` field SHALL exist and be a `media`
field. Configuration SHALL reject unknown keys in the object, a reference to
an undeclared field, a field of an incompatible type, and `seo` on a global.
The normalized model SHALL record an enabled group with its mapping. A model
without SEO SHALL carry no `seo` property, so existing models keep their
hashes. Whether SEO is enabled SHALL be part of the structural hash. The
fallback mapping SHALL be excluded from the structural hash and included in
the projection hash and the public projection, like `listFields`.

#### Scenario: Enable SEO with fallback fields
- **WHEN** a collection declares `fields: { excerpt: field.textarea(), cover: field.media() }` and `seo: { description: "excerpt", image: "cover" }`
- **THEN** the normalized model and its public projection carry SEO enabled
  with that mapping

#### Scenario: Enable SEO without a mapping
- **WHEN** a page declares `seo: true`
- **THEN** the normalized model carries SEO enabled with no fallback fields

#### Scenario: Reject an incompatible fallback field
- **WHEN** `seo.image` names a `text` field, or `seo.description` names a
  `media`, `richText` or undeclared field
- **THEN** configuration normalization fails and names the model and field

#### Scenario: Reject SEO on a global
- **WHEN** a global definition supplies `seo`
- **THEN** configuration normalization fails before application startup

#### Scenario: Enabling SEO is structural, the mapping is not
- **WHEN** two otherwise identical models differ only in `seo: true` versus no
  `seo`
- **THEN** their structural hashes differ
- **WHEN** two otherwise identical models with SEO enabled differ only in
  their fallback mapping
- **THEN** their structural hashes are equal and their projection hashes differ

#### Scenario: Models without SEO keep their hashes
- **WHEN** a model that declares no `seo` option is normalized
- **THEN** its structural and projection hashes equal those computed before
  the SEO option existed

### Requirement: One global may declare site SEO defaults
A global SHALL be able to declare
`seoDefaults: { siteName, titleTemplate?, description?, image? }`. Each value
names a field of that global. `siteName`, `titleTemplate` and `description`
SHALL name `text` or `textarea` fields, and `image` SHALL name a `media`
field. Configuration SHALL reject a missing `siteName`, unknown keys, an
undeclared or incompatible field, `seoDefaults` on a page or collection, and a
second global that declares `seoDefaults`. `seoDefaults` SHALL be excluded
from the structural hash and included in the projection hash and the public
projection. No storage other than the global's own entry SHALL hold the
defaults.

#### Scenario: Declare site defaults on the settings global
- **WHEN** the `settings` global declares fields `siteName`, `titleTemplate`,
  `metaDescription` and `shareImage`, and
  `seoDefaults: { siteName: "siteName", titleTemplate: "titleTemplate", description: "metaDescription", image: "shareImage" }`
- **THEN** the normalized global and its public projection carry that mapping

#### Scenario: Reject two defaults globals
- **WHEN** two globals both declare `seoDefaults`
- **THEN** configuration normalization fails and names both model keys

#### Scenario: Reject defaults outside a global
- **WHEN** a page or collection declares `seoDefaults`
- **THEN** configuration normalization fails

#### Scenario: Changing the defaults mapping is projection-only
- **WHEN** a global's `seoDefaults` mapping changes and nothing else does
- **THEN** its structural hash is unchanged and its projection hash changes

### Requirement: Disabling SEO with stored data requires an explicit hint
A page or collection SHALL accept the temporary synchronization hint
`removedSeo: true`. Like the other hints, it SHALL be excluded from the
canonical structure, both hashes and the public projection. Configuration
SHALL reject `removedSeo` on a model that enables `seo` or on a global, and
any value other than `true`.

#### Scenario: Declare the hint after disabling SEO
- **WHEN** a collection that no longer declares `seo` declares `removedSeo: true`
- **THEN** normalization succeeds and its hashes equal those of the same model
  without the hint

#### Scenario: Reject the hint while SEO is enabled
- **WHEN** a model declares both `seo: true` and `removedSeo: true`
- **THEN** configuration normalization fails

### Requirement: Composite metadata and identity remain portable and compatible
Pages, collections and globals SHALL accept validated composites in their model
fields and block data. The runtime and public projections SHALL retain recursive
metadata. Structural identity SHALL exclude display labels/descriptions and list `itemLabel` at every
descriptor position and preserve child keys and all default-value keys, including
`label`, `description` and `itemLabel`. Nested display-only changes SHALL be projection-only.
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

### Requirement: Nested model synchronization hints use schema paths
Model field normalization SHALL accept `renamedFrom` on every named root or group child field, including group children reached through lists. It SHALL name a former sibling key, never a path or index. Internal rename mappings SHALL use root keys for root fields and absolute schema pointers for descendants. Model `removedFields` SHALL accept legacy root keys and absolute schema pointers whose named segments obey the field-key grammar and whose `*` segment selects every list item. `/links/*/legacy` SHALL select `legacy` in every group item of `links`; `/profile/legacy` SHALL select a group child. `/title` and `title` SHALL normalize to the same root address. An item itself SHALL NOT be a removal target.

Hints SHALL be temporary synchronization input, recursively absent from admin/public field metadata, runtime field descriptors, structural identity and projection identity; runtime model synchronization mappings SHALL retain them. Duplicate normalized paths, configured removal targets, shared rename sources within one sibling map, self-renames and rename-source/removal overlap SHALL fail before startup. Invalid path grammar, indices, misplaced wildcards and cross-parent rename paths SHALL be rejected. Removal paths SHALL be resolved against the paired baseline/configuration during planning; a valid path absent from the baseline SHALL be inert, while traversing a known non-container or using `*` at a known non-list SHALL be invalid.

Nested removal paths SHALL use configured ancestor names. The planner SHALL map renamed ancestors to baseline names before evaluating child hints. Overlapping ancestor/descendant removals SHALL be rejected as redundant; a removal below a renamed ancestor SHALL be permitted. Nested hints on a newly added ancestor SHALL be rejected because there is no former sibling context. Already-applied hints SHALL be inert under the existing baseline rules.

#### Scenario: Rename and remove in every list item
- **WHEN** `links` has group children `title` renamed from `headline` and omits `legacy`, and the model declares `removedFields: ["/links/*/legacy"]`
- **THEN** normalization retains the two synchronization paths, strips the child hint from all projected descriptors and leaves data/default keys intact

#### Scenario: Preserve root compatibility
- **WHEN** a model uses the existing root `renamedFrom` and `removedFields: ["legacy"]` syntax
- **THEN** its normalized hints and scalar configuration hashes remain compatible

#### Scenario: Reject ambiguous addresses
- **WHEN** hints use `/links/0/title`, `/links/*`, `profile.title`, a cross-parent rename, duplicate `title` and `/title` removals or a rename source also removed
- **THEN** normalization refuses the hints and names the offending path

#### Scenario: Parent and child rename
- **WHEN** `cards` is renamed from `links` and its child `title` is renamed from `headline`, with removal `/cards/*/legacy`
- **THEN** planning pairs the ancestors first and resolves both child operations against former `links` items

#### Scenario: Repeat with retained hints
- **WHEN** synchronization already applied those nested hints and an unrelated structural change is planned
- **THEN** the retained hints do not repeat the rewrite or cause a missing-source diagnostic

### Requirement: List item labels are projection-only metadata
Valid list `itemLabel` metadata SHALL survive runtime, admin and public metadata
projection in model fields and block data at any permitted depth. Adding,
changing or removing it SHALL change projection identity only, without a
model/block version bump, content migration or content write. Structural
canonicalization SHALL remove it only at list descriptor positions, preserving
field keys and default data named `itemLabel`. Configurations without this
option SHALL retain existing encodings and hashes.

#### Scenario: Display change inside block data
- **WHEN** a block's nested group-valued list changes itemLabel from title to caption without a version change
- **THEN** model and whole-configuration structural hashes remain equal, projection hashes change and synchronization accepts a projection-only update

#### Scenario: Preserve content keys
- **WHEN** a group child named itemLabel changes its constraints or a default object's itemLabel value changes
- **THEN** structural identity changes and those keys remain in the canonical structure

#### Scenario: Existing configuration compatibility
- **WHEN** scalar and composite fixtures without itemLabel are normalized
- **THEN** their existing hashes and metadata encodings remain unchanged
