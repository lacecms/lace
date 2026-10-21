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
setting and a `link`, both at block version 4. The reference stylesheet SHALL
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

The maintained site SHALL load Gallery's installed neutral structural stylesheet
and keep its 1rem gallery spacing and 4:3 image crop in site-owned theme CSS.
Competing unlayered rules that force every Gallery into the old grid SHALL be
removed. The default `grid`/`auto` layout SHALL retain the reference appearance,
while all other modes and presets SHALL remain selectable and CSS-overridable.

#### Scenario: Layout adoption preserves the default theme
- **WHEN** the updated fixture with Gallery version 4 and default layout settings
  is rendered
- **THEN** it retains the existing gallery image proportions, spacing, caption
  and link/lightbox behavior while exposing the shared layout hooks

#### Scenario: Site theme does not force grid for flex
- **WHEN** a Gallery fixture chooses horizontal flex and then vertical flex
- **THEN** its computed display and direction follow its settings, and the
  reference theme does not override them back to the former grid
