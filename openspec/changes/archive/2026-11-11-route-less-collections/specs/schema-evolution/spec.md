## ADDED Requirements

### Requirement: Adding or removing a collection route is a route change
Synchronization SHALL classify adding a route to a route-less collection and
removing the route of a collection as a `breaking` route change of a model
that stays of kind `collection`; it SHALL NOT report a kind change. Like every
path or route change it SHALL be refused while the model has a published
snapshot. Removing a route SHALL additionally be refused while any draft or
published snapshot of the model holds a slug, or while any current snapshot
holds an internal reference to an entry of the model; the refusal SHALL name
the model, the class, the total number of the model's affected snapshots
(holding a slug or targeted by a reference) and up to 20 of them by entry ID,
state and title, and SHALL tell the operator to clear the slugs or references
first. An applied change SHALL keep every stored value, SHALL
create or remove no published route, and SHALL require the model version
increase of any structural change. After a route is added, existing drafts
without a slug SHALL stay valid drafts and each entry's next publication
SHALL require a slug.

#### Scenario: Adding a route to an unpublished route-less collection
- **WHEN** the route-less `testimonials` collection with two drafts and no
  publication declares `route: "/testimonials/:slug"` and increases its version
- **THEN** synchronization applies the change, the drafts keep their content
  without slugs, and publishing one of them requires a slug

#### Scenario: Changing the route of a published collection is refused
- **WHEN** a collection with a published entry adds or removes its route
- **THEN** synchronization is refused as a `breaking` route change and nothing
  is written

#### Scenario: Removing a route while drafts hold slugs
- **WHEN** the unpublished `cv` collection removes its route while two drafts
  still hold slugs
- **THEN** synchronization is refused, the report names both snapshots and
  tells the operator to clear the slugs, and nothing is written

#### Scenario: Removing a route of a linked collection
- **WHEN** the unpublished `cv` collection removes its route while a page
  draft holds `entry:<cv-entry-id>`
- **THEN** synchronization is refused, the report names the linked `cv` entry,
  and nothing is written
