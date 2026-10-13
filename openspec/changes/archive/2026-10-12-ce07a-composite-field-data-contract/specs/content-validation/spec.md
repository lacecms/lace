## ADDED Requirements

### Requirement: Composite values have recursive draft and publication semantics
Validation SHALL apply the selected mode recursively through groups and list
items, rejecting wrong present types, null, unknown keys, sparse arrays and
invalid scalar leaves in both modes. Absent fields SHALL use detached defaults
when declared. An absent optional container without a default SHALL stay
absent without visiting descendants. Present `{}` and `[]` SHALL override
container defaults. Present groups and group items SHALL receive child defaults.
Draft mode SHALL permit missing required descendants and lists below minItems;
publish mode SHALL reject those cases. A required list SHALL require presence,
not non-emptiness; `[]` SHALL be publishable unless minItems is positive.
Every list position SHALL contain a valid item irrespective of its descriptor's
required flag or default. Standalone field validation SHALL default to publish
semantics and support explicit draft validation. Existing scalar semantics
SHALL remain unchanged.

Issues SHALL retain deterministic typed key/index paths, with
`invalid_field_value`, `unknown_field`, `missing_required_field`,
`list_too_short` and `list_too_long` distinguishing failures.

#### Scenario: Optional absence does not require descendants
- **WHEN** an optional group with a required child and child defaults is absent with no group default
- **THEN** draft and publish validation leave the group absent without errors or synthesized data

#### Scenario: Present empty group
- **WHEN** that group is submitted as `{}`
- **THEN** child defaults are applied, draft permits other missing children, and publish rejects remaining required children at their leaf paths

#### Scenario: Required empty list
- **WHEN** a required list with no positive minimum is submitted as `[]`
- **THEN** both modes accept it, while omitting it fails only publication

#### Scenario: Publication minimum
- **WHEN** a list with minItems 2 holds one valid item
- **THEN** draft accepts it and publish fails with `list_too_short` at the list path

#### Scenario: Exact nested failure
- **WHEN** block index 0 has an images list whose item index 2 contains an invalid image value
- **THEN** the issue path is `["blocks", 0, "data", "images", 2, "image"]`

#### Scenario: Defaults do not repair present invalid items
- **WHEN** a list has an item default and contains null, undefined or a hole
- **THEN** both modes reject the item rather than replace it

### Requirement: Composite limits apply to normalized snapshots
Both modes SHALL enforce at most 100 elements per list, or the field's lower
maxItems, and at most 500 list elements across model fields and all block data
after defaults. Hidden blocks SHALL count and SHALL retain draft-mode required
and minimum validation during publication. Nested list lengths SHALL add
independently; rich-text arrays and the block array SHALL not count. Draft and
published snapshots SHALL have separate budgets. Exceeding the aggregate cap
SHALL fail with `too_many_list_items` at the first list crossing the cap in
fields-then-block order. Normalized fields and each normalized block data JSON
SHALL retain the existing byte cap. Limits SHALL not be bypassable by defaults
or direct server commands.

#### Scenario: Per-list boundary
- **WHEN** a list with the default maximum contains 100 or 101 valid items
- **THEN** 100 is accepted and 101 fails in draft and publish modes

#### Scenario: Aggregate boundary includes hidden blocks
- **WHEN** model fields and visible blocks consume 450 elements and hidden blocks consume 50 or 51
- **THEN** the first snapshot passes and the second fails with `too_many_list_items`

#### Scenario: Count nested lists
- **WHEN** 10 category items each contain a 20-element link list
- **THEN** they consume 210 elements

#### Scenario: Defaults cannot bypass limits
- **WHEN** omitted values receive defaults that make a list total 501 or push normalized block data above the existing byte limit
- **THEN** validation rejects the resulting snapshot before persistence
