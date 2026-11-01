## ADDED Requirements

### Requirement: Repository contract fixtures cover conditional publication
The shared repository contract suite SHALL prove, with identical cases on the
in-memory fake, Node SQLite and local D1, that a publication supplied with a
published projection writes exactly the projected fields, block data and
media and internal-link references while copying the draft's title, slug,
SEO, block envelopes, settings, keys and positions, and leaves the draft
snapshot, its references and its revision unchanged. Fixtures SHALL include
model-level rules, a list of group items with different controller values,
nested groups and block data, including a hidden block. The atomic link guard
SHALL refuse a projected delivered link whose target lost its route, and
SHALL ignore links absent from the projection. A failure injected at any
publication checkpoint SHALL leave no partial published snapshot or
reference. A publication without a projection SHALL keep the existing copy
behavior. D1 SHALL keep one guarded batch within the existing bind and query
budgets, with no query per item.

#### Scenario: Projected publication on each runtime
- **WHEN** an entry whose draft list holds an `image` item with a stale `videoUrl` and a block with a stale hidden media value is published with its projection
- **THEN** every implementation stores the same published fields and block data, publishes no reference for the stale values, and keeps them in the draft and its references

#### Scenario: Atomic guard on projected links
- **WHEN** a visible projected link's target is unpublished between projection and publication commit
- **THEN** every implementation refuses with `internal_link_unavailable` and the previous publication, route, public-state version and build queue remain

#### Scenario: Hidden link does not block
- **WHEN** the draft's only link to an unpublished target is hidden and the projection omits it
- **THEN** publication commits on every implementation and the published snapshot has no link reference for it

#### Scenario: Failure rolls back projected publication
- **WHEN** a failure is injected after the projected snapshot is written and before references or routes are written
- **THEN** no new published snapshot, reference, route change, version increase or build request remains

#### Scenario: Replay with a projection
- **WHEN** a projected publication is retried with the same idempotency key
- **THEN** the original result is returned and no second snapshot is written
