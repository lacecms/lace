## ADDED Requirements

### Requirement: Select fields support portable choice-card presentation
Select descriptors SHALL accept optional `presentation` metadata with exactly
`control: "cards"` and a `choices` array. Each choice SHALL contain a declared
string `value`, a nonempty plain-text `label`, optional plain-text `description`
and optional `diagram`. Choices SHALL cover every option exactly once; rendered
order SHALL follow `options`, independently of presentation array order.
Other field kinds SHALL reject `presentation`. Existing select options, literal
value inference, defaults, required checks and submitted value validation SHALL
retain their behavior. Omission SHALL add no property and preserve the existing
select UI. Metadata SHALL be normalized, detached, deeply readonly portable JSON
at every supported descriptor position and validated at forged-metadata boundaries.

A diagram SHALL be exactly an object with a `cells` array of 1–16 rectangles,
each containing integer `x`, `y`, `width` and `height` in a fixed 12 by 12 logical
canvas. Coordinates SHALL be nonnegative, sizes positive and rectangle edges
within the canvas; overlapping rectangles SHALL be rejected. Unknown properties,
duplicate/unknown/missing choice values, malformed text and nonportable values
SHALL fail with a descriptive descriptor path. Diagrams SHALL contain no URLs,
media IDs, HTML, SVG markup, CSS, executable code or user-selected colors.

#### Scenario: Serialize nested choice cards
- **WHEN** a select inside a group/list item or declared setting has valid card
  choices and diagrams
- **THEN** metadata survives JSON serialization unchanged and its inferred value
  type remains the union of the original option strings

#### Scenario: Reject malformed card metadata
- **WHEN** presentation misses an option, repeats a value, names an unknown value,
  supplies a blank label, includes an out-of-bounds/overlapping rectangle, or is
  placed on a boolean field
- **THEN** normalization and forged REST metadata validation reject it and name
  the affected descriptor path

#### Scenario: Cards do not change submitted values
- **WHEN** a user selects a card labelled "Three columns" whose value is `columns-3`
- **THEN** validation receives only `columns-3`; no label, diagram or presentation
  object is part of the authored value

#### Scenario: Existing select remains unchanged
- **WHEN** a select declares no presentation metadata
- **THEN** its normalized representation and existing dropdown behavior remain unchanged
