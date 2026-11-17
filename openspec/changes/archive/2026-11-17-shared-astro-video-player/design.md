## Context

Both registry renderers already rely on the pure `describeVideoEmbed` contract
in `@lacecms/render`. They differ in their outer markup, their default mode
and whether their data can reference a poster. The duplicated part is the
iframe, activation and ambient mounting logic.

Architecture §13.4 currently excludes client scripts from the adapter and
§13.5 locates the video scripts in the registry blocks. This change proposes a
narrow revision to both sections to put the script in a shared Astro primitive.
The site continues to own each block and its CSS under ADR 0006.

## Goals / Non-Goals

**Goals**

- Give custom Astro sites and both built-ins one packaged player with a narrow,
  typed interface.
- Preserve the current static output contract, including styling hooks and the
  ability to use the source link when playback is unavailable.
- Allow sites to update either renderer independently through the existing CLI.

**Non-Goals**

- A new block definition, a change to the transport or content model, or
  a generic provider plugin interface.
- A video upload path, native-file playback, or an expanded settings or
  accessibility feature set. The documented ambient pause-control limitation
  still applies.

## Decisions

### Put the player in the Astro adapter

Expose `@lacecms/astro/LaceVideo.astro`, following the package export and
packaging pattern of `LaceImage.astro`. The typed input uses the existing
provider description, validated source URL, title, aspect ratio and playback
mode, with an optional resolved image description and poster sizes. The
component renders one figure, including the optional caption and source link.
It accepts the figure attributes needed for the documented block and gallery
hooks. The render core still validates and describes URLs without knowing Astro.

Each site-owned wrapper adapts its parsed block props. The standalone
component supplies the block's envelope on the player figure, and the gallery
supplies its figure hooks while retaining the layout cell and mixed item loop
in the registry source. The standalone defaults stay `player` and `16:9`.
Gallery video defaults stay `ambient` and `16:9`, with no gallery poster field.
The site-owned `VideoEmbed.css` and `GalleryVideo.css` companions keep the
structural layout and source-link styles so existing customization and CLI
conflict behavior still apply. The adapter publishes no visual stylesheet.

A copied registry helper would need shared-file ownership and conflict rules
that the installer does not currently provide. Using the adapter gives each
block its own installable item and preserves the existing registry model.
During apply, document the narrow allowance for the player script in
architecture §13.4 and record its use by the two wrappers in §13.5.

### Scope browser behavior to each shared player

The component owns one Astro-processed local script for preview activation and
ambient initialization. Use an additive instance hook on the figure to scope
events and initializers to the new component. Legacy renderers can coexist on
the same page when a site updates one registry item at a time. Each new
instance retains the existing `data-lace-ambient` state contract and
initializes idempotently on initial load and `astro:page-load`. Focus moves
from an activated poster button to that instance's iframe. Each ambient
figure uses the same limited permissions, focus behavior and reduced-motion
fallback already specified for the embed block.

Keep both ambient URLs and poster-gated player URLs inside inert templates
until needed. Preserve the unenhanced source link and the no-script player
for embeds without a poster. Build-time resolution of poster media keeps the
existing image pipeline. It requires no provider requests or credentials.
Provider SDKs and hydrated components would add browser dependencies to
behavior already covered by local DOM events.

### Update the packaged adapter and the registry together

Advance both registry revisions and require the first compatible adapter
release exporting the player. Published `0.1.0-rc5` does not expose
`LaceVideo.astro`. Updating registry package requirements depends on the
selection of a compatible candidate in an explicit release session, as
required by [alpha-release-artifacts](../../../specs/alpha-release-artifacts/spec.md).
Keep the same block-definition versions,
component filenames, stylesheet companions and separate item ownership.
Regenerate the starter, reference site and existing-site fixture copies and
their site locks through the existing registry workflow. Keep the
already-supported version 1 `videoEmbed` configuration migration separate
from this renderer revision.

## Risks / Trade-offs

- Moving markup could break a selector in site CSS. Keep documented hooks,
  figure and cell relationships, and focus-visible source links. Exercise
  both wrappers on a mixed page at narrow and normal viewport widths.
- Adapters and registry updates can arrive at different times. Verify the
  packaged import in an installed consumer, check package guidance from the
  registry, and exercise an old and a new renderer on the same page.
- Some sites customize the existing playback scripts. Existing file hashes
  guard those edits. The site guide should explain how to adopt the new
  player or keep a custom renderer, including how to preserve any local
  ambient pause control.

## Migration Plan

Ship compatible packages and installer sources together. New sites get the
revised wrappers through the starter or ordinary installation. Sites with
compatible block definitions update their packages and explicitly update
either or both registry items through `lace add block`. The existing
conflict and `--write-new` flow preserves edited sources and their lock
records. The same published export works with the previous compatible
renderers, so rollback restores the previous site sources and lock together
without a database or configuration migration.
