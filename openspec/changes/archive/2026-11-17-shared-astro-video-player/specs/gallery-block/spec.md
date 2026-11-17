## MODIFIED Requirements

### Requirement: Gallery renders video items with embed playback
The `gallery` registry component SHALL use the Astro adapter's shared video
component to render each video item inside its `item` part as a figure carrying `data-lace-video`, `data-lace-aspect-ratio`
and `data-lace-playback` equal to the item's `aspectRatio` and `playback`,
holding a video area, a `caption` part only when the item's caption is
present (videos have no media caption fallback), and a `source` part link to
the validated `videoUrl` reading "Watch on YouTube" or "Watch on Vimeo". The
video area and player SHALL follow the video-embeds contract for a block
without a poster, applied per item: `player` playback renders a lazy iframe
with the canonical player URL, the item's `videoTitle` as title, restricted
permissions and no autoplay; `ambient` playback contains no live iframe in
the initial HTML, mounts exactly one muted, looping, control-free ambient
iframe with no tab stop once on page load when JavaScript is available and the
visitor does not prefer reduced motion, marks that figure with
`data-lace-ambient="active"`, falls back to the `player` iframe under reduced
motion, and offers a non-autoplaying `<noscript>` player without JavaScript.
The source link SHALL be visually hidden only while an ambient player is
mounted and SHALL become visible on focus. Repeated initialization and
several galleries or video items on one page SHALL NOT create duplicate
players. On a page with both gallery items and standalone embeds, each
player SHALL mount only within its own figure.

The `GalleryVideo.css` stylesheet companion SHALL reserve each video area at
its item's aspect ratio by data attribute (16:9 base) inside the layout cell,
without inline styles or decorative rules, place a mounted ambient iframe over
the area, and visually hide the source link as above, all in the
`lace-layout` cascade layer with zero-specificity selectors so unlayered site
CSS overrides it. The component SHALL import it with a matching relative
import. Hidden blocks SHALL emit no player. No provider request SHALL occur
before a `player` iframe is lazily loaded or an ambient player is mounted.

#### Scenario: Mixed gallery markup
- **WHEN** a site renders a gallery holding an image item and a `player`
  Vimeo item titled "Studio tour" with aspect ratio `4:5` and caption "Spring"
- **THEN** the first `item` part carries `data-lace-kind="image"` with its
  image figure, and the second carries `data-lace-kind="video"` with a figure
  whose `data-lace-aspect-ratio` is `4:5`, a lazy iframe titled "Studio tour"
  with the canonical Vimeo player URL and no autoplay, the caption "Spring"
  and a "Watch on Vimeo" source link

#### Scenario: Ambient item mounts once
- **WHEN** a visitor without a reduced-motion preference opens a page with
  two galleries holding three ambient video items, and initialization runs
  twice
- **THEN** each ambient item has exactly one ambient iframe that is not a tab
  stop, each figure is marked `data-lace-ambient="active"`, and each source
  link is visually hidden but focusable

#### Scenario: Reduced motion and no JavaScript
- **WHEN** a visitor who prefers reduced motion opens a gallery with an
  ambient item, and another visitor opens it with JavaScript disabled
- **THEN** the first sees a non-autoplaying player iframe and no ambient URL
  request, and the second sees the `<noscript>` player iframe; both see the
  visible source link

#### Scenario: Aspect ratio is reserved in the cell
- **WHEN** a gallery in the `columns-3` grid preset holds a `9:16` and a
  `1:1` video item
- **THEN** each video area has its ratio before any player loads, from
  `GalleryVideo.css` attributes rather than inline styles

#### Scenario: Gallery and videoEmbed on one page
- **WHEN** a page holds an ambient `videoEmbed` block and a gallery with an
  ambient video item
- **THEN** each figure has exactly one ambient iframe and its own
  ambient state
