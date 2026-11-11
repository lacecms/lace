## ADDED Requirements

### Requirement: The route-less entry editor shows no slug or public path
The editor of an entry of a route-less collection SHALL present the title
control, blocks, model fields and publication details of a collection entry,
and the entry actions a collection entry offers. It SHALL show no slug
control, public path, public URL fact, "Open on site" link or SEO card, and
SHALL send no slug when saving. The create-entry dialog of a route-less
collection SHALL ask only for the title, SHALL show no slug control, slug
suggestion or slug guidance, and SHALL send no slug.

#### Scenario: An editor opens a testimonial
- **WHEN** an editor opens an entry of the route-less `testimonials`
  collection
- **THEN** the editor shows the title, fields and publication details and no
  slug control, public path or "Open on site" link

#### Scenario: Saving a testimonial
- **WHEN** the editor saves a changed testimonial title
- **THEN** the save request carries no slug and the revision advances

#### Scenario: Creating a testimonial
- **WHEN** an editor opens Create entry on the `testimonials` list and submits
  the title "Ada Lovelace"
- **THEN** the dialog shows no slug control and the create request carries the
  title and no slug
