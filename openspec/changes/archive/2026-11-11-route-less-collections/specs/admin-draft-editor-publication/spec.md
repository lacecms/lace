## ADDED Requirements

### Requirement: Publication of a route-less entry names no path
The publication card of an entry of a route-less collection SHALL show its
status, revisions, editor, times and build state like any entry, and SHALL
show no public path, not-yet-public path text or "Open on site" link. The
publish confirmation and result announcement SHALL name no path.

#### Scenario: A published testimonial
- **WHEN** an admin opens a published `testimonials` entry while a site URL is
  configured
- **THEN** the publication card shows the publication and build state and no
  path or "Open on site" link

## MODIFIED Requirements

### Requirement: Unpublish is confirmed with its public consequence
Choosing Unpublish SHALL open a confirmation dialog that can be cancelled. It SHALL say that the entry's public path stops working after the next site build, that the draft and its unsaved changes are kept, and that publishing again makes the current draft public. For a page it SHALL say that the page's fixed path will return 404 after the next build. For a global the dialog SHALL ask to unpublish the site content and SHALL say that pages showing it fall back to their defaults after the next site build, without naming a path. For an entry of a route-less collection the dialog SHALL say that the entry disappears from the pages that list it after the next site build, without naming a path or saying that a path stops working. Confirming SHALL send one unpublish request with the publication the editor displays as the expected published snapshot and with a new idempotency key. A retry of the same attempt after a network failure SHALL reuse that key. On success the editor SHALL adopt the returned entry without discarding unsaved form changes, SHALL show the entry as not published, SHALL follow the queued build in the publication card as it does after a publication, and SHALL announce the result. When the publication changed or disappeared in the meantime, the dialog SHALL show the API's conflict or not-published error and SHALL offer to reload the entry.

#### Scenario: An admin unpublishes a collection entry
- **WHEN** an admin confirms Unpublish for a published collection entry
- **THEN** one unpublish request carries the displayed publication and an idempotency key, the publication card reads "Not published" and follows the queued build, and the draft revision is unchanged

#### Scenario: An admin unpublishes a page
- **WHEN** an admin opens Unpublish for a published page
- **THEN** the confirmation says that the page's fixed path will return 404 after the next build

#### Scenario: An admin unpublishes a global
- **WHEN** an admin opens Unpublish for the published `settings` global
- **THEN** the confirmation asks "Unpublish this site content?" and says that pages showing it fall back to their defaults after the next site build

#### Scenario: An admin cancels Unpublish
- **WHEN** an admin opens Unpublish and chooses Cancel
- **THEN** no request is sent and focus returns to the entry actions menu button

#### Scenario: Unpublish keeps unsaved changes
- **WHEN** an admin with unsaved changes in the form unpublishes the entry
- **THEN** the form keeps the unsaved values and the dirty state after the entry reads as not published

#### Scenario: The publication changed elsewhere
- **WHEN** an admin confirms Unpublish and the API reports a revision conflict
- **THEN** the dialog stays open with the error and a reload action, and the entry stays displayed as published

#### Scenario: An admin unpublishes a route-less entry
- **WHEN** an admin opens Unpublish for a published entry of the route-less
  `testimonials` collection
- **THEN** the confirmation says that the entry disappears from the pages that
  list it after the next site build and names no path
