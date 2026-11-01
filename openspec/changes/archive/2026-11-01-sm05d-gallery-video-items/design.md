## Context

See proposal.md for motivation. Relevant current state:

- `builtInBlocks.gallery` (version 4, `packages/content/src/index.ts`) has an
  `images` list of groups `media`, `alt`, `caption`, `link`, identity
  migrations 2/3/4, list-layout settings and `lightbox`.
- `builtInBlocks.videoEmbed` (version 2) declares `aspectRatio` and `playback`
  as block **settings** with choice-card presentation. Gallery needs them per
  item, so they become item **fields**; select presentation is accepted on any
  select field.
- SM5A–SM5C already deliver everything conditional: config checks, effective
  values with defaults, draft retention, publication projection, optional
  published value types, render-time projection (`parseBlock`), admin
  show/hide, "No alt" gated by shown `alt`, and media-list eligibility that
  requires `media` to be visible in the starting value.
- The registry manifest accepts **exactly one** `component` file and any
  number of `stylesheet` files (`packages/cli/src/blocks-registry.ts`).
- `registry/astro/videoEmbed/VideoEmbedBlock.astro` holds the playback
  markup and a script whose selectors are scoped to
  `[data-lace-block="videoEmbed"]`; `describeVideoEmbed` in `@lacecms/render`
  already provides `src`, `ambientSrc` and `provider`.
- In the admin, Add of an eligible media list only opens the picker
  (`FieldRenderer.tsx`), and collapsed rows take a preview from the first
  shown leaf whose type is in the `FieldPreviewRegistry` (`media` only today).

## Goals / Non-Goals

**Goals:**

- Gallery v5 data shape with conditional rules, delivered through the
  existing SM5 machinery without new server code.
- Video cells reuse the `videoEmbed` playback contract without a new package
  API.
- A direct way to add a video, derived generically from metadata.

**Non-Goals:**

- Extracting shared video markup into `@lacecms/astro` or refactoring the
  `videoEmbed` registry item.
- Changing the CLI manifest format, the render core or published value types.

## Decisions

### D1. Item fields and shared descriptors

The item group declares `kind`, `media`, `videoUrl`, `alt`, `videoTitle`,
`caption`, `link`, `playback`, `aspectRatio` with the `visibility` map from
the `block-registry` delta. The `aspectRatio` and `playback` select
descriptors move to two module constants used by both `videoEmbed.settings`
and the gallery item, so labels, descriptions and cards cannot drift;
`videoEmbed` metadata and hashes stay byte-identical (pinned by a test).
`kind` uses choice cards (Image, Video) without diagrams. `videoTitle` mirrors
`videoEmbed.title` (`required`, `minLength: 1`) and the URL mirrors
`videoEmbed.url` (`embedProviders: ["youtube", "vimeo"]`). The list keeps the
key `images`, label "Images and videos", `itemLabel: "caption"`.

*Alternatives:* `title`/`url` item keys (confusable with the block `title`
and the image `link`); renaming `images` to `items` through migration 5
(breaks copied components, import packages and MCP prompts for no behavior
gain); block-level playback/aspect settings (a gallery mixes square and wide
clips).

### D2. Identity migration 5

`migrations: { 2, 3, 4, 5: identity }`. Stored items keep no `kind`; the
effective value comes from the default in validation, render parsing,
projection and the admin. Publish-mode validation of migrated published
snapshots succeeds because `media` stays required and visible for images.

*Alternative:* write `kind: "image"` into every item. Rejected: it rewrites
every snapshot for no observable difference, and v2–v4 established identity
migrations with defaults as the pattern.

### D3. Video cells inside the single gallery component

`GalleryBlock.astro` branches per item on `kind`. Image items keep the
revision 6 markup plus `data-lace-kind="image"` on the `item` part. Video
items render:

```astro
<li data-lace-part="item" data-lace-layout-item data-lace-kind="video">
  <figure data-lace-video data-lace-aspect-ratio={ratio} data-lace-playback={playback}>
    <div data-lace-video-area>
      {playback === "ambient" ? (<>
        <template data-lace-video-template><iframe {...frame} loading="lazy" /></template>
        <template data-lace-ambient-template><iframe src={ambientSrc} tabindex="-1" … /></template>
        <noscript><iframe {...frame} loading="lazy" /></noscript>
      </>) : <iframe {...frame} loading="lazy" />}
    </div>
    {caption && <figcaption data-lace-part="caption">{caption}</figcaption>}
    <a data-lace-part="source" href={videoUrl}>Watch on Vimeo</a>
  </figure>
</li>
```

The frame attributes copy `videoEmbed` (`allow`, `referrerpolicy`,
`tabindex=0`, `data-lace-part="player"`). There is no poster, so there is no
preview button and no click delegation: the script only mounts ambient
players once per figure, selecting
`[data-lace-block="gallery"] [data-lace-video][data-lace-playback="ambient"]:not([data-lace-ambient])`,
appending the player template under reduced motion (`data-lace-ambient="fallback"`)
or the ambient template otherwise (`"active"`), on load and on
`astro:page-load`. A new `GalleryVideo.css` (role `stylesheet`, imported by
the component) holds the ratio rules by `data-lace-aspect-ratio`, the
absolute ambient overlay and the focus-revealed visually hidden source link,
in `@layer lace-layout` with `:where()` selectors like `VideoEmbed.css`.

*Alternatives:* a second `GalleryVideo.astro` file (the manifest allows one
component per item, so this needs a new file role and CLI format change); a
`LaceVideo.astro` adapter component (new public export, CSS shipped in a
package, which no adapter component does today, and a `videoEmbed` revision
to avoid two implementations); a registry dependency on `videoEmbed` (its
component takes block props, not item values). The duplicated markup is about
30 lines plus a 15-line script; a shared primitive goes to the backlog for
when a third consumer appears.

