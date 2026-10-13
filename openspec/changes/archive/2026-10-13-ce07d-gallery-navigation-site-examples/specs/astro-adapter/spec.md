## ADDED Requirements

### Requirement: Block lists render a published global's blocks
The block-list component SHALL accept a published global from the
published-site view as its entry, exactly as it accepts a published page or
collection entry, so a layout can render site-wide blocks through the site's
block map without an additional CMS request. Global blocks SHALL render in
their stored order with the same props, hidden-block rule, image describer
over the export's resolved media, and coded render errors, which SHALL name
the global's model key and entry identifier.

#### Scenario: A layout renders a navigation global
- **WHEN** a layout passes `site.global("navigation")` with two visible
  navigation blocks and one hidden block to the block list
- **THEN** the output is the two visible blocks' component output in order

#### Scenario: A global block fails validation
- **WHEN** a published global contains a block whose type the map does not
  contain
- **THEN** rendering fails with `unknown_block_type`, the global's model key,
  its entry identifier and the block key
