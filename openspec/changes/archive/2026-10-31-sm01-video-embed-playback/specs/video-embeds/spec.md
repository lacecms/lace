## MODIFIED Requirements

### Requirement: Provider URLs have a bounded portable grammar

The system SHALL parse provider video URLs locally without fetching redirects,
metadata or player HTML. It SHALL accept only absolute HTTPS URLs with no user
information and no non-default port. Hosts SHALL match exactly, case-insensitively.
YouTube forms SHALL be `youtube.com/watch?v=<id>` (also `www` and `m` hosts),
`youtu.be/<id>`, and `youtube.com/embed/<id>` or `youtube.com/shorts/<id>` (also
`www` and `m`); `www.youtube-nocookie.com/embed/<id>` SHALL also be accepted.
YouTube IDs SHALL be exactly 11 ASCII letters, digits, underscores or hyphens.
Vimeo forms SHALL be `vimeo.com/<id>` (also `www`),
`vimeo.com/<id>/<hash>` (also `www`) and `player.vimeo.com/video/<id>`.
Vimeo IDs SHALL be positive decimal integers; privacy hashes SHALL be non-empty
ASCII alphanumeric strings. An `h` query parameter SHALL supply the privacy hash
for either Vimeo host form. A path hash and query hash together SHALL be accepted
only if equal. Duplicate identifying query parameters (`v`, `h`) SHALL fail;
unknown query parameters and fragments SHALL be ignored, never forwarded.
Trailing slashes on the specified video paths SHALL be accepted. Other paths,
playlist-only links, channel pages, live-event URLs, file URLs, raw iframe HTML,
missing IDs and deceptive host suffixes SHALL fail.

Canonical player URLs SHALL be
`https://www.youtube-nocookie.com/embed/<id>` or
`https://player.vimeo.com/video/<id>` with only `?h=<hash>` when present.
Canonical ambient URLs SHALL be
`https://www.youtube-nocookie.com/embed/<id>?autoplay=1&mute=1&loop=1&playlist=<id>&controls=0&playsinline=1`
for YouTube, and for Vimeo `https://player.vimeo.com/video/<id>?background=1`,
or `https://player.vimeo.com/video/<id>?h=<hash>&background=1` when a privacy
hash is present. The ambient parameters SHALL come only from the block's
playback setting. Playback options from input URLs SHALL NOT reach either
player URL. The saved source URL SHALL remain the editor's value;
canonicalization SHALL affect descriptions and rendering, not stored content.
Validation SHALL establish syntax and provider identity only, not whether a
video exists or permits embedding.

#### Scenario: Equivalent YouTube links
- **WHEN** a watch, short share, shorts or embed URL identifies `dQw4w9WgXcQ`, including tracking, `start` or `autoplay` parameters
- **THEN** all descriptions use the same canonical player URL and the same canonical ambient URL without those input parameters

#### Scenario: Unlisted Vimeo keeps its privacy hash
- **WHEN** the input is `https://vimeo.com/76979871/abc123def` or `https://player.vimeo.com/video/76979871?h=abc123def`
- **THEN** the canonical player URL is `https://player.vimeo.com/video/76979871?h=abc123def` and the canonical ambient URL is `https://player.vimeo.com/video/76979871?h=abc123def&background=1`

#### Scenario: Input playback options never reach the player
- **WHEN** the input is `https://vimeo.com/76979871?background=1&autoplay=1` and the block uses `player` playback
- **THEN** the rendered player URL is `https://player.vimeo.com/video/76979871` with no playback parameter

#### Scenario: Unsafe or ambiguous input
- **WHEN** an input uses HTTP, credentials, a non-default port, `youtube.com.evil.test`, a malformed ID, conflicting Vimeo hashes, duplicate identifying parameters or pasted iframe markup
- **THEN** validation rejects it at the URL field path on both runtimes without any network request

### Requirement: Embed authoring uses the existing content lifecycle

When allowed by a model, the generic editor SHALL offer the labelled video embed
block with URL, title, optional poster and optional caption fields, and SHALL
offer its `aspectRatio` and `playback` settings in the block's Settings with
labelled choices and descriptions. The URL control SHALL explain YouTube/Vimeo
support; the poster SHALL use the existing image picker and allow clearing.
Missing required data SHALL retain ordinary draft semantics but SHALL prevent
publication. A present invalid URL SHALL fail draft save and publication with a
field error. A setting value outside its declared choices SHALL fail draft save
and publication at its setting path on both runtimes. Poster references SHALL
follow existing active-media, usage, deletion protection, hidden-block and
public media rules. The admin SHALL NOT load provider frames or fetch provider
thumbnails. Existing authorization, revision conflict recovery, and immutable
published snapshots SHALL apply unchanged on Node and Cloudflare.

#### Scenario: Publish an embed without an image
- **WHEN** an authorized editor saves and publishes a block with a supported URL and title and no poster
- **THEN** publication succeeds and public output can render the video without image media

#### Scenario: Choose aspect ratio and playback
- **WHEN** an editor adds a video embed, selects aspect ratio `1:1` and playback `ambient` in Settings, then saves and publishes
- **THEN** the published block carries those settings, while a new block left untouched carries `16:9` and `player`

#### Scenario: Unknown setting value
- **WHEN** a client saves a video embed with aspect ratio `21:9` or playback `autoplay`
- **THEN** the save is rejected at that setting path on Node and Cloudflare and stored content is unchanged

#### Scenario: Draft authoring and invalid URLs
- **WHEN** an editor saves a new block with missing required fields, or tries to save a present unsupported URL
- **THEN** the incomplete block can remain a draft but cannot publish, while the unsupported URL fails save with a field error

