## ADDED Requirements

### Requirement: Public guidance covers conditional fields
The Content modeling section SHALL explain conditional fields for a generated
project: declaring `visibility` on models, group fields (including list items)
and block data; sibling `select` or `boolean` controllers, optional
controllers and defaults; the rejected forms (chains, self references,
non-sibling controllers, rules on settings, scalar or list descriptors, SEO
defaults naming a conditional field); that hidden fields are never required
but are still validated as drafts; that hidden values stay in drafts and are
omitted from published content, the public API and the build export; the
optional published value types for site code; and that changing rules is a
structural change synchronized like other model or block definition changes.
It SHALL include a complete example of a list item whose `kind` decides between
an image and a video URL, and SHALL state that block settings keep
`settingsVisibility`, which only hides controls.

The Editing content section SHALL explain that switching a controller hides
and shows fields without losing typed values, that hidden values are saved but
not published, that a hidden field with an invalid value stays shown until it
is fixed or cleared, and that revert to published restores only published
values, so hidden draft values are lost. The internal topic map SHALL record
the pages' internal sources.

#### Scenario: A reader adds a conditional field
- **WHEN** a reader follows the conditional-fields guidance in a generated project
- **THEN** they can declare a `visibility` rule that configuration accepts, synchronize it, see the admin hide and show the target, and read published content without hidden values

#### Scenario: A reader chooses between the two rules
- **WHEN** a reader wants a setting control to appear only for some layouts
- **THEN** the guidance directs them to `settingsVisibility` and explains that data `visibility` is the rule that changes requiredness and published content
