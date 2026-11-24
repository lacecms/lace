## ADDED Requirements

### Requirement: Site builds can read thumbnails of currently published media
A verified build caller SHALL be able to read the same bounded derivative used in the admin when the media is active and eligible for the public original route. The use case SHALL check that eligibility before reading derivative storage or attempting generation and again before returning a successful result after asynchronous work. It SHALL reuse the existing stored bytes or recover a confirmed miss through the same bounded generation path. Draft-only, inactive, unreferenced and unknown media SHALL produce the same not-found outcome.

#### Scenario: A build reads an existing admin derivative
- **WHEN** a build asks for a currently published item whose thumbnail already exists
- **THEN** it receives the stored bytes and the lookup opens no original and performs no transformation

#### Scenario: A published legacy image has no derivative
- **WHEN** a build asks for a currently published media item with a confirmed missing thumbnail
- **THEN** it can create the same durable derivative as an admin read, and concurrent successful readers receive the stored winner

#### Scenario: The last published reference disappears during the read
- **WHEN** an item loses its last published reference after the read starts but before the final eligibility check
- **THEN** the build receives no thumbnail bytes even when generation succeeded and the media still exists as an active item

## MODIFIED Requirements

### Requirement: Active media has a bounded private thumbnail
An admin thumbnail read SHALL require the same active media eligibility and content read permission as an original admin preview, including for unpublished media. The original and its media identity SHALL be sufficient to derive a thumbnail for existing and new eligible items, including records without a stored SHA-256. Generation SHALL leave the original bytes, media metadata and publication state intact.

The resulting thumbnail SHALL be a single-frame WebP with a maximum longest edge of 320 pixels and a maximum body size of 96 KiB. Generation SHALL preserve display orientation, aspect ratio and transparency and SHALL avoid cropping and upscaling. Its input for a GIF SHALL be the first display frame, including its canvas and transparency. Thumbnail identity SHALL depend on the media item and thumbnail recipe, independent of the admin view, focal point and session. The stored derivative SHALL be reusable as an image source, with its media type and dimensions available to CMS callers.

The CMS SHALL schedule background generation after an upload's original and active media metadata are committed. The upload response SHALL be independent of derivative generation and persistence. An authorized read of an active item SHALL reuse its valid private stored thumbnail, or generate and persist one when the derivative is confirmed missing. The stored result SHALL survive an application restart without expiry while the source is active. Concurrent generation SHALL converge on one stored result for that media item and recipe. The runtime SHALL bound generation time, input, output, queued work and parallel work.

When a valid derivative cannot be generated, stored or read, the system SHALL report it as unavailable. It SHALL NOT substitute the original bytes or treat a storage read error as a confirmed miss. Derivative failures SHALL be independent of media upload, browsing metadata, original preview and publication.

#### Scenario: A successful upload prepares its thumbnail
- **WHEN** a supported image upload commits its original and media metadata
- **THEN** background generation prepares and stores its thumbnail independently of the upload response

#### Scenario: An upload's background attempt is interrupted
- **WHEN** an upload succeeds and background thumbnail generation stops before storing the result
- **THEN** the original remains available and a later authorized read creates and persists the missing derivative

#### Scenario: Existing unpublished media has no recorded hash
- **WHEN** a reader requests a thumbnail of active unpublished media uploaded before hashing was introduced
- **THEN** the runtime derives and stores the thumbnail from its private original without a data migration, upload or publish operation

#### Scenario: A large animated GIF is reduced to its first frame
- **WHEN** the runtime generates a thumbnail from a supported GIF whose second frame is visibly different from its first frame
- **THEN** the WebP shows the first frame, satisfies both size limits and contains no animation frames

#### Scenario: A stored thumbnail survives a runtime restart
- **WHEN** a reader requests an active item's previously stored thumbnail from a fresh runtime
- **THEN** the runtime serves the same derivative and validator without reopening or decoding the original or writing another derivative

#### Scenario: Parallel requests reach a bounded generator
- **WHEN** concurrent authorized requests and a background attempt find the same thumbnail missing
- **THEN** parallel and queued work stay within runtime limits, at most one derivative is stored, and successful callers receive the stored result

#### Scenario: Media becomes ineligible during generation
- **WHEN** a missing thumbnail starts generation and the item moves out of the active state before the result is returned
- **THEN** the read fails as ineligible and later requests cannot use the generated bytes

#### Scenario: A source exceeds the runtime transform capability
- **WHEN** a provider rejects a valid original or returns a derivative outside the declared bounds
- **THEN** the thumbnail is unavailable and an authorized reader can still request the verified original
