## MODIFIED Requirements

### Requirement: Every structural change has one class
The system SHALL assign exactly one class to every structural change:

- `compatible`: adding a field; relaxing a constraint (removing or lowering
  `minLength`, removing or raising `maxLength`, removing or lowering `min`,
  removing or raising `max`, `required` → optional, adding a `select` option,
  adding a media kind to a media field's `accept`); adding, changing or
  removing a field `defaultValue`; allowing a new block type.
- `display`: reordering `select` options or the block allowlist without adding
  or removing an entry.
- `validated`: tightening a constraint on an existing or renamed field (adding
  or raising `minLength`, adding or lowering `maxLength`, adding or raising
  `min`, adding or lowering `max`, removing a `select` option, optional →
  required).
- `destructive`: removing a field, renaming a field through a hint, or removing
  a block type from the allowlist. A removal that a matching hint declares
  SHALL be marked as hinted.
- `migration`: changing the definition of a block type that both structures
  allow, including its version, fields or default value.
- `breaking`: changing a field type, including across a rename, removing a
  media kind from a media field's `accept`, changing a fixed path or
  collection route, or any other field-definition difference the system does
  not recognise.

A single field change that both relaxes and tightens SHALL be reported as one
`validated` change listing every changed property, except that a change that
removes a media kind from `accept` SHALL be reported as one `breaking` change
listing every changed property.

#### Scenario: Compatible additions are classified
- **WHEN** a model adds an optional field, a required field without a default,
  a required field with a default, raises a `maxLength`, adds a `select`
  option and allows a new block type
- **THEN** each change is reported as `compatible` and the defaulted field is
  marked for backfill

#### Scenario: Widening accepted media kinds is compatible
- **WHEN** a media field without `accept` changes to `accept: ["image",
  "video"]`
- **THEN** the change is reported as `compatible` and stored content is not
  scanned

#### Scenario: Narrowing accepted media kinds is breaking
- **WHEN** a media field with `accept: ["image", "video"]` changes to
  `accept: ["video"]`
- **THEN** the change is reported as `breaking`

#### Scenario: Tightening is classified as validated
- **WHEN** a model lowers a `maxLength`, removes a `select` option, or makes an
  optional field required
- **THEN** each change is reported as `validated`

#### Scenario: Type change is breaking
- **WHEN** a field keeps its key but changes from `text` to `number`, or a
  field renamed through a hint has a different type than its former field
- **THEN** the change is reported as `breaking`

#### Scenario: Hinted destructive changes are classified
- **WHEN** a model renames field `headline` to `title` through a hint, removes
  field `legacy` listed in `removedFields`, and disallows block type `quote`
  listed in `removedBlocks`
- **THEN** the rename is reported as one `destructive` `field-renamed` change
  and both removals are reported as hinted `destructive` changes
