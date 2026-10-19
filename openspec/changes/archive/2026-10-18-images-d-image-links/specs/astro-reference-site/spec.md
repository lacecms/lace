## MODIFIED Requirements

### Requirement: Reference site renders optimized images and lightboxes
The reference site SHALL configure Astro remote images with the adapter's
media allowance. In fixture mode with an explicitly configured API base URL it
SHALL keep image optimization on, so a fixture build against a served media
origin produces WebP variants, placeholders and lightboxes; in fixture mode
without an explicit API base URL it SHALL switch optimization off so the
default fixture build needs no media origin. The committed fixture SHALL hold
an `image` block with the lightbox on, a `gallery` block with the lightbox on
whose items include one with a `link`, an `image` block with the default
setting and a `link`, at block versions 4 and 3. The reference stylesheet SHALL
style the lightbox trigger, the dialog, its backdrop and close button, and the
image link's focus ring.

#### Scenario: Fixture build against a served media origin
- **WHEN** the fixture build runs with an API base URL whose public media
  path serves the fixture images
- **THEN** every block image has WebP variants under `/_astro/`, opaque
  images carry a placeholder, the lightbox-enabled blocks render their
  dialogs with the original public URLs, the default-setting image has no
  dialog, and the linked image and the linked gallery item render anchors to
  their links without dialogs

#### Scenario: Default fixture build without a media origin
- **WHEN** the fixture build runs without an API base URL
- **THEN** it succeeds without network access and every image keeps its
  public media URL without `srcset`
