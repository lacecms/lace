## ADDED Requirements

### Requirement: Typed portable composite field descriptors
The content package SHALL expose `field.group({fields, ...common})` and
`field.list({item, minItems?, maxItems?, ...common})`. Groups SHALL describe
plain objects with the existing field-key grammar; lists SHALL describe dense
ordered arrays of one scalar or group descriptor. Nested inference SHALL
preserve child keys, required/default property inference, arrays and literal
select choices. Definitions and metadata SHALL be detached immutable portable
JSON with exhaustive visitor handling for both new discriminants. Scalar
descriptor encodings and behavior SHALL remain unchanged.

#### Scenario: Infer nested values
- **WHEN** a list of groups declares a required `kind` select with choices `image` and `video` and an optional `caption` text
- **THEN** its inferred item has `kind: "image" | "video"` and optional string `caption`, and invalid choices or property types fail type checking

#### Scenario: Metadata is detached
- **WHEN** caller-owned child maps, list items or defaults are mutated after definition
- **THEN** the normalized composite and JSON-round-tripped metadata retain their original values

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
Nested rename hints SHALL be rejected pending the nested-evolution contract.

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
