## ADDED Requirements

### Requirement: Route-less collection entries follow the collection lifecycle without a route
The create, save, publish, unpublish, revert, duplicate and delete use cases
SHALL apply to an entry of a route-less collection with the same
authorization, validation, revision, idempotency, link-impact and conflict
rules as to a routed collection entry. Create and save SHALL reject a
submitted slug with `slug_not_allowed`. Publishing SHALL resolve no public
path, SHALL create or replace no published route, and SHALL increment the
published-state version and create or coalesce one site-build request in the
same atomic mutation as every publication. Unpublishing SHALL remove only the
published snapshot and SHALL increment the published-state version and request
a build. Duplicating SHALL create an unpublished copy without a slug. An admin
entry-list query with a `slug` parameter for a route-less collection SHALL
return no entries.

#### Scenario: Publishing a route-less entry writes no route
- **WHEN** an administrator publishes a valid draft of the route-less
  `testimonials` collection
- **THEN** the entry has a published snapshot, no published route exists for
  it, the published-state version advances by one, and one pending build
  request targets that version

#### Scenario: Creating with a slug is rejected
- **WHEN** an editor creates a `testimonials` entry with the slug `ada`
- **THEN** creation fails with `slug_not_allowed` at the slug path and no entry
  is stored

#### Scenario: Unpublishing a route-less entry
- **WHEN** an administrator unpublishes a published `testimonials` entry with
  the current published snapshot ID
- **THEN** the published snapshot is removed, the draft is unchanged, the
  published-state version advances, and a build is requested
