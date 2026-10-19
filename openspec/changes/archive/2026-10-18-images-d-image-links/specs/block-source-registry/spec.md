## MODIFIED Requirements

### Requirement: Built-in image components render through the adapter image component
The `image` registry item (revision 6, block version 4), the `gallery` item
(revision 3, block version 3) and the `hero` item (revision 4, block version 1)
SHALL render every media image through the adapter's image component, keeping
the image element's `media` part, effective alt text, dimensions and
focal-point object position, and adding the component's variants and
placeholder. `image` SHALL pass the sizes `(min-width: 64rem) 60rem, 100vw`,
`gallery` the sizes `(min-width: 64rem) 20rem, (min-width: 32rem) 50vw, 100vw`
and `hero` the sizes `(min-width: 64rem) 60rem, 100vw` with eager loading. When
the block's `lightbox` setting is `true`, `image` and each `gallery` item SHALL
enable the lightbox with the identifier `lace-lightbox-<entry id>-<block key>`
for `image` and `lace-lightbox-<entry id>-<block key>-<item index>` for each
gallery item; with the setting `false` they SHALL render no button and no
dialog. When an `image` block or a `gallery` item has a `link`, its `media`
image SHALL be wrapped in an anchor with that `href` and the part `link`,
opening in the same browsing context, and that image SHALL render no
lightbox button or dialog even when the setting is `true`; the anchor's
accessible name SHALL be the effective alt text, or the caption when the alt
text is empty, or the link URL when both are empty. Images without a `link`
SHALL keep the lightbox behavior above. `hero` SHALL never render a lightbox. The components SHALL still carry
no `<style>` or `<script>` element.

#### Scenario: Image block with the lightbox on
- **WHEN** a site renders a version 4 `image` block with key `photo` of entry
  `e1` whose settings are `{ lightbox: true }`
- **THEN** its figure holds the `lightbox-trigger` button wrapping the `media`
  image, the dialog `lace-lightbox-e1-photo` with the original public URL, and
  the caption after them

#### Scenario: Gallery with the lightbox off
- **WHEN** a site renders a version 3 `gallery` block with the default settings
- **THEN** each item's figure holds only the optimized `media` image and its
  caption, with no button or dialog

#### Scenario: Gallery items open their own dialogs
- **WHEN** a gallery with key `shots` of entry `e1` and two items has the
  lightbox on
- **THEN** the items open `lace-lightbox-e1-shots-0` and
  `lace-lightbox-e1-shots-1` respectively

#### Scenario: Linked image takes precedence over the lightbox
- **WHEN** a version 4 `image` block with `link` `/work/kitchen`, alt text
  `Kitchen` and settings `{ lightbox: true }` is rendered
- **THEN** its figure holds an anchor `href="/work/kitchen"` with part `link`
  and accessible name `Kitchen` wrapping the `media` image, and no
  `lightbox-trigger` button or dialog

#### Scenario: Gallery mixes linked and lightbox items
- **WHEN** a gallery with key `shots` of entry `e1`, the lightbox on, and two
  items of which only the second has a `link` is rendered
- **THEN** the first item opens `lace-lightbox-e1-shots-0` and the second
  item is an anchor to its link with no dialog

#### Scenario: Linked image without alt text
- **WHEN** a linked gallery item has an empty effective alt text and the
  caption `Before`
- **THEN** its anchor carries the accessible name `Before`; without a caption
  the accessible name is the link URL

#### Scenario: Hero image loads eagerly
- **WHEN** a site renders a `hero` block with an image
- **THEN** the image element carries `loading="eager"` and
  `fetchpriority="high"` and no lightbox
