## ADDED Requirements

### Requirement: Entry lifecycle use cases carry the SEO group
Create and save SHALL accept an optional SEO group as part of the complete
editable draft. An absent or `null` group SHALL store no SEO values, so a save
still replaces the whole draft. For a model without SEO enabled, a submitted
group that is not `null` SHALL fail with a content validation issue
`seo_not_allowed` at `/seo`, with no repository write. Draft and publish
validation SHALL both apply the shared SEO rules. Publication SHALL validate
the stored draft's group again in publish mode. The publication idempotency
fingerprint SHALL cover the group. An SEO image SHALL be recorded as a draft
media reference with source `$seo` and path `image`. It SHALL count toward the
200-reference limit and SHALL require an `active` media item, exactly like a
media field. Revert SHALL restore the published group. Duplicate SHALL copy
the source draft's group and its image reference. A singleton created by
synchronization SHALL start without a group. Authorization SHALL be that of
the surrounding command.

#### Scenario: Save and publish an SEO group
- **WHEN** an editor saves a draft of an SEO-enabled collection entry with
  `seo: {title: "Hello", image: "media-1", canonical: "https://example.com/hello"}`
  and then publishes it
- **THEN** the draft and the new published snapshot carry that group, and both
  snapshots reference `media-1` from `$seo`/`image`

#### Scenario: Saving without a group clears it
- **WHEN** an editor saves a draft that previously had an SEO group and omits
  `seo`
- **THEN** the new draft revision carries no group and no `$seo` reference

#### Scenario: Reject SEO on a model without it
- **WHEN** a save for a model without SEO submits `seo: {title: "x"}`
- **THEN** it fails with `422` issue `seo_not_allowed` at `/seo` and the draft
  revision is unchanged
- **WHEN** the same save submits `seo: null`
- **THEN** the save succeeds

#### Scenario: Reject an unavailable SEO image
- **WHEN** a save names an SEO image that does not exist or is not `active`
- **THEN** it fails as an unavailable media reference does and writes nothing

#### Scenario: Duplicate and revert copy the group
- **WHEN** an entry with a published SEO group and a different draft group is
  reverted, and another entry with a draft group is duplicated
- **THEN** the reverted draft carries the published group, and the copy's
  draft carries the source draft's group and image reference