#### Scenario: Poster reference remains protected
- **WHEN** a saved draft or published block refers to a poster
- **THEN** existing media usage and deletion protection include that reference, and removing the draft poster does not change the published snapshot

#### Scenario: Read-only and concurrent editing
- **WHEN** a viewer attempts to save an embed or an editor saves over a newer revision
- **THEN** existing authorization or revision-conflict behavior rejects the mutation and preserves stored content

### Requirement: Public players support optional image activation

Every visible block SHALL reserve a responsive area with the block's selected
aspect ratio and no fixed minimum width, and SHALL expose that ratio as a
stable hook for site styles. This requirement defines `player` playback, which
is also the fallback of `ambient` playback.

A visible block without a poster SHALL render a lazy-loaded iframe with the
canonical player URL, escaped title, fullscreen support and
`referrerpolicy="strict-origin-when-cross-origin"`. With a poster it SHALL render
an image preview and a native button named `Load video: <title>`; before activation
there SHALL be no live provider iframe, third-party thumbnail or provider request
initiated by the block. Activation by pointer, Enter or Space SHALL create exactly
one iframe within that block, remove its preview control, and focus the iframe.
Repeated events and multiple blocks SHALL not create duplicate or shared players.
The iframe SHALL not request autoplay; visitors start playback using player
controls, so a second interaction can be necessary. Without JavaScript a poster
block SHALL retain an accessible external link to its validated source URL.
Every block SHALL retain a visible external source link after activation as a
fallback for unavailable or embedding-disabled videos. No raw HTML SHALL render.

The poster SHALL fill the reserved area using the existing image pipeline and
focal point. The image SHALL have empty alt text because the named button
supplies its purpose. Optional caption text SHALL be escaped, shown only when
present, and SHALL NOT inherit the poster media caption. In `player` playback
the block SHALL never autoplay, including under reduced motion. Player
permissions SHALL be restricted to `fullscreen; picture-in-picture;
encrypted-media`, with no autoplay permission.

#### Scenario: Direct iframe
- **WHEN** a visible `player` embed without a poster renders
- **THEN** it has a lazy iframe, title, canonical provider URL and visible source link with no autoplay option

#### Scenario: Activate a preview
- **WHEN** a visitor activates a poster button with keyboard or pointer
- **THEN** only that block gains one iframe, receives focus, and retains its caption and source link

#### Scenario: Aspect ratio is reserved before loading
- **WHEN** a `9:16` block renders with or without a poster
- **THEN** its video area has a 9:16 shape before any player loads, and a `16:9` block keeps the previous shape

#### Scenario: No JavaScript or provider failure
- **WHEN** JavaScript is disabled on a poster block or the provider refuses playback
- **THEN** the visitor still has a usable source link and the rest of the page remains usable

#### Scenario: Hidden block and motion preferences
- **WHEN** a block is hidden, or a visitor who prefers reduced motion views a `player` block
- **THEN** the hidden block emits no player or preview and the visible `player` block never starts playback automatically

## ADDED Requirements

### Requirement: Ambient playback shows a muted looping video

A visible block with `ambient` playback SHALL, when the page loads with
JavaScript available and the visitor does not prefer reduced motion, mount
exactly one lazy-loaded iframe with the canonical ambient URL, the escaped
title, `referrerpolicy="strict-origin-when-cross-origin"`, permissions
restricted to `autoplay; encrypted-media`, and no keyboard focus stop. The
provider SHALL play it muted, looping and without player controls. When a
poster is present, the poster SHALL remain visible beneath the player area
until the player covers it, and its preview button SHALL become inert. The
source link SHALL remain in the markup, reachable by keyboard and assistive
technology, and SHALL be visually hidden only while the ambient player is
mounted, becoming visible when it receives focus. Caption behavior SHALL match
`player` playback.

The initial HTML of an ambient block SHALL contain no live provider iframe and
SHALL cause no provider request; the mounting decision SHALL be made once on
page load. When the visitor prefers reduced motion, the block SHALL behave
exactly like `player` playback with the same poster, title, caption and source
link. Without JavaScript it SHALL fall back to `player` behavior: a poster block
keeps its poster and visible source link, and a block without a poster shows a
non-autoplaying lazy player iframe. Multiple ambient blocks SHALL each mount
their own single player, and repeated initialization SHALL not create
duplicates. Ambient playback SHALL provide no pause control; documentation SHALL
state that this does not meet WCAG 2.2.2 for videos longer than five seconds and
that site owners can add a control in their component copy.

#### Scenario: Ambient video starts silently
- **WHEN** a visitor without a reduced-motion preference opens a page with an ambient Vimeo block
- **THEN** one iframe with `background=1`, the block title and autoplay permission is mounted, it is not a tab stop, and the source link is visually hidden but focusable

#### Scenario: Poster stays under the ambient player
- **WHEN** an ambient block with a poster loads
- **THEN** the poster is visible in the reserved area until the player paints over it, and its preview button can no longer be activated or focused

#### Scenario: Reduced motion falls back to player
- **WHEN** a visitor who prefers reduced motion opens an ambient block with a poster, and another without a poster
- **THEN** the first shows the `Load video` button and the second a non-autoplaying player iframe, both with visible source links and no ambient URL request

#### Scenario: No JavaScript
- **WHEN** JavaScript is disabled on a page with ambient blocks
- **THEN** no ambient iframe is created, a block without a poster shows the non-autoplaying player iframe, and every block shows its source link

#### Scenario: Several ambient videos
- **WHEN** a page contains six ambient blocks and initialization runs twice
- **THEN** each block has exactly one ambient iframe
