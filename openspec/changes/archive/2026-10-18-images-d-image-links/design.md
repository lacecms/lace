## Context

Observed today (after step C):

- `packages/content/src/index.ts` defines `image` (version 3: `alt`,
  `caption`, required `media`; identity migrations to 2 and 3) and `gallery`
  (version 2: optional `title`, `images` list of groups with `alt`, `caption`,
  required `media`; identity migration to 2). Both share the boolean
  `lightboxSetting`. `field.url` validates with `isSafeUrl` (relative paths,
  `#fragment`, `http(s)`, `mailto:`, `tel:`), and URL fields are allowed in
  list item groups (navigation already uses them).
- `registry/astro/image/ImageBlock.astro` (revision 5) and
  `registry/astro/gallery/GalleryBlock.astro` (revision 2) render each image
  through `@lacecms/astro/LaceImage.astro`, passing
  `lightbox={settings.lightbox}` and a `lightboxId`. `LaceImage` wraps the
  image in a `lightbox-trigger` button and renders a `<dialog>` only when
  `lightbox` is true.
- Root `lace.config.ts` allows both blocks in `home` (v6), `about` (v5),
  `posts` (v6) and `notes` (v5); the starter config in `home` (v3) and
  `posts` (v3).
- Step B's change is the template for everything a block version bump
  touches (fixtures, hashes, registry tests, starter site, upgrade text).

## Goals / Non-Goals

**Goals:** an editor can make any `image` block or gallery item a link;
linked images are accessible, keep their variants and placeholder, and never
show a lightbox; unlinked images behave exactly as before.

**Non-Goals:** see the proposal.

## Decisions

### D1. Field shape

```ts
link: field.url({
  label: "Link",
  description: "Selecting the image opens this link instead of the full-screen view.",
}),
```

Added to `image.fields` and to the `gallery` item group, after `caption`. One
shared constant like `lightboxSetting`, so both blocks get identical metadata.
The name `link` (not `url`) avoids confusion with the media URL. Versions:
`image` 4 with `migrations: { 2, 3, 4: identity }`, `gallery` 3 with
`{ 2, 3: identity }`. Identity migrations keep stored settings, so a block
saved with `lightbox: true` keeps it.

### D2. Rendering in the registry components, not in `LaceImage`

The block components decide, per image:

```astro
{link === undefined ? (
  <LaceImage … lightbox={settings.lightbox} lightboxId={…} />
) : (
  <a aria-label={linkLabel} data-lace-part="link" href={link}>
    <LaceImage … />
  </a>
)}
```

Keeping the anchor out of `LaceImage` means no adapter release and no new
adapter API; `LaceImage` already renders a plain `<img>` when `lightbox` is
false. The figure, caption and `media` part stay where they are, so
existing styles keep working; the `link` part is the new wrapper.

`aria-label` is set only when the image's effective alt text is empty: then
the caption, else the URL. With alt text, the image's alt is the link's
accessible name and no `aria-label` is rendered (avoids announcing it twice).
Same-tab navigation: no `target` or `rel` attributes.

### D3. Reference site, fixture and styles

The reference fixture export adds `link: "/blog/first-post"` to the
default-setting `image` block and a `link` to the second gallery item; the
fixture build test asserts the anchors, the missing dialogs for linked images
and the remaining dialogs. `apps/site` and the starter stylesheet get:

```css
:where([data-lace-part="link"]) { display: block; }
:where([data-lace-part="link"]):focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
```

mirroring the lightbox trigger rule. `docs/site-styling.md` lists the `link`
part for `image` and `gallery`.

### D4. Template 0.34.0

Same pattern as 0.32.0: `TEMPLATE_VERSION` `0.34.0`; starter `lace.config.ts`
`home` and `posts` to version 4; starter components and `lace.site.json`
updated to the new registry revisions; stylesheet rule; new first
`configuration` instruction (no migration; upgrade engine, admin and site
packages together; bump models, `pnpm content:sync`, then
`pnpm exec lace add block image gallery` before the next build because older
components fail with `block_version_mismatch`; copy the link rule). Snapshots
refreshed with `node scripts/generated-project-acceptance.mjs snapshots
--update`.

## Risks / Trade-offs

- [An editor turns on the lightbox and sets links, expecting both] → the field
  description states the precedence; the behavior is deterministic and
  visible in the site.
- [Sites with edited image components] → the upgrade instruction names the
  merge path; the version mismatch error names the block.
- [Root model version bumps ripple through many pinned tests] → expected and
  listed in tasks, as in step B.

## Migration Plan

Content: identity migrations on the next sync. Sites: template upgrade (D4).
Rollback: restore the previous engine packages and registry components; data
synced at the new versions keeps an optional `link` that older definitions do
not know, so rollback also needs the previous model versions restored from
backup — the same constraint as any block version bump.

## Open Questions

None.
