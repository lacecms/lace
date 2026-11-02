## ADDED Requirements

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

The declared values SHALL equal the behavior accepted before this
declaration existed:

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
