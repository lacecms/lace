## ADDED Requirements

### Requirement: Media references respect the accepted media kind
A draft save SHALL treat a media reference as valid only when, in addition to
the existing active-media rule, the referenced item's kind (`image` for
`image/*` MIME types, `video` for `video/*`) is accepted by the declaring media
field. The SEO image SHALL accept images only. A violation SHALL fail the save
with the same stable error as an unavailable media reference, identifying the
media identifier, and SHALL write nothing. Revert, duplicate and publication
SHALL keep copying already validated snapshots without re-checking kinds.

#### Scenario: A video in an image-only field is rejected
- **WHEN** a writer saves a draft whose `image` block references active
  `video/mp4` media
- **THEN** the save fails as for an unavailable media reference and the stored
  draft and its media-reference projection are unchanged

#### Scenario: A video in a video-accepting field is saved
- **WHEN** a writer saves a draft whose custom block field declared with
  `accept: ["video"]` references active `video/webm` media
- **THEN** the save succeeds and the media usage lists that block location

#### Scenario: A video as the SEO image is rejected
- **WHEN** a writer saves a draft whose SEO group's `image` references active
  video media
- **THEN** the save fails and writes nothing
