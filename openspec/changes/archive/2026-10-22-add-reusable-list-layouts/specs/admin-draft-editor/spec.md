## ADDED Requirements

### Requirement: Generic select cards show static composition diagrams
The admin SHALL render a select with card presentation as one labelled,
single-selection radio group through the existing generic field controls. Each
card SHALL show its plain-text label, optional description and optional diagram
as neutral rectangles. Diagram rendering SHALL use metadata only: no media
reads, uploaded-image previews, site components, block-type branching or layout
setting-name branching. Mode and preset fields SHALL each own an independent
group. Missing diagrams SHALL leave a usable text card.

The selected card SHALL be identifiable beyond color. Keyboard users SHALL
enter/leave the group through ordinary Tab navigation, move and select with
arrow keys (wrapping at the ends), use Home/End for first/last choices and select
the focused choice with Space. An optional absent select SHALL offer a labelled
"No selection" choice. Disabled/busy and read-only states SHALL respect the
existing editing locks and authorization; viewers SHALL read the chosen label
and description without mutation controls. Diagrams SHALL be decorative, with
labels/descriptions providing accessible meaning. Group errors and field guidance
SHALL remain associated and validation-summary links SHALL focus the selected
radio or the first available radio when no value is selected.

Cards SHALL reflow without clipping or page-level overflow at 320px and larger,
support both admin themes, and keep every action usable without hover. Selection
SHALL update one ordinary string field and follow existing dirty comparison,
save/discard/revert, duplicate, block-move and conflict retention behavior.
Inapplicable list layout settings SHALL remain visible with explanatory guidance;
the change SHALL NOT introduce conditional visibility or validation.

#### Scenario: Generic custom block and nested field
- **WHEN** a custom block setting and a select inside a list item use card metadata
- **THEN** both use the same control and retain independent values and focus
  without any custom block editor

#### Scenario: Thumbnails without content
- **WHEN** Gallery is empty and its settings are opened
- **THEN** all three modes and all seven presets have schematic thumbnails and
  labels without loading any media or previewing the public site

#### Scenario: Keyboard selection and ordinary saving
- **WHEN** a writer focuses the mode group, uses arrows to choose horizontal,
  disables wrap and saves
- **THEN** the save includes the selected scalar values, normal dirty state
  clears on success, and thumbnails are absent from the content payload

#### Scenario: Server problem links to a choice
- **WHEN** the server reports an issue at a layout setting and the writer
  activates it in the summary
- **THEN** Settings opens, containing form tabs/disclosures open and the correct
  radio control receives focus with its error description

#### Scenario: Read-only and lifecycle locking
- **WHEN** a viewer reads layout settings or a writer is saving/publishing
- **THEN** the viewer has readable labels without mutation affordances and the
  writer cannot change cards during the lifecycle request

#### Scenario: Conflict retains layout edits
- **WHEN** two writers save from the same draft revision and one save conflicts
- **THEN** the losing writer keeps the chosen mode, wrap and preset locally and
  receives the existing conflict recovery UI without overwriting the winner

#### Scenario: Mode switch retains all visible controls
- **WHEN** a writer switches from grid to flex at a narrow viewport
- **THEN** preset cards remain visible and editable with grid-only guidance,
  previous values remain intact and the page has no horizontal overflow
