## MODIFIED Requirements

### Requirement: Video embeds have pure provider descriptions

The render core SHALL expose a framework-neutral description of a supported
video URL containing the provider, video ID, canonical player iframe URL,
canonical ambient iframe URL and the Vimeo privacy hash when supplied. Both URLs
SHALL follow the video-embeds canonical URL grammar, independent of the
block's settings, so a renderer chooses one by the block's playback setting. It
SHALL share content validation and SHALL never fetch metadata, generate HTML or
require a provider SDK. Invalid input SHALL fail as `invalid_block_data` with
supplied block context and URL field path. Existing block props SHALL remain
compatible, and existing description properties SHALL keep their values; poster
images SHALL use the existing image describer and its missing-media failures.

#### Scenario: Describe without infrastructure
- **WHEN** a supported URL is described with no fetch implementation, database or storage
- **THEN** it returns deterministic escaped-by-adapter data, including both player and ambient URLs, sufficient to render either playback mode

#### Scenario: Existing description values are stable
- **WHEN** `https://youtu.be/dQw4w9WgXcQ?autoplay=1` is described
- **THEN** provider, video ID and player URL equal their previous values and the ambient URL is the canonical YouTube ambient URL for `dQw4w9WgXcQ`

#### Scenario: Contextual render failure
- **WHEN** a malformed provider URL reaches site rendering
- **THEN** rendering fails as invalid block data naming model, entry, block key and URL field path