### D4. Lightbox and link stay image-only

Video items never render `LaceImage`, links or lightbox dialogs. Dialog ids
keep the index over all stored items, so existing image dialog ids do not
change when videos are inserted after them, and stay unique. `sizes` stays
unchanged; video cells need none.

### D5. Typed narrowing in site components

Published item types (SM5B) make every target optional, so the component
narrows explicitly:

```ts
if (item.kind === "video") {
  if (item.videoUrl === undefined || item.videoTitle === undefined) return [];
  // describeVideoEmbed(item.videoUrl, context) …
} else if (item.media !== undefined) {
  // image(item.media, item.alt) …
}
```

Publish validation in `parseBlock` guarantees the visible required values, so
the guards never drop content at runtime; they only satisfy the types. The
same pattern is documented for copied components.

### D6. "Add {choice}" buttons in media lists

`media-list.ts` gains a pure helper next to `mediaListTarget` that, for an
eligible group item, reads the media field's rule from `item.visibility`,
requires the controller to be a `select`, and returns the options not listed
in `values`, in option order, each with its label (choice-card label or the
value) and the starting value with the controller set
(`draftItemValue(item) ?? fieldStartingValue(item, {})`, cloned). The
`FieldRenderer` list toolbar renders one outline button per choice after Add
and calls the existing `insert`, so identity, open state, focus, announcement,
`addProblem` disabling, busy and viewer rules are those of the ordinary Add.
The limit check uses the actual prospective item.

*Alternatives:* a split Add menu (one more click for the common image case);
an explicit list option such as `addActions` in the DSL (new portable
metadata and hash surface for a behavior derivable from rules); a URL tab in
the media picker (couples the library to embeds).

### D7. Embed URL preview

A new `EmbedUrlPreview` component in `apps/admin/src/entities/content`
parses the value with `parseVideoEmbed` from `@lacecms/content` and renders a
`Video` icon visual and the provider title; an unparseable value yields an
empty preview (generic summary). `FieldPreviewRegistry` entries may carry an
optional static `appliesTo(definition)` predicate; `previewLeaf` skips leaves
whose preview does not apply. `EmbedUrlPreview.appliesTo` accepts URL fields
with `embedProviders`, so navigation URLs and lists where a URL precedes a
media field keep today's rows. `EntryPage` registers
`{ media: MediaItemPreview, url: EmbedUrlPreview }`.

*Alternative:* a gallery-specific summary in `block-presentation.ts`
(collapsed-row rules forbid per-block presentation).

### D8. Media toolbar layout

`MediaToolbar` renders two flex rows (`sm:` breakpoint at 40rem) instead of
one wrapping row. The type filter becomes one bordered group with the same
`p-0.5` frame and pressed styling as the grid/list toggle. `MediaTagInput`
gains a `variant: "field" | "inline"` prop (default `"field"`, used by
`MediaMetadataForm`): `"inline"` renders the label `sr-only`, puts chips and
the input inside one bordered `min-h` field with a leading `Tag` icon (the
field forwards clicks to the input), and adds the caller's description id to
`aria-describedby`. The toolbar passes a visually hidden "Items must have all
tags" element as that description and renders an `Info` icon button wrapped
in the shared `Tooltip` with the same text. The picker dialog's Escape guard
already defers to open popovers; the tooltip closes on Escape first, which a
dialog test pins. No query, URL or API behavior changes.

*Alternatives:* keeping the visible label above the field (the cause of the
misalignment); showing the rule as inline helper text (owner preferred a
tooltip to save width); a separate toolbar component for the picker (the two
surfaces must stay identical).

### D9. Delivery surfaces

Registry item revision 7 / block version 5 and the CLI bundled copy; root
`lace.config.ts` and starter model versions raised for models that allow
`gallery`; template 0.45.0 with upgrade instructions; `apps/site`,
`tests/fixtures/existing-astro-site` and generated-project snapshots; the
reference fixture export gains an ambient 1:1 Vimeo item; the import sample
gains one video item so its root test exercises the rules. Architecture §8
(gallery bullet) and §13.5 (script exception now covers gallery ambient
mounting) are updated; ADR 0018 records the shipped example. No new ADR: no
invariant beyond the bounded script exception changes, and that extension
follows the SM1 precedent.

## Risks / Trade-offs

- [Copied gallery components break on upgrade] → upgrade instructions and the
  starter guide spell out sync-then-update; `block_version_mismatch` fails the
  build loudly instead of rendering wrong markup; types force `media` checks.
- [Two copies of video markup/script drift] → registry tests render both
  blocks with the same URLs and assert equal iframe attributes and fallback
  behavior; shared primitive recorded in the backlog.
- [Many player iframes in one gallery] → iframes are lazy; ambient players
  mount only when allowed; docs advise using ambient sparingly (bandwidth).
- [No pause control for ambient cells] → same documented WCAG 2.2.2 gap as
  `videoEmbed`; site owners can add a control in their copy.
- [Choice labels make odd button text, e.g. "Add none"] → labels come from
  the author's choice cards; the gallery reads "Add Video".

## Migration Plan

1. Upgrade engine, admin, CLI and site packages together.
2. Raise the version of every model that allows `gallery`; run configuration
   sync, which migrates stored galleries to version 5 without data changes
   and requests a build.
3. Run `lace add block gallery --site site` (or merge the `.new` proposal) so
   the site has the revision 7 component and `GalleryVideo.css` before the
   next build.

Rollback after sync requires the pre-upgrade content backup and the matching
older code and site sources; there is no down-migration.
