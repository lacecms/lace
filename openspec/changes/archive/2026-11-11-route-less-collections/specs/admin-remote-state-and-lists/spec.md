## MODIFIED Requirements

### Requirement: Collection lists present entry state without internal identifiers
Each collection entry row SHALL show the entry title as a link to its editor,
for a collection that declares a route the entry slug (or a neutral note when
it has none), the derived status (draft,
published, or changed), a value for each of the model's configured list fields
in configuration order, the publication date for published or changed entries,
and the relative last-edit time with the last editor's display name, with the
absolute time available to assistive technology and on hover. Rows of a
route-less collection SHALL show neither a slug nor a no-slug note. List-field
column headers SHALL use the field label, falling back to its key. List-field
values SHALL be formatted by field type: booleans as yes or no, numbers with
locale grouping, dates and datetimes as readable dates, select values by their
option, and missing values as a neutral dash. No list surface SHALL show an
entry ID or a user ID. Viewers, editors, and administrators SHALL see the same
row data.

#### Scenario: A changed entry with list fields
- **WHEN** the `posts` model declares list fields `category` (select, label
  "Category") and `featured` (boolean) and an entry titled "Launch" with slug
  `launch` has status `changed`, `category` "news", `featured` true, was
  published on 2026-09-20 and last edited two hours ago by "Ada Editor"
- **THEN** its row shows "Launch" linking to the entry editor, `launch`, a
  Changed status, "news" under "Category", "Yes" under "featured", the
  publication date, "2 hours ago", and "Ada Editor"

#### Scenario: A draft entry without optional values
- **WHEN** a draft entry has no slug, no value for a list field, and no
  publication
- **THEN** its row shows a neutral no-slug note and a dash for the missing list
  value and for the publication date

#### Scenario: Identifiers stay hidden
- **WHEN** any role views a collection list
- **THEN** no cell, header, or control label contains the entry ID or the
  editor's user ID

#### Scenario: A route-less collection list
- **WHEN** any role opens the list of the route-less `testimonials` collection
- **THEN** each row shows the title link, status, list-field values,
  publication date and last edit, and no slug cell, slug column or no-slug
  note
