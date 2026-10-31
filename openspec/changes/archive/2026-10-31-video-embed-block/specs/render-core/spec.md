## ADDED Requirements

### Requirement: Video embeds have pure provider descriptions

The render core SHALL expose a framework-neutral description of a supported
video URL containing the provider, video ID, canonical iframe URL and the Vimeo
privacy hash when supplied. It SHALL share content validation and SHALL never
fetch metadata, generate HTML or require a provider SDK. Invalid input SHALL
fail as `invalid_block_data` with supplied block context and URL field path.
Existing block props SHALL remain compatible; poster images SHALL use the
existing image describer and its missing-media failures.

#### Scenario: Describe without infrastructure
- **WHEN** a supported URL is described with no fetch implementation, database or storage
- **THEN** it returns deterministic escaped-by-adapter data sufficient to render a player

#### Scenario: Contextual render failure
- **WHEN** a malformed provider URL reaches site rendering
- **THEN** rendering fails as invalid block data naming model, entry, block key and URL field path
