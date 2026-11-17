## Why

The standalone `videoEmbed` block and gallery video items both render YouTube
and Vimeo players, but maintain separate markup and playback scripts. This
implements the shared player item in the [backlog](../../../../backlog.md)
as one session so both existing callers share fixes and any future uploaded
video has a clear place to integrate.

## What Changes

- Provide a shared `LaceVideo.astro` component through `@lacecms/astro` and
  use it from the registry's `videoEmbed` and gallery components.
- Preserve published data, styling hooks, poster activation, accessible source
  links, playback defaults, and reduced-motion and no-script fallbacks.
- Keep outer block and gallery layout and structural stylesheets in site-owned
  sources. Package the shared player markup and its small local playback script
  as a deliberate, scoped update to architecture §13.4 and §13.5. Preserve
  the separation of shared rendering and editable blocks in ADR 0006.
- Update the two registry revisions, package requirements and maintained site
  copies. Existing sites opt in using the existing package and block update
  commands, with the existing source conflict protection.

Scope is the current YouTube and Vimeo playback. Uploaded video, new media
fields, admin changes, new player controls and content migrations are outside
this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [astro-adapter](../../../specs/astro-adapter/spec.md) exposes the shared provider
  player and its local playback behavior.
- [block-source-registry](../../../specs/block-source-registry/spec.md) integrates
  the shared adapter component in the two site-owned source items.
- [gallery-block](../../../specs/gallery-block/spec.md) routes video items through
  the shared component and preserves gallery-specific behavior.
- [astro-reference-site](../../../specs/astro-reference-site/spec.md) verifies
  both callers together and documents renderer-only upgrades for already
  compatible sites.

## Impact

The change touches [architecture §13](../../../../docs/architecture/rendering.md#13-site-rendering-and-block-installation),
`@lacecms/astro`, the Astro registry, maintained site sources and locks,
generated starter metadata, integration tests and site documentation.
`describeVideoEmbed` keeps its existing contract in `@lacecms/render`, and
the [video-embeds capability](../../../specs/video-embeds/spec.md) remains the
source for provider URLs and standalone playback behavior. The public build
export and API stay compatible on Node and Cloudflare.
