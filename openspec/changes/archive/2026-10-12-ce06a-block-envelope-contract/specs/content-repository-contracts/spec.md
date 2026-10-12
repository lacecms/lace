## ADDED Requirements

### Requirement: Repository contract fixtures cover the block envelope
The shared repository contract suite SHALL include a block type that declares
settings and SHALL prove the following on the in-memory fake, Node SQLite and
D1:

- create, save, publish, revert and duplicate persist and copy each block's
  anchor, class name, hidden flag and settings exactly;
- a block migration during synchronization rewrites settings and keeps the
  anchor, class name and hidden flag;
- a hidden block's media references are stored, block media deletion with
  `MEDIA_IN_USE` and appear in media usage;
- public page, collection, slug, path and global reads and the build export
  leave hidden blocks out of `blocks`;
- media referenced only by hidden blocks of a published snapshot are left out
  of the media dictionaries and are not served by the public media read, while
  media also referenced by a visible block, a field or the SEO group stay in
  them;
- the stored anchor uniqueness holds per snapshot, so a draft and its
  published copy may share anchors.

#### Scenario: The envelope survives the publication lifecycle
- **WHEN** a draft with an anchored, class-named, hidden block with settings is
  saved, published, edited and reverted on each runtime
- **THEN** each read returns the expected envelope values

#### Scenario: Hidden blocks are not delivered
- **WHEN** a published entry holds a visible block and a hidden image block
  whose media is used nowhere else, and it is read publicly and exported
- **THEN** each response lists only the visible block, the hidden block's media
  is in no media dictionary, and the public media read does not serve it

#### Scenario: Hidden-block media is protected
- **WHEN** deletion is requested for media referenced only by a hidden block
  of a published snapshot
- **THEN** deletion fails with `MEDIA_IN_USE`
