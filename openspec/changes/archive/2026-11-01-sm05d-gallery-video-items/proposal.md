## Why

SM5A–SM5C delivered conditional fields as a complete system, but no shipped
block uses them, and the portfolio site that motivated the site migration
roadmap mixes images and muted looping Vimeo videos in one gallery. This
change implements **Session SM5D — Gallery video items** of
`docs/site-migration-roadmap.md` (Step SM5, ADR 0018): the built-in `gallery`
becomes the shipped example of conditional fields, and its items can hold an
image or a YouTube/Vimeo video.

## What Changes

- Built-in `gallery` moves to definition version 5. Each `images` item gains a
  required select `kind` (`image`, `video`, default `image`) shown as choice
  cards. `media`, `alt` and `link` apply to images; `videoUrl` (YouTube or
  Vimeo), a required `videoTitle`, `playback` (`player`, `ambient`, default
  `player`) and `aspectRatio` (`16:9`, `4:3`, `1:1`, `4:5`, `9:16`, default
  `16:9`) apply to videos; `caption` applies to both. `playback` and
  `aspectRatio` reuse the `videoEmbed` setting descriptors. The list key stays
  `images`; its label becomes "Images and videos". Identity migration 5:
  stored items without `kind` are images through the default. No database
  migration.
- No video poster, so the `images` list stays eligible for multi-select Add;
  appended items carry `kind: "image"`.
- Admin, generic for any eligible media list whose media field depends on a
  `select` controller: next to Add, one button per controller option that
  hides the media field ("Add Video" for the gallery) appends one open item
  with that option selected and focuses it. URL fields restricted to embed
  providers gain a collapsed-row preview (video icon, "YouTube video" /
  "Vimeo video"), so a video row shows its caption or title and its provider
  without "No alt".
- Registry `gallery` revision 7 (block version 5): `GalleryBlock.astro`
  renders video items in their cell with the `videoEmbed` player, ambient,
  reduced-motion and no-JS behavior, a caption and a source link; a new
  `GalleryVideo.css` stylesheet reserves the aspect ratio. The lightbox and
  links cover images only. Gallery becomes the second built-in allowed a local
  `<script>` (ambient mounting only). **BREAKING** for copied gallery
  components: published item types make `media` optional, so copies must
  narrow by `kind` and check `media`, and revision 6 components fail with
  `block_version_mismatch` after configuration sync.
- Owner-requested polish (2026-11-01), bundled because it is a small admin
  layout fix found on the same media surfaces this session touches: the
  shared media library and picker toolbar becomes two rows (search, a
  segmented type filter, sort and view; then the tag filter and Clear
  filters) and stacks on narrow screens. The toolbar tag filter becomes a
  compact token field with a tag icon and chips inside, no visible label, and
  the "Items must have all tags" rule in a tooltip on an information icon
  (also its accessible description). Tag input behavior and the details-panel
  tag editor are unchanged.
- Starter template 0.45.0 with upgrade instructions, root and starter model
  version increases, `apps/site` and acceptance fixtures with a video item,
  the import sample with one video item, and documentation.

### Non-goals

- A shared `LaceVideo` adapter component or refactoring `videoEmbed` to use
  shared markup (backlog until a third consumer exists).
- Video posters, uploaded video files, pasting a video URL in the media
  picker, or a lightbox for videos.
- Renaming the `images` key, new rule kinds, or discriminated published value
  types (SM5B keeps targets optional).
- A pause control for ambient videos (the documented WCAG 2.2.2 gap of
  `videoEmbed` applies unchanged).

### Dependencies

SM5A–SM5C (`conditional-fields`, server enforcement and projection, admin
forms) are archived. SM1 (`videoEmbed` v2 ambient playback, `ambientSrc`) and
SM3C (multi-select picker) provide the playback contract and the media-list
Add this change extends.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `block-registry`: gallery version 5 with item `kind` and video fields,
  conditional rules, field order, labels and identity migration 5.
- `block-source-registry`: gallery revision 7 renders video items with the
  video-embeds playback contract, ships `GalleryVideo.css`, and is allowed an
  ambient mounting script.
- `admin-draft-editor`: Add buttons for controller choices that hide the
  media field of an eligible media list; collapsed-row preview for embed URL
  leaves.
- `astro-reference-site`: the fixture gallery holds an ambient video item and
  the fixture build renders it.
- `admin-media-library`: the library and picker share a two-row filter
  toolbar with a segmented type filter and a compact tag filter whose
  match-all rule moves into a tooltip and accessible description.
- `public-documentation`: public guidance for gallery video items and
  updating copied gallery components.

## Impact

- Content: `packages/content/src/index.ts` (`builtInBlocks.gallery`, shared
  video setting descriptors), content tests and type tests.
- Admin: `apps/admin/src/entities/content` (`media-list.ts`,
  `item-summary.ts`, `FieldRenderer` list toolbar), a new embed URL preview
  next to `MediaItemPreview`, `EntryPage` preview registry;
  `apps/admin/src/widgets/media-library/MediaToolbar` and a compact variant
  of `apps/admin/src/entities/media/MediaTagInput`; unit tests and Playwright
  journeys.
- Registry: `registry/astro/gallery/*`, `registry/registry.json`, CLI bundled
  copy and registry tests; `packages/astro` registry render tests.
- Sites and fixtures: root `lace.config.ts`, `apps/site`,
  `packages/create-lace/templates/**` (template 0.45.0),
  `tests/fixtures/existing-astro-site`, generated-project snapshots,
  `apps/docs/public/examples/content-import/lace-import.json`.
- Docs: `docs/mvp-architecture.md` §8 and §13.5 (script exception),
  `docs/site-migration-roadmap.md`, `docs/site-styling.md`,
  `docs/adr/0018-conditional-fields.md` (shipped example), public
  content-modeling, conditional-fields and astro-integration pages, starter
  `docs/lace-astro-site.md`.
- No REST, OpenAPI, database, SDK or render-core API change.
