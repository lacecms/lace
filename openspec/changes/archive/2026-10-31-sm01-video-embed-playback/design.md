## Context

See proposal.md for motivation. Current state at alpha.8:

- `builtInBlocks.videoEmbed` (`packages/content/src/index.ts`) is version 1 with
  four data fields and no settings. `parseVideoEmbed`
  (`packages/content/src/video-embeds.ts`) returns a frozen
  `{provider, videoId, src, privacyHash?}`; `describeVideoEmbed`
  (`packages/render/src/video-embeds.ts`) wraps it with contextual errors.
- `registry/astro/videoEmbed` (revision 1) renders either a lazy iframe or a
  poster button plus an inert `<template>`, with a delegated click script. Its
  stylesheet hard-codes `aspect-ratio: 16 / 9` inside `@layer lace-layout`.
- Block settings are scalar fields with defaults; the render core passes
  `settings` with every default applied (`BlockProps.settings`). CE1 block
  migrations apply settings defaults after a migration, so an identity
  migration is enough for new settings (schema-evolution "New settings receive
  their defaults").
- The render core rejects stored blocks whose version differs from the
  definition (`block_version_mismatch`), so the block version, model versions,
  fixtures and registry component must move together.
- Copies of the component live in `apps/site`, the create-lace starter template
  and the existing-astro-site test fixture, each tracked by `lace.site.json`
  hashes.

## Goals / Non-Goals

**Goals:**

- One portable data contract (settings and canonical URLs) shared by content,
  render core and any site renderer, including custom ones.
- Zero provider requests in static HTML; the ambient decision happens once in
  the browser.
- Version 1 content renders identically after migration (`16:9`, `player`).

**Non-Goals:**

- Runtime reaction to a reduced-motion preference changed after page load.
- Pausing off-screen ambient players or controlling players via `postMessage`.
- Admin preview of the video or of the aspect ratio beyond choice cards.

## Decisions

### D1. Settings, not data fields

`aspectRatio` and `playback` are presentation, so they are block settings
(select, required, with defaults) shown in the existing Settings tab. They use
choice-card presentation: `playback` cards carry a label and a one-line
description ("Player — visitors start the video"; "Ambient — muted, looping,
no controls; respects reduced motion"); `aspectRatio` cards carry the ratio as
label and an approximate rectangle diagram on the 12-unit grid (for example
12×7 for 16:9, 9×9 for 1:1, 6×11 for 9:16). No `settingsVisibility` is needed:
both settings apply in both modes.

Alternative rejected: data fields. They would make presentation part of
content validation and media/link projections for no gain, and data fields
cannot use choice-card presentation in the Settings tab.

### D2. Version 2 with an identity migration

`videoEmbed` becomes version 2 with `migrations: { 2: (block) => block }`.
Missing settings receive defaults through normal validation, so migrated blocks
are `16:9` / `player`. Every model that allows `videoEmbed` raises its version:
root `lace.config.ts` (home, about, posts, notes), the create-lace template
config and the reference-site fixture export (`schemaVersion: 2` with settings).

### D3. Both canonical URLs in one description

`parseVideoEmbed` adds `ambientSrc` to the frozen description; `src` is
unchanged. The description stays settings-independent, so validation,
caching and custom renderers share one value and a renderer picks the URL by
`settings.playback`. Parameter order is fixed for deterministic output:

- YouTube: `?autoplay=1&mute=1&loop=1&playlist=<id>&controls=0&playsinline=1`
  (`playlist=<id>` is required for YouTube looping of a single video).
- Vimeo: `?background=1`, or `?h=<hash>&background=1`. `background=1` implies
  autoplay, mute, loop and hidden controls.

Alternative rejected: a `playback` parameter on `describeVideoEmbed`. It would
change the description per call site and duplicate URL building in tests and
renderers.

### D4. Markup: player markup plus an ambient template

The component always emits the `player` markup that would apply without
JavaScript, plus an inert ambient template when `playback` is `ambient`:

- Root `<figure>` gains `data-lace-aspect-ratio` and `data-lace-playback`.
- `player` mode: unchanged markup (lazy iframe, or poster button + player
  template).
- `ambient` with poster: poster button + player template (as `player`) and a
  `<template data-lace-ambient-template>` with the ambient iframe.
- `ambient` without poster: no live iframe; a player template, the same player
  iframe inside `<noscript>`, and the ambient template. Keeping the no-poster
  player iframe out of live HTML is what guarantees "no provider request before
  the script decides".

The ambient iframe carries `title`, `tabindex="-1"`, `loading="lazy"`,
`allow="autoplay; encrypted-media"`, the shared `referrerpolicy` and
`data-lace-part="player"`.

### D5. One script, two jobs

The existing delegated click handler (preview activation) stays. A second
function runs once at load: for each `[data-lace-playback="ambient"]` block not
yet initialized (`data-lace-ambient` absent):

- If `matchMedia("(prefers-reduced-motion: reduce)")` matches, mark the block
  `data-lace-ambient="fallback"`; a block without a poster mounts its player
  template iframe (lazy). A poster block keeps its button, so activation works
  as in `player` mode.
- Otherwise clone the ambient template into the video area as an absolutely
  positioned overlay, set `inert` on the preview button if present and mark the
  root `data-lace-ambient="active"`.

The marker makes initialization idempotent across repeated runs and multiple
blocks. The script remains local, framework-free and provider-SDK-free, which
stays within the existing single-component script exception (architecture
§13.5 wording widens from "activation" to "activation and ambient mounting").

### D6. Structural CSS keyed by data attributes

`VideoEmbed.css` maps each `data-lace-aspect-ratio` value to `aspect-ratio`
(`16 / 9`, `4 / 3`, `1 / 1`, `4 / 5`, `9 / 16`), with `16 / 9` as the base rule
so a missing attribute keeps today's shape. The ambient overlay is positioned
over the area. Under `[data-lace-ambient="active"]` the source link uses a
standard visually-hidden pattern that is undone on `:focus-visible`. No inline
`style` and no `<style>` element, so site stylesheets can override everything.

Alternative rejected: an inline `--lace-video-aspect` custom property. It works,
but data attributes give stable hooks, keep components style-free and let
sites restyle ratios without editing the component.

### D7. Accessibility position (owner decision)

No pause control ships. Documentation (`docs/site-styling.md`, the starter
guide and public docs) states the WCAG 2.2.2 gap and shows where a site owner
can add one. Reduced motion and no-JavaScript fall back to `player`, so motion
never starts for visitors who opted out.

## Risks / Trade-offs

- [Providers change background/autoplay parameters] → URLs are built in one
  pure function with unit tests; a change is a one-line update plus registry
  revision.
- [Browsers block autoplay in some contexts (data saver, iOS low power)] →
  provider players show their own still frame; the poster under the overlay
  keeps the area meaningful. Not detectable without provider SDKs; documented.
- [Many ambient iframes on one page cost bandwidth] → iframes are lazy; the
  docs recommend posters and limiting ambient blocks per page.
- [WCAG 2.2.2 not met] → explicit owner decision, documented, reduced-motion
  fallback.
- [User-owned components not updated] → build fails loudly with
  `block_version_mismatch`; upgrade instructions list the commands.

## Migration Plan

1. Engine and packages ship together (content, render, astro registry, CLI
   bundle, create-lace template 0.40.0).
2. Consumers raise the version of every model that allows `videoEmbed`, run
   configuration sync (identity migration, settings defaults), then run
   `pnpm exec lace add block videoEmbed` before the next site build.
3. No database migration. Rollback: restore previous packages and content
   database backup; synchronized blocks at version 2 are not readable by the
   older engine, matching earlier block-version upgrades.
