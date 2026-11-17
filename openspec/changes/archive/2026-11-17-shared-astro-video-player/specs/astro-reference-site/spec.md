## MODIFIED Requirements

### Requirement: Reference and generated starter sites deliver video embeds

The reference site and new generated starter sites SHALL register the canonical
`videoEmbed` component with its matching built-in definition at version 2,
allow it in their editable page model and include a current block installation
record. The player SHALL come from the shared Astro adapter component.
Site models SHALL retain the version bump that lets configuration
synchronization migrate stored version 1 blocks to version 2.
Existing consumer sites already on compatible block definitions SHALL be able
to adopt the shared renderer
with a compatible adapter package and ordinary block installation, without
configuration synchronization or overwriting local sources. Upgrade instructions
SHALL distinguish this renderer-only adoption from the version 1 migration
and explain the `block_version_mismatch` failure for incompatible definitions.
Reference fixtures SHALL cover YouTube, Vimeo, a poster and no poster, a
non-default aspect ratio, and `ambient` playback with and without a poster;
generated starter builds SHALL work without provider credentials, network
metadata requests or a running media/video service. Public content SHALL use
the normal published export and static build path.

#### Scenario: Static builds do not contact video providers
- **WHEN** a reference or generated starter site builds supported embed fixtures, including ambient ones
- **THEN** it emits canonical player or preview markup and ambient templates with no provider API or thumbnail requests and no live ambient iframe in the static HTML

#### Scenario: Ambient and aspect-ratio fixtures render
- **WHEN** the reference site builds its fixture with a `1:1` ambient Vimeo block and a `16:9` player block
- **THEN** the output carries the selected ratio and playback hooks, the ambient URL in an inert template, and the existing iframe and source-link behavior for the player block

#### Scenario: A draft edit leaves public output intact
- **WHEN** an editor changes a published embed's URL, poster or settings only in the draft
- **THEN** public export and the rebuilt site retain the previous published values until publication

#### Scenario: Existing site adopts the shared player
- **WHEN** an existing site with compatible definitions installs the updated
  adapter and clean `videoEmbed` and `gallery` items
- **THEN** it builds both renderers from the same published export as before,
  with no model version or content migration.

### Requirement: Reference site renders gallery video items
The committed export fixture SHALL contain a published gallery at the current
block definition version that holds image items and at least one ambient Vimeo
video item with a non-default aspect ratio and a caption, and whose draft-only hidden values,
if any, are absent from the export. The fixture build SHALL render it
through the registry gallery component using the shared player inside the
entry scope, and the
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
- **THEN** the gallery item is recorded at the current registry revision with the hashes of
  `GalleryBlock.astro`, `ListLayout.css` and `GalleryVideo.css`
