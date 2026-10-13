## MODIFIED Requirements

### Requirement: Composite definitions have bounded finite structure
Every configuration, block and metadata boundary SHALL reject malformed or
cyclic descriptors before use. A branch SHALL contain at most six group/list
containers and at most two consecutive groups. Lists SHALL reset consecutive
groups but not depth and SHALL NOT have a list as their immediate item.
Scalar leaves and root field maps SHALL not count as containers. Rich-text
nodes SHALL not count. Reusing an acyclic descriptor SHALL be allowed.
List bounds SHALL be integers with effective defaults 0 and 100 and satisfy
`0 ≤ minItems ≤ maxItems ≤ 100`. Composite defaults SHALL pass recursive draft
validation of present values, safety and maxima; missing required descendants
and publication minima SHALL be permitted. Invalid defaults, children, unknown
options and non-portable values SHALL fail with descriptive descriptor paths.
Named child descriptors SHALL accept sibling-key `renamedFrom` hints for model-field synchronization. A list item descriptor itself SHALL NOT carry `renamedFrom`, because items have no field key. Block definitions SHALL reject rename hints anywhere in data or settings; block changes use versioned migrations. Model normalization SHALL extract child hints recursively before producing public or runtime field metadata.

#### Scenario: Depth boundary
- **WHEN** alternating list/group branches have six and seven containers respectively
- **THEN** six is accepted and seven is rejected before startup

#### Scenario: Consecutive group boundary
- **WHEN** branches contain group/group, group/group/group, and group/group/list/group/group
- **THEN** the first and third are accepted and the second is rejected

#### Scenario: Direct list nesting
- **WHEN** a list declares another list as its item, including through forged JSON metadata
- **THEN** normalization fails at the item descriptor

#### Scenario: Invalid schemas and defaults
- **WHEN** descriptors contain a cycle, a malformed child, an accessor, a non-finite default, an unsafe nested URL, null list items, bounds 2/1, a fractional bound or maxItems 101
- **THEN** normalization rejects each case before application startup

#### Scenario: Partial default
- **WHEN** a group default is `{}` and the group has a required child without a default
- **THEN** definition succeeds as a draft starting value and publication still requires the child

#### Scenario: Named child rename
- **WHEN** a model list of groups defines `title: field.text({ renamedFrom: "headline" })` in its item fields
- **THEN** the definition is accepted and the hint affects synchronization only, without changing inferred values

#### Scenario: Unnamed item or block hint
- **WHEN** a list item descriptor itself carries `renamedFrom`, or block data contains a named descendant with a rename hint
- **THEN** definition normalization rejects it with the descriptor path
