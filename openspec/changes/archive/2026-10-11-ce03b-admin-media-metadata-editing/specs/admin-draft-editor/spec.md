## ADDED Requirements

### Requirement: Selected media shows its alt text
A model or block media field holding a resolved item SHALL show the item's alt
text next to its filename, truncated to one line with the full text available,
or state that the item has no alt text. The alt text SHALL reflect the latest
loaded item, so a metadata change saved in the media library is shown without
reloading the editor.

#### Scenario: A selected image with alt text
- **WHEN** a block media field holds an active item whose alt text is
  "Red bicycle"
- **THEN** the selected media card shows the filename and "Red bicycle"

#### Scenario: A selected image without alt text
- **WHEN** a media field holds an active item without alt text
- **THEN** the selected media card states that the item has no alt text

### Requirement: Block alt text inherits the media alt text
A block whose definition has exactly one media field and a text field keyed
`alt` SHALL treat that `alt` field as an override of the selected media item's
alt text. While the block's media field holds a resolved item with alt text,
the `alt` field SHALL show "Uses media alt: " followed by that text as its
placeholder and SHALL expose the same text as part of its accessible
description. When the media field holds a resolved item without alt text and
the block's `alt` field is empty, the editor SHALL show a warning associated
with the `alt` field that the image has no alt text and will be presented as
decorative, unless alt text is added to the block or the media item. The
warning SHALL NOT block saving or publishing and SHALL disappear as soon as
either alt text is present. While the media item is loading, unreadable, or not
selected, the field SHALL show neither the placeholder nor the warning. Blocks
without that shape, and view-only editors, SHALL NOT show the warning.

#### Scenario: The media alt is inherited
- **WHEN** a writer chooses an item with alt text "Red bicycle" for an `image`
  block whose alt field is empty
- **THEN** the alt field's placeholder reads "Uses media alt: Red bicycle" and
  no warning is shown

#### Scenario: Both alt texts are missing
- **WHEN** an `image` block's alt field is empty and its media item has no alt
  text
- **THEN** a missing-alt warning is shown for the alt field, and the draft can
  still be saved and published

#### Scenario: Typing block alt text clears the warning
- **WHEN** the missing-alt warning is shown and the writer types alt text into
  the block's alt field
- **THEN** the warning disappears and the block's alt text is saved with the
  draft

#### Scenario: Media alt saved elsewhere is picked up
- **WHEN** the missing-alt warning is shown and the media item's alt text is
  then saved in the media library during the same session
- **THEN** the warning disappears and the placeholder shows the new media alt
  text

#### Scenario: Other blocks are unaffected
- **WHEN** a `hero` block holds media without alt text
- **THEN** no missing-alt warning is shown for the hero block
