## ADDED Requirements

### Requirement: LaceClient remains source-compatible with 1.0.0

The SDK SHALL preserve the public `LaceClient` interface's 1.0.0 required members, signatures and assignability. A 1.0.0 consumer, custom implementation or test double SHALL compile unchanged against the published 1.1.0 SDK declaration entry. The inferred client returned by `createLaceClient()` SHALL be assignable to `LaceClient` and expose `getBuildThumbnail()` with its typed arguments and result. The built-in published-site loader SHALL retain lazy, build-token-bound thumbnail access when image optimization is enabled. Existing published reads SHALL retain their 1.0.0 transport behavior.

#### Scenario: A consumer supplies a client with the released 1.0.0 shape
- **WHEN** unchanged source declaring a custom client and a typed test double with the 1.0.0 member set is compiled against the 1.1.0 package entry
- **THEN** both satisfy `LaceClient` without a thumbnail stub, cast or suppression

#### Scenario: A consumer uses the 1.1.0 factory
- **WHEN** it calls `createLaceClient()` through the public package entry
- **THEN** it can pass the result where `LaceClient` is expected and can call `getBuildThumbnail()` directly with its declared result type

#### Scenario: An existing site still uses the 1.0.0 SDK
- **WHEN** the released 1.0.0 SDK reads published content and a format 2 export from the 1.1.0 API
- **THEN** reads and conditional export validation succeed without a thumbnail request
