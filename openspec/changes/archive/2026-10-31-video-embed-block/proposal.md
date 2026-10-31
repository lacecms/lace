## Why

Editors need to put YouTube and Vimeo videos on the static site without waiting
for video-file storage and upload infrastructure. An optional image preview makes
it possible to defer the external player until the visitor activates it.

## Roadmap unit

The selected **Video embeds** unit in `backlog.md` (2026-10-22), replacing the old
upload-first ordering. One independently verifiable session covers the portable
block, its generic editor form and the installed site renderer. The existing
`video-a-media-upload-delivery` draft is deferred and is not a dependency.

## What Changes

- Add version 1 `videoEmbed`: required provider video URL and accessible title,
  optional `poster` image from existing Lace media, optional caption; no settings.
- Add a portable `embedProviders` restriction to URL fields, shared validation
  and deterministic YouTube/Vimeo URL parsing. Ordinary URL fields retain their
  behavior and identity.
- Describe embeds in render core without network calls; render canonical player
  URLs in a site-owned Astro registry component. With a poster, activate through
  a keyboard-accessible button; without one, show a lazy iframe. Never autoplay.
- Install through the existing CLI registry and include in maintained reference
  and generated starter sites. Keep third-party player logic out of the CMS API.
- Explicitly narrow the existing no-script registry invariant: only the embed
  component may ship the small activation script; other blocks and the Astro
  adapter retain their current contract. Presentation remains site-owned.

## Dependencies and Non-goals

Uses existing URL/media fields, generic editor, media reference lifecycle,
publication, image description/optimization, registry installation and static
Astro builds on both deployment targets. No upload, new media kind/limit,
object-storage change, SQL migration, oEmbed/provider API requests, automatic
thumbnails, arbitrary iframe/HTML, other providers, player SDK, autoplay, looping,
start-time controls, live streams, provider availability checks or consent manager.
Provider privacy/domain restrictions remain the video owner's responsibility.

## Capabilities

### New Capabilities

- `video-embeds`: accepted provider URL grammar, canonical output, metadata-driven
  authoring, preview activation and public rendering behavior.

### Modified Capabilities

- `field-descriptors`: portable URL-field provider restriction.
- `content-validation`: shared provider-constrained URL validation.
- `block-registry`: add the versioned `videoEmbed` built-in.
- `render-core`: pure embed description with contextual failures.
- `block-source-registry`: canonical embed source and bounded activation-script exception.
- `astro-reference-site`: maintained site and starter embed delivery.

## Impact

Architecture §§4.2–4.7, 8, 9.7, 11 and 13.3–13.5 govern this change. Sections 8,
11 and 13 need the additive block/parser contract and explicit registry script
exception during apply; no storage or portability invariant changes.
Affected accepted specs are listed above. Implementation touches
`packages/content`, `packages/render`, metadata consumers in config/application,
`registry/astro/videoEmbed`, CLI registry bundling/install tests, reference site,
create-lace templates/snapshots and documentation. The admin uses existing generic
controls. No new REST endpoint, provider credential or runtime dependency.
