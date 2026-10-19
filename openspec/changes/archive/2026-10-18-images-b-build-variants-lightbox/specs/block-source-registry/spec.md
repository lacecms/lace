## ADDED Requirements

### Requirement: Built-in image components render through the adapter image component
The `image` registry item (revision 5, block version 3), the `gallery` item
(revision 2, block version 2) and the `hero` item (revision 4, block version 1)
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
dialog. `hero` SHALL never render a lightbox. The components SHALL still carry
no `<style>` or `<script>` element.

#### Scenario: Image block with the lightbox on
- **WHEN** a site renders a version 3 `image` block with key `photo` of entry
  `e1` whose settings are `{ lightbox: true }`
- **THEN** its figure holds the `lightbox-trigger` button wrapping the `media`
  image, the dialog `lace-lightbox-e1-photo` with the original public URL, and
  the caption after them

#### Scenario: Gallery with the lightbox off
- **WHEN** a site renders a version 2 `gallery` block with the default settings
- **THEN** each item's figure holds only the optimized `media` image and its
  caption, with no button or dialog

#### Scenario: Gallery items open their own dialogs
- **WHEN** a gallery with key `shots` of entry `e1` and two items has the
  lightbox on
- **THEN** the items open `lace-lightbox-e1-shots-0` and
  `lace-lightbox-e1-shots-1` respectively

#### Scenario: Hero image loads eagerly
- **WHEN** a site renders a `hero` block with an image
- **THEN** the image element carries `loading="eager"` and
  `fetchpriority="high"` and no lightbox
