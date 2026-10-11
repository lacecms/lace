## ADDED Requirements

### Requirement: Repository contract fixtures cover the SEO group
The shared repository contract suite SHALL include an SEO-enabled model and
SHALL prove the following on the in-memory fake, Node SQLite and D1:

- create, save, publish, revert and duplicate persist and copy the SEO group
  exactly;
- save replaces the draft's `$seo` media reference;
- publication copies it to the published snapshot;
- revert and duplicate copy it to the new draft;
- an SEO image blocks media deletion with `MEDIA_IN_USE`;
- an SEO image counts in `usageCount` and appears in media usage with source
  `seo` and field `image`;
- an image referenced only by a published SEO group is served by the public
  media read and appears in the media dictionary of public reads and the
  build export;
- an image referenced only by a draft SEO group is not served and does not
  appear there;
- a hinted synchronization that disables SEO clears every group and `$seo`
  reference of the model atomically, and leaves other models untouched;
- block migrations and field renames or removals during synchronization leave
  SEO groups and `$seo` references unchanged.

#### Scenario: SEO survives the publication lifecycle
- **WHEN** a draft with an SEO group and image is saved, published, edited,
  and reverted on each runtime
- **THEN** each read returns the expected group and reference rows

#### Scenario: SEO image protects media
- **WHEN** media is referenced only by a draft SEO image and its deletion is
  requested
- **THEN** deletion fails with `MEDIA_IN_USE` and the media detail lists one
  `seo`/`image` location in the draft

#### Scenario: SEO image in public media
- **WHEN** an entry whose published SEO group names `media-2`, used nowhere
  else, is read publicly and exported
- **THEN** `media-2` is in each media dictionary and the public media read
  serves it

#### Scenario: Hinted prune is atomic
- **WHEN** a hinted SEO removal fails at an injected checkpoint
- **THEN** every snapshot keeps its SEO group and references, and a retry
  prunes them all
