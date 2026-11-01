## ADDED Requirements

### Requirement: Public guidance covers gallery video items
The public block reference SHALL describe the version 5 gallery: item kinds,
the fields that apply to images and to videos, the supported providers, the
required accessible video title, playback and aspect ratio per item, captions
without a media fallback for videos, and that the lightbox and links apply to
images only. The Editing content section SHALL explain adding images through
Add and videos through "Add Video", and switching an item's Type without
losing typed values. The conditional-fields page SHALL name the built-in
gallery as the shipped example of its list-item example. The Astro
integration guidance SHALL explain the gallery video markup hooks and
`GalleryVideo.css`, the ambient fallbacks and the WCAG 2.2.2 pause-control
gap shared with `videoEmbed`, and how site code that copied the gallery
component handles published items whose `media` is absent: check the item's
`kind` and the presence of `media` before describing an image. The starter
guide SHALL carry the same adoption steps as the template upgrade
instructions: raise model versions that allow `gallery`, synchronize
configuration, then update the gallery component, because a revision 6
component fails with `block_version_mismatch` after synchronization.

#### Scenario: A reader adds a video to a gallery
- **WHEN** a reader follows the editing guidance in a generated project with
  a gallery block
- **THEN** they add a video with "Add Video", fill its URL and title, choose
  ambient playback and a square ratio, publish, and see it in the built site

#### Scenario: A reader updates a copied gallery component
- **WHEN** a reader whose site copied and edited the gallery component follows
  the upgrade guidance
- **THEN** they synchronize configuration, merge the revision 7 component and
  `GalleryVideo.css`, and their typed component compiles because it narrows
  items by `kind` and checks `media`
