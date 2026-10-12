## ADDED Requirements

### Requirement: SEO images count as media usage
An entry SHALL use a media item when its current draft or current published
snapshot names the item as its SEO image. Such usage SHALL count in
`usageCount`. It SHALL appear in the bounded usage list as an SEO image
location with its draft and published states, and it SHALL make the deletion
use case refuse the item with `MEDIA_IN_USE`. A published SEO image SHALL make
the item servable by the public media read and SHALL make metadata edits of the
item advance the published version and request a build, exactly as a
published field or block reference does.

#### Scenario: Metadata edit of a published SEO image
- **WHEN** a writer edits the alt text of media used only as a published SEO
  image
- **THEN** the update advances the published version and enqueues or
  coalesces a `media_metadata` build

#### Scenario: Draft-only SEO image
- **WHEN** media is used only by a draft SEO image
- **THEN** its `usageCount` is 1, its deletion is refused, and a metadata edit
  changes neither the published version nor build work
