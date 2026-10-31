## Why

Portfolio and showcase sites present work as silent, looping videos in mixed
formats. The built-in `videoEmbed` always reserves a 16:9 area and never
autoplays, so square or vertical Vimeo loops (the main video format of
tatianae.com, the first site migrating to Lace) cannot be authored without a
custom block and a hand-written renderer.

## Roadmap unit

Step **SM1** of [`docs/site-migration-roadmap.md`](../../../../docs/site-migration-roadmap.md),
a single session (size S). Prerequisite `video-embed-block` was archived and
synchronized on 2026-10-31.

## What Changes

- `videoEmbed` moves to version 2 with two required scalar settings that keep
  today's behavior by default: `aspectRatio` (`16:9`, `4:3`, `1:1`, `4:5`,
  `9:16`; default `16:9`) and `playback` (`player`, `ambient`; default
  `player`). Data fields are unchanged; version 2 declares an identity
  migration, and configuration sync fills the setting defaults.
- The video description gains a canonical ambient player URL next to the
  existing one: Vimeo `background=1`; YouTube autoplay, mute, loop (with the
  single-video playlist), no controls and inline playback. Player URLs stay
  byte-identical. Input URL options still never reach either player.
- The registry component reserves the selected aspect ratio. In `ambient`
  mode its existing local script mounts one muted, looping, autoplaying,
  control-free iframe that visitors cannot focus; the poster, when present,
  stays visible underneath until the player paints. The source link stays in
  the markup but is visually hidden until focused.
- `ambient` falls back to exact `player` behavior when the visitor prefers
  reduced motion or JavaScript is unavailable. No provider request happens
  before the script decides.
- **Owner decision:** ambient mode ships without a pause control. This does
  not meet WCAG 2.2.2 (Pause, Stop, Hide) for videos longer than five
  seconds; documentation states this, and site owners can add a control in
  their own copy of the component.
- Reference site, generated starter, root configuration and documentation
  adopt the new version; template 0.40.0 carries upgrade instructions.

## Scope, Dependencies and Non-goals

Uses the existing block settings, generic Settings editor, choice-card
presentation, CE1 block migrations, registry installation and static builds
on both runtimes. No database migration, API endpoint, admin feature or new
media kind. Non-goals: a pause or play control, provider player SDKs or
`postMessage` control, pausing off-screen videos, start time, custom aspect
ratios, uploaded video files, other providers, autoplay with sound, and any
change to the URL grammar.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `video-embeds`: ambient canonical URL, settings in authoring, aspect ratio,
  ambient playback, reduced-motion and no-JavaScript fallback; "never
  autoplay" becomes a `player`-mode rule.
- `block-registry`: `videoEmbed` version 2 with two settings and an identity
  migration.
- `render-core`: the pure description includes the ambient player URL.
- `block-source-registry`: the registry component exposes aspect ratio and
  playback hooks; the existing script exception covers ambient mounting.
- `astro-reference-site`: fixtures and starter cover aspect ratios and ambient
  playback at block version 2.

## Impact

- Architecture §8 *Initial built-in blocks* (the `videoEmbed` bullet) and
  §13.5 registry script exception wording; no invariant outside them.
- Code: `packages/content` (definition, `parseVideoEmbed`), `packages/render`,
  `registry/astro/videoEmbed`, `apps/site`, `packages/create-lace` templates
  and `TEMPLATE_VERSION`, root `lace.config.ts`, test fixtures, docs.
- **BREAKING for user-owned sites:** after upgrading, models that allow
  `videoEmbed` must raise their version and run configuration sync, and the
  site must install registry revision 2; older components fail with
  `block_version_mismatch`. Upgrade instructions cover both steps.
