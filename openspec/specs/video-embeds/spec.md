# video-embeds Specification

## Purpose
Defines portable YouTube and Vimeo video embeds with optional image previews,
consistent validation and accessible playback on a statically generated site.

## Requirements

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
Playback options from input URLs SHALL NOT reach the player. The saved source
URL SHALL remain the editor's value; canonicalization SHALL affect descriptions
and rendering, not stored content. Validation SHALL establish syntax and provider
identity only, not whether a video exists or permits embedding.

#### Scenario: Equivalent YouTube links
- **WHEN** a watch, short share, shorts or embed URL identifies `dQw4w9WgXcQ`, including tracking, `start` or `autoplay` parameters
- **THEN** all descriptions use the same canonical player URL without those parameters

#### Scenario: Unlisted Vimeo keeps its privacy hash
- **WHEN** the input is `https://vimeo.com/76979871/abc123def` or `https://player.vimeo.com/video/76979871?h=abc123def`
- **THEN** the canonical player URL is `https://player.vimeo.com/video/76979871?h=abc123def`

#### Scenario: Unsafe or ambiguous input
- **WHEN** an input uses HTTP, credentials, a non-default port, `youtube.com.evil.test`, a malformed ID, conflicting Vimeo hashes, duplicate identifying parameters or pasted iframe markup
- **THEN** validation rejects it at the URL field path on both runtimes without any network request

### Requirement: Embed authoring uses the existing content lifecycle

When allowed by a model, the generic editor SHALL offer the labelled video embed
block with URL, title, optional poster and optional caption fields. The URL
control SHALL explain YouTube/Vimeo support; the poster SHALL use the existing
image picker and allow clearing. Missing required data SHALL retain ordinary
draft semantics but SHALL prevent publication. A present invalid URL SHALL fail
draft save and publication with a field error. Poster references SHALL follow
existing active-media, usage, deletion protection, hidden-block and public media
rules. The admin SHALL NOT load provider frames or fetch provider thumbnails.
Existing authorization, revision conflict recovery, and immutable published
snapshots SHALL apply unchanged on Node and Cloudflare.

#### Scenario: Publish an embed without an image
- **WHEN** an authorized editor saves and publishes a block with a supported URL and title and no poster
- **THEN** publication succeeds and public output can render the video without image media

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

The player SHALL reserve a responsive 16:9 area with no fixed minimum width;
the poster SHALL fill that area using the existing image pipeline and focal
point. The image SHALL have empty alt text because the named button supplies its
purpose. Optional caption text SHALL be escaped, shown only when present, and
SHALL NOT inherit the poster media caption. The block SHALL never autoplay,
including under reduced motion. Player permissions SHALL be restricted to
`fullscreen; picture-in-picture; encrypted-media`, with no autoplay permission.

#### Scenario: Direct iframe
- **WHEN** a visible embed without a poster renders
- **THEN** it has a lazy iframe, title, canonical provider URL and source link with no autoplay option

#### Scenario: Activate a preview
- **WHEN** a visitor activates a poster button with keyboard or pointer
- **THEN** only that block gains one iframe, receives focus, and retains its caption and source link

#### Scenario: No JavaScript or provider failure
- **WHEN** JavaScript is disabled on a poster block or the provider refuses playback
- **THEN** the visitor still has a usable source link and the rest of the page remains usable

#### Scenario: Hidden block and motion preferences
- **WHEN** a block is hidden, or a visitor prefers reduced motion
- **THEN** the hidden block emits no player or preview and any visible block never starts playback automatically
