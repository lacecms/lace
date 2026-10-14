## ADDED Requirements

### Requirement: Visual field layouts are portable sibling metadata
A field-map owner SHALL accept optional `layout: { mode: "sections" | "tabs", groups: [{ key, label, description?, fields: [fieldKey, ...] }, ...] }`. Owners SHALL be models, block data, declared block settings (using `settingsLayout`) and group descriptors, including groups used as list items or reached through nested groups/lists at every permitted CE7 depth. The layout SHALL reference only immediate sibling keys; it SHALL NOT move content or change field paths, constraints, defaults, required status or depth/list budgets. Scalar descriptors and list descriptors themselves SHALL NOT accept layout. Omission SHALL retain declaration order. Listed fields SHALL follow group and field-array order; unlisted fields SHALL follow in declaration order, outside the declared sections or tab set, without being hidden.

Group keys SHALL obey the existing field-key grammar and be unique within one layout. Labels SHALL be nonempty after trimming. A supplied description SHALL be a string. A supplied layout SHALL have at least one group and each group at least one field. Unknown properties, malformed shapes, unsupported modes, unknown/non-string references, nested paths and repeated placement anywhere in one layout SHALL be rejected during normalization. TypeScript inputs SHALL restrict field references to the owner's immediate keys. Normalized layouts SHALL be detached, immutable JSON metadata.

#### Scenario: Order sections without creating objects
- **WHEN** fields `intro`, `body` and `credit` declare two sections listing `body` then `intro`
- **THEN** their controls follow that order with `credit` afterwards and their data keys remain unchanged

#### Scenario: Layout inside a list item
- **WHEN** a list's group item declares tabs for its immediate `label` and `url` children
- **THEN** each item has its own tab navigation without adding a tab key to the item value

#### Scenario: Reject ambiguous or invalid placement
- **WHEN** layout references an unknown key, a path `profile.name`, a repeated field across groups, a duplicate group key, an empty group or an unsupported property
- **THEN** normalization rejects the layout with owner/location information before startup

#### Scenario: Reject unsupported descriptor placement
- **WHEN** a scalar or list descriptor supplies layout, or a block settings layout names a block data field
- **THEN** normalization rejects the option

#### Scenario: Retain declaration order without layout
- **WHEN** an existing owner omits layout
- **THEN** its normalized metadata and field order remain unchanged
