## ADDED Requirements

### Requirement: The adapter ships a shared provider video player

The adapter SHALL export `@lacecms/astro/LaceVideo.astro`. The component
SHALL accept an existing canonical provider description and validated source
URL, a title, an aspect ratio and a playback mode. It SHALL accept an optional
image description and caption, and allow callers to apply their figure's
documented styling and envelope attributes. Its figure SHALL expose the
selected ratio and playback mode, the mounted ambient state, and the
applicable video area and `preview`, `play`, `player`, `caption` and
`source` hooks. Playback SHALL follow the `video-embeds` contract in both modes,
including poster handling through the adapter image component and a
keyboard-accessible provider source link. Structural styles SHALL belong to
the caller.

The shared component SHALL handle preview activation and ambient mounting
with a local script, without a provider SDK, framework hydration or provider
requests during the site build. Activation and initialization SHALL be
scoped to a single player instance. Repeated initialization, including on
Astro client navigation, SHALL NOT mount duplicate iframes. The script SHALL
leave legacy renderers outside the shared component's instance hook alone.

#### Scenario: A packed adapter renders a player with a poster
- **WHEN** a consuming Astro site imports the component from the packed
  adapter and renders a `player` Vimeo embed with a poster
- **THEN** the site builds without contacting Vimeo. The preview button and
  source link are available before activation, and keyboard activation loads
  and focuses exactly one player iframe without autoplay.

#### Scenario: A mixed page initializes twice
- **WHEN** a visible standalone ambient embed and gallery ambient video items
  are rendered together and the page is initialized twice
- **THEN** each figure contains exactly one lazy, muted, looping ambient
  iframe outside the tab order and exposes its own active state. Each source
  link is visually hidden by site CSS until it receives focus.

#### Scenario: Reduced motion and disabled JavaScript
- **WHEN** a visitor who prefers reduced motion or has disabled JavaScript
  opens a page with ambient videos with and without posters
- **THEN** no ambient player loads. Poster videos retain the preview and
  source link, and posterless videos show the ordinary non-autoplaying iframe.
  With reduced motion and JavaScript available the preview remains operable.

#### Scenario: A site upgrades just one renderer
- **WHEN** a page renders one current registry item using `LaceVideo`
  alongside an older compatible version of the other item
- **THEN** each renderer mounts or activates only its own player and neither
  player gains a duplicate iframe.

## MODIFIED Requirements

### Requirement: The adapter ships Astro-bound code only
The adapter SHALL be published as Astro component source plus a compiled server module, SHALL declare `astro` as a peer dependency within the supported range, and SHALL depend only on the render core and SDK among Lace packages. It SHALL NOT ship visual block components, an Astro integration, or re-exports of render, SDK, or content APIs. The only client script supplied by the adapter SHALL be the local video activation and ambient playback script used by the shared video component. It SHALL be part of the alpha release set at the shared release version.

#### Scenario: Packed adapter
- **WHEN** the adapter is packed for release
- **THEN** the tarball contains the server module, its declarations, and the block-list, rich-text, SEO head, image and video components, and no block component such as a hero or image block renderer

#### Scenario: Canonical import paths
- **WHEN** a site needs `defineBlockMap` or `BlockProps`
- **THEN** it imports them from the render core because the adapter does not re-export them
