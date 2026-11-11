## MODIFIED Requirements

### Requirement: Built-in image components render through the adapter image component
The `image` registry item (revision 7, block version 4), the `gallery` item
(revision 8, block version 6) and the `hero` item (revision 5, block version 1)
SHALL render every media image through the adapter's image component, keeping
the image element's `media` part, effective alt text, dimensions and
focal-point object position, and adding the component's variants and
placeholder. `image` SHALL pass the sizes `(min-width: 64rem) 60rem, 100vw`,
`gallery` the sizes `(min-width: 64rem) 20rem, (min-width: 32rem) 50vw, 100vw`
for `grid` with `auto`, and the conservative sizes `100vw` for all other layout
combinations, except that a `natural` gallery image whose width `W` is known
SHALL receive the sizes `(max-width: Wpx) 100vw, Wpx`, and `hero` the sizes `(min-width: 64rem) 60rem, 100vw` with eager loading. Gallery image rules
apply to image items only; video items SHALL render no `media` image, link or
lightbox. When
the block's `lightbox` setting is `true`, `image` and each `gallery` image item SHALL
enable the lightbox with the identifier `lace-lightbox-<entry id>-<block key>`
for `image` and `lace-lightbox-<entry id>-<block key>-<item index>` for each
gallery image item, where the index counts every stored item, so adding video
items never renames the dialogs of the images before them; with the setting `false` they SHALL render no button and no
dialog. When an `image` block or a `gallery` item has a `link`, its `media`
image SHALL be wrapped in an anchor with that `href` and the part `link`,
opening in the same browsing context, and that image SHALL render no
lightbox button or dialog even when the setting is `true`; the anchor's
accessible name SHALL be the effective alt text, or the caption when the alt
text is empty, or the link URL when both are empty. Images without a `link`
SHALL keep the lightbox behavior above. `hero` SHALL never render a lightbox. The components SHALL still carry
no `<style>` element, and only `gallery` SHALL carry the ambient mounting
`<script>` of its video items.

#### Scenario: Image block with the lightbox on
- **WHEN** a site renders a version 4 `image` block with key `photo` of entry
  `e1` whose settings are `{ lightbox: true }`
- **THEN** its figure holds the `lightbox-trigger` button wrapping the `media`
  image, the dialog `lace-lightbox-e1-photo` with the original public URL, and
  the caption after them

#### Scenario: Gallery with the lightbox off
- **WHEN** a site renders a version 6 `gallery` block of image items with the default settings
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

#### Scenario: Gallery applies the shared list contract without theming
- **WHEN** a version 6 Gallery renders any layout mode, preset, item placement and image size
- **THEN** its existing section is marked as the layout container, its items
  list and direct items expose the shared list-layout hooks, its source imports
  `./ListLayout.css`, and it adds no inline layout styles, image aspect ratio,
  cropping or decorative styles; existing title/media/link/lightbox behavior remains

#### Scenario: Nondefault Gallery layout uses conservative image sizing
- **WHEN** Gallery uses horizontal flex or a `columns-2` grid with `fill` images
- **THEN** optimized images receive sizes `100vw` and retain the existing
  resolution, placeholder, loading and media-fallback behavior

#### Scenario: Video items keep image dialog indexes
- **WHEN** a gallery with key `shots` of entry `e1` and the lightbox on holds
  an image, a video and an image
- **THEN** the images open `lace-lightbox-e1-shots-0` and
  `lace-lightbox-e1-shots-2`, and the video item renders no lightbox button,
  dialog or link

#### Scenario: Natural image requests its own width
- **WHEN** a `columns-2` gallery holds a `natural` image item whose media is
  405 pixels wide
- **THEN** its image carries `width="405"`, its original height and the sizes
  `(max-width: 405px) 100vw, 405px`, and a `fill` item beside it keeps `100vw`
