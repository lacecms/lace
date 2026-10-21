## MODIFIED Requirements

### Requirement: Lists share ordinary scalar layout settings
The public content configuration API SHALL provide reusable settings with keys
`layoutMode`, `layoutWrap` and `layoutPreset`. `layoutMode` SHALL accept
`flex-row`, `flex-column` and `grid`, defaulting to `grid`; `layoutWrap` SHALL be
boolean with default `true`; `layoutPreset` SHALL accept `auto`, `columns-2`,
`columns-3`, `columns-4`, `narrow-wide`, `wide-narrow` and `featured-first`,
defaulting to `auto`. Mode and preset choices SHALL have human-readable labels,
descriptions and static schematic thumbnails through generic select metadata.
The settings SHALL remain ordinary scalar block settings with existing validation
and inferred types, without Gallery-specific semantics in the field renderer.

Arrangement SHALL always remain visible. Wrap items SHALL be visible only for
`flex-row` and `flex-column`; Grid preset SHALL be visible only for `grid`,
except that a setting with a relevant validation problem SHALL be revealed until
its problem is resolved. Guidance SHALL explain applicability and the error-reveal
exception. Values unused
by the active mode SHALL be retained, saved, published and validated against
their descriptors, but SHALL have no effect on that mode's site layout.

#### Scenario: A second block adopts list layouts
- **WHEN** a project defines a card-list block using the reusable settings
- **THEN** it receives the same choices, defaults, validation and controls as
  Gallery without changing the admin or registering another block editor

#### Scenario: Switch modes without losing settings
- **WHEN** an editor selects `columns-3`, switches to `flex-row`, disables wrap
  and returns to `grid`
- **THEN** `columns-3` remains selected, wrap remains false and only the grid
  preset affects the grid's rendering

#### Scenario: Reject an invalid unused preset
- **WHEN** a flex-mode block submits `layoutPreset` with an undeclared value
- **THEN** draft save fails at that setting's ordinary validation path

#### Scenario: Grid controls
- **WHEN** a list uses `grid`
- **THEN** Arrangement and Grid preset are visible and Wrap items is absent from the visual and accessibility trees and keyboard navigation

#### Scenario: Flex controls
- **WHEN** a list uses either `flex-row` or `flex-column`
- **THEN** Arrangement and Wrap items are visible and Grid preset is absent from the visual and accessibility trees and keyboard navigation
