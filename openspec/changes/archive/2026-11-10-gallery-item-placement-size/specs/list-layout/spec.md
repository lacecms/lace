## ADDED Requirements

### Requirement: Grid presets have stable responsive meaning
Grid presets SHALL use the list's available container width, preserve document
order and avoid dense packing or CSS order overrides. Their default behavior
SHALL be:

| Preset | Behavior |
| --- | --- |
| `auto` | As many equal columns as fit, using a preferred minimum item width of 14rem, capped to available width |
| `columns-2` | One column below 32rem; two equal columns from 32rem |
| `columns-3` | One below 32rem; two from 32rem; three from 48rem |
| `columns-4` | One below 32rem; two from 32rem; three from 48rem; four from 64rem |
| `narrow-wide` | One below 32rem; alternating columns of 1fr and 2fr from 32rem |
| `wide-narrow` | One below 32rem; alternating columns of 2fr and 1fr from 32rem |

Thresholds SHALL apply inclusively. Item heights SHALL follow content, without an
imposed aspect ratio or cropping. Incomplete rows SHALL leave unused tracks
empty; presets SHALL give no item a span, and only an item's own placement SHALL
change its tracks. Empty and single-item lists SHALL remain valid render inputs
without placeholder content.

#### Scenario: Presets respond to their container
- **WHEN** a `columns-4` list is placed in containers of 28rem, 40rem, 56rem and 70rem
  within the same wide page
- **THEN** it has one, two, three and four columns respectively

#### Scenario: Asymmetric grid repeats without reordering
- **WHEN** five items use `narrow-wide` in a container at least 32rem wide
- **THEN** they fill rows in stored order into 1fr/2fr columns and the fifth
  item occupies only the first column of its final row

#### Scenario: Presets collapse to one column
- **WHEN** five items use `columns-2` at 40rem and then 28rem
- **THEN** they fill two columns in stored order at 40rem and become an
  ordinary single column at 28rem

### Requirement: List items choose their grid placement
The public content configuration API SHALL provide a reusable item field with
key `placement`: a required select with options `auto`, `full`, `start` and
`end`, default `auto`, labelled "Placement" with choice-card presentation (each
choice with a label, a description and a schematic diagram) and a description
stating that placement applies to grid lists only. An absent value SHALL mean
`auto`. A list block SHALL adopt it explicitly in its item group; adoption SHALL
need no admin change.

In `grid` mode, for every preset and column count, the installed structural
stylesheet SHALL place an item marked `data-lace-placement="start"` in the first
column, `end` in the last column and `full` across all columns, and SHALL leave
`auto` to ordinary placement. Placement SHALL preserve stored order and SHALL NOT
use dense packing or CSS order: tracks skipped to honor a placement stay empty,
and the next item continues after the placed item. With one column every
placement SHALL occupy that column. In `flex-row` and `flex-column` modes the
value SHALL be retained, saved and validated but SHALL have no effect.

#### Scenario: Right column only
- **WHEN** a `columns-2` list at 40rem holds items with placements `end`,
  `auto` and `auto`
- **THEN** the first item occupies only the second column of the first row,
  the first column of that row stays empty, and the other two items fill the
  second row in stored order

#### Scenario: Any item spans the row
- **WHEN** a `columns-3` list at 56rem holds five items whose third item is
  `full`
- **THEN** the first two items share the first row, the third spans all three
  columns of the second row, and the last two continue in the third row

#### Scenario: Start begins a row
- **WHEN** a `columns-3` list at 56rem holds an `auto` item followed by a
  `start` item
- **THEN** the second item starts the next row in the first column

#### Scenario: Placement in narrow and flex lists
- **WHEN** the same items render in a 28rem `columns-2` list and then in
  `flex-row`
- **THEN** the grid is one column with every item in it, and the flex list
  ignores placement while the stored values remain unchanged

#### Scenario: An undeclared placement
- **WHEN** an item submits `placement` `center`
- **THEN** draft save fails at that item's `placement` path

## MODIFIED Requirements

### Requirement: Lists share ordinary scalar layout settings
The public content configuration API SHALL provide reusable settings with keys
`layoutMode`, `layoutWrap` and `layoutPreset`. `layoutMode` SHALL accept
`flex-row`, `flex-column` and `grid`, defaulting to `grid`; `layoutWrap` SHALL be
boolean with default `true`; `layoutPreset` SHALL accept `auto`, `columns-2`,
`columns-3`, `columns-4`, `narrow-wide` and `wide-narrow`, defaulting to `auto`;
`featured-first` SHALL be rejected as an undeclared value. Mode and preset choices SHALL have human-readable labels,
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

### Requirement: Structural layout CSS remains site-owned and overridable
An adopting renderer SHALL mark its existing outer element with
`data-lace-layout-container`, its list with `data-lace-layout` (the mode),
`data-lace-wrap` (`true` or `false`) and `data-lace-preset` (the preset), and its
direct items with `data-lace-layout-item` and, when the list adopts the item
placement field, `data-lace-placement` (the item's effective placement). These attributes SHALL be escaped
from validated settings, without accepting arbitrary authored attributes.
Existing block, part, class-name and anchor hooks SHALL be preserved.

The installed stylesheet SHALL implement these hooks for arbitrary adopting
lists using normal rules in the `lace-layout` cascade layer and zero-specificity
selectors. It SHALL expose `--lace-list-gap` (default 0) and
`--lace-list-item-min` (default 14rem) on the list. Structural rules SHALL be
limited to container queries, display, flex/grid sizing and placement, gap,
minimum-size overflow safeguards and neutral list margin/padding/marker resets.
They SHALL NOT set colors, fonts, borders, shadows, decorative radii, image
aspect ratios/cropping, or inline layout styles, and SHALL use no `!important`.

The source component SHALL contain no authored `<style>` or `<script>` element.
Developers SHALL be able to override layout through site CSS alone, including
replacing display or preset track definitions. Default styles SHALL be scoped
to explicitly marked lists and their own direct items; nested unrelated lists
SHALL remain unaffected.

#### Scenario: Developer replaces the layout with CSS only
- **WHEN** site-owned unlayered CSS selects a Gallery items part and changes
  display, gap and track sizing
- **THEN** it overrides the installed structural CSS without `!important`,
  modifying CMS data or editing the component source

#### Scenario: Shared CSS serves an unrelated list
- **WHEN** a custom card-list renderer emits the same hooks and loads the
  installed stylesheet
- **THEN** all presets work without Gallery selectors or media-specific rules

#### Scenario: Nested unrelated list
- **WHEN** a card contains an unmarked nested list
- **THEN** the structural stylesheet does not reset or rearrange that nested list

## REMOVED Requirements

### Requirement: Seven grid presets have stable responsive meaning
**Reason**: The `featured-first` preset is removed; any item can span the row with `placement: full`.
**Migration**: Replaced by "Grid presets have stable responsive meaning" (six presets). A block that stored `featured-first` migrates it to `columns-2` and sets its first item's `placement` to `full`, as Gallery version 6 does.
