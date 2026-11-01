## ADDED Requirements

### Requirement: Hidden fields are validated with draft semantics
Draft and publish validation of a field map SHALL first validate its
unconditional fields, then evaluate each visibility rule against the
normalized controller value of the same occurrence. A visible target SHALL be
validated with the selected mode exactly as before. A hidden target SHALL be
validated with draft semantics in both modes, recursively through its
subtree: it SHALL NOT be required, nested required descendants and `minItems`
SHALL NOT be enforced, and absence SHALL NOT be an error. Wrong present types,
null, unknown keys, sparse arrays, unsafe URLs, unsafe rich text, undeclared
select options, embed-provider restrictions, `minLength`, `maxLength`, `min`,
`max` and `maxItems` SHALL still fail at their ordinary paths. Hidden lists
SHALL count toward the per-snapshot list-element budget and JSON limits of
stored drafts. Issue codes and paths SHALL be unchanged. Standalone field
validation of a group value SHALL apply the group's rules. Node and
Cloudflare SHALL produce identical results and normalized output.

#### Scenario: Hidden required field may be empty at publication
- **WHEN** a published candidate's item has `kind: "image"`, a `media`, and no value for required `videoUrl`
- **THEN** publish validation succeeds

#### Scenario: Visible required field is still required
- **WHEN** the same item has `kind: "video"` and no `videoUrl`
- **THEN** publish validation fails with `missing_required_field` at that item's `videoUrl` path, while draft validation succeeds

#### Scenario: Hidden values keep draft constraints
- **WHEN** a hidden text target exceeds its `maxLength`, or a hidden URL target holds `javascript:alert(1)`
- **THEN** draft and publish validation both fail at the target's ordinary path without partial writes

#### Scenario: Hidden list below its minimum
- **WHEN** a hidden list with `minItems: 2` holds one valid item
- **THEN** publish validation succeeds, and it fails with `list_too_short` once its controller makes the list visible

#### Scenario: Invalid controller value
- **WHEN** a controller holds an undeclared option
- **THEN** validation fails at the controller's path with `invalid_field_value` and no target is treated as visible

#### Scenario: Block data rules
- **WHEN** block data declares visibility and an API caller saves the block on Node and on Cloudflare
- **THEN** both runtimes accept or reject the same values at the same `blocks/<index>/data` paths
