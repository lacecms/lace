## MODIFIED Requirements

### Requirement: Images are described from resolved media
The render core SHALL give block components an image describer that takes a media identifier and an optional usage alt text and returns an image description with `src`, `alt`, and, when known, `width`, `height`, `objectPosition`, `caption`, `mimeType` and `sourceUrl`. When the entry provides resolved media, the description SHALL use the resolved item's URL, dimensions, caption and media type, the item's build source URL when the item has one, the effective alt text (non-blank usage alt, then the media alt text, then an empty string), and an `objectPosition` of `X% Y%` derived from the focal point with at most two decimal places, omitted when the item has no focal point. When the entry provides resolved media but the identifier is not among them, describing SHALL fail with `missing_media` naming the media identifier, model key, entry identifier, and block key. When the entry provides no resolved media, the description SHALL use the media URL builder and the usage alt text or an empty string, without dimensions, media type or build source URL. Describing SHALL never fetch media or read image bytes.

#### Scenario: A described image with a focal point
- **WHEN** a block describes media of 1600 × 900 pixels with alt text `Office` and focal point `{x: 0.25, y: 0.4}` without usage alt text
- **THEN** the description has the resolved URL, alt `Office`, width 1600, height 900 and object position `25% 40%`

#### Scenario: Usage alt text wins
- **WHEN** a block describes the same media with usage alt text `Team at work`
- **THEN** the description's alt text is `Team at work`

#### Scenario: Referenced media is missing
- **WHEN** an entry with resolved media renders a block whose media identifier is not resolved
- **THEN** rendering fails with `missing_media` naming the identifier, model, entry, and block key

#### Scenario: Media type and build source reach the description
- **WHEN** a block describes resolved `image/jpeg` media whose resolved item has a build source URL
- **THEN** the description carries `mimeType` `image/jpeg` and that `sourceUrl`, and its `src` remains the resolved public URL

#### Scenario: Resolved media without a build source
- **WHEN** a block describes resolved media whose item has no build source URL
- **THEN** the description has no `sourceUrl`

#### Scenario: Unresolved media fallback
- **WHEN** an entry without resolved media describes a media identifier
- **THEN** the description has the media URL builder's URL and no dimensions, media type or build source URL
