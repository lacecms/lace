## ADDED Requirements

### Requirement: Provider-restricted URLs share validation at every boundary

A present URL value on a descriptor with `embedProviders` SHALL satisfy both
ordinary safe URL validation and the bounded video URL grammar for a declared
provider. Shared field schema compilation, block validation, nested groups/lists,
metadata-driven editor validation and server draft/publication validation SHALL
agree on acceptance and preserve the exact failing field path. Missing values
SHALL follow existing draft and publication requiredness. Render validation SHALL
use the same parser. Ordinary URLs and rich-text links SHALL retain their
existing safe URL contract. Validation SHALL require no provider network access.

#### Scenario: Supported provider versus ordinary URL
- **WHEN** a field allows only Vimeo and receives a YouTube video, a root-relative path or a generic HTTPS page
- **THEN** it fails provider validation, even though an ordinary URL field accepts those safe URLs

#### Scenario: Recursive parity
- **WHEN** a restricted URL in a list group is validated from serialized metadata, runtime definitions and the API on either runtime
- **THEN** all accept or reject identically and rejection names the same numeric item and field path
