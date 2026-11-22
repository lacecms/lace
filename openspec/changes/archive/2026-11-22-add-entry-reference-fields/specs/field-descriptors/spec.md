## MODIFIED Requirements

### Requirement: Field type capabilities are declared once

The content package SHALL publish one portable, frozen capability declaration
keyed by field kind and total over every supported kind, including group and
list. For each kind it SHALL state whether the kind is list-queryable (usable
as a list column, sort target and filter target), its sort family (string,
number, boolean, date or datetime) and filter kind when list-queryable,
whether it is searchable, whether it may supply SEO text, whether it may be a
list item label, whether it accepts a placeholder, and the JSON kind of its
default value (string, number, boolean, object or array). The declaration
SHALL also state the filter operators of each filter kind.

The declared values SHALL match the following table:

| Kind | List-queryable | Sort family | Filter operators | Searchable | SEO text | Item label | Placeholder | Default value |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| text | yes | string | contains, eq | yes | yes | yes | yes | string |
| textarea | yes | string | contains, eq | yes | yes | yes | yes | string |
| url | yes | string | contains, eq | no | no | yes | yes | string |
| select | yes | string | in | no | no | yes | yes | string |
| number | yes | number | eq, range | no | no | no | yes | number |
| boolean | yes | boolean | eq | no | no | no | no | boolean |
| date | yes | date | range | no | no | no | no | string |
| datetime | yes | datetime | range | no | no | no | no | string |
| richText | no | — | — | no | no | no | yes | object |
| media | no | — | — | no | no | no | no | string |
| reference | no | — | — | no | no | no | no | string |
| group | no | — | — | no | no | no | no | object |
| list | no | — | — | no | no | no | no | array |

Every list-queryable kind SHALL also support the `isSet` and `isNotSet`
filter operators. A kind that is not list-queryable SHALL have no sort family
and no filter kind.

Configuration normalization, metadata schemas, collection queries, persistence
and the admin SHALL derive their type-specific eligibility from this
declaration instead of keeping their own lists of field kinds. Statically
typed configuration (operation-compatible list option keys, SEO field keys)
SHALL derive its permitted kinds from the same declaration. The admin SHALL
keep one support declaration keyed by field kind and total over every
supported kind, covering validation messages, list cells, filter controls,
item summaries, guidance and new list item values, so that a kind without
declared admin support fails type checking.

#### Scenario: The declaration matches accepted behavior

- **WHEN** the capability declaration is read for every supported field kind
- **THEN** each kind's values equal the table above and the declaration
  cannot be mutated at runtime

#### Scenario: Eligibility follows one declaration

- **WHEN** configuration names a URL field in `searchableFields`, as an SEO
  title source or as an item label of a group-valued list
- **THEN** the first two are rejected and the third is accepted, with the
  same error messages and paths as before the declaration existed

#### Scenario: A new kind must declare its capabilities

- **WHEN** a test-only scalar field kind is added to the field kind union
  and the descriptor union without any other edit
- **THEN** type checking fails only inside the content package and at the
  admin's field type support and built-in control declarations, and no
  `config`, `contracts`, `application`, `db`, server or other admin module
  reports an error

#### Scenario: No copied lists of field kinds remain

- **WHEN** the workspace source, excluding tests, is scanned for literal
  lists of two or more field kinds
- **THEN** the only matches are the content capability declaration and the
  admin support declaration

## ADDED Requirements

### Requirement: Reference descriptors select entries of declared models

The content package SHALL expose `field.reference({ models, ...common })` as a
scalar field with type `reference` and an inferred opaque entry ID string.
The `models` option SHALL be a nonempty array of unique valid model keys.
Normalization SHALL detach the array and sort by model key for projection and
structural identity. Equivalent orders SHALL produce identical hashes. The
builder SHALL preserve literal model-key types for statically supplied lists.
The fully assembled configuration SHALL reject unknown and global target
models at the declaring descriptor path, including block fields. A page or
collection model key SHALL be valid regardless of a collection route or
declaration order. A collection MAY name itself as a target model.

The field SHALL work in model and global fields, block data and every supported
group/list position. The existing common options, rename-hint scope and
ordinary list bounds SHALL apply. A reference SHALL carry only the raw
case-sensitive target ID, following the existing bounded opaque entry-ID
grammar. Normalization SHALL preserve it exactly. Scalar and enclosing
composite defaults SHALL validate its JSON type and ID grammar without
requiring a content database. Materializing a value SHALL enforce the same
target and graph rules as an explicit selection. Block settings, visibility
controllers, collection list columns, search/filter/sort keys, SEO mappings
and list item labels SHALL continue to accept only their eligible kinds.
Fields defined without references SHALL retain their existing encodings
and hashes.

#### Scenario: A list preserves editorial order and repeated choices
- **WHEN** a service's list of references to the route-less `reviews` collection holds `["r2", "r1", "r2"]`
- **THEN** it infers an ordered list of ID strings, preserves all three occurrences in that order and applies the declared list bounds to all three

#### Scenario: The whole configuration validates forward and same-model declarations
- **WHEN** a model names a permitted page declared later and names itself in a related-projects field
- **THEN** both descriptors validate and the entry-level cycle rules still apply when writing values

#### Scenario: Malformed or unavailable target models
- **WHEN** a forged descriptor or project configuration supplies an empty list, a repeated key, a malformed model key, a global or an unknown model
- **THEN** the appropriate metadata or complete-configuration boundary rejects it at the declaring field, including a nested block field

#### Scenario: Model order and value order have distinct meaning
- **WHEN** the order of two allowed model keys changes without a membership change
- **THEN** the normalized configuration and hashes are unchanged, while reordering the stored items of a reference list does change its content

#### Scenario: Defaults and metadata cross a portable boundary
- **WHEN** a reference default contains raw ID `a/b` or an enclosing group default contains that value, and the descriptor makes a JSON round trip
- **THEN** the metadata preserves that ID and its target model set, and an object, empty string or malformed ID at that position fails validation
