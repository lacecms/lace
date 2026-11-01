## ADDED Requirements

### Requirement: Reference site renders gallery video items
The committed export fixture SHALL contain a published version 5 gallery that
holds image items and at least one ambient Vimeo video item with a
non-default aspect ratio and a caption, and whose draft-only hidden values,
if any, are absent from the export. The fixture build SHALL render it
through the registry gallery component inside the entry scope, and the
maintained site SHALL install the gallery item's component and both
stylesheet companions with matching lock hashes.

#### Scenario: Mixed gallery in the fixture build
- **WHEN** the fixture post with the mixed gallery is built
- **THEN** its gallery holds one `item` part per stored item in order, image
  items render their figures with the effective alt text and captions, and
  the video item renders a figure with its `data-lace-aspect-ratio`,
  `data-lace-playback="ambient"`, an ambient template, a `<noscript>` player,
  its caption and a "Watch on Vimeo" link, with no live ambient iframe in the
  static HTML

#### Scenario: Lock matches the installed gallery
- **WHEN** the reference site's `lace.site.json` is verified
- **THEN** the gallery item is recorded at revision 7 with the hashes of
  `GalleryBlock.astro`, `ListLayout.css` and `GalleryVideo.css`
