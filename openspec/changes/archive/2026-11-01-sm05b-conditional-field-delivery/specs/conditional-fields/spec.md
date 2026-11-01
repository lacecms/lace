## ADDED Requirements

### Requirement: The server enforces conditional rules on every write path
Draft creation, draft saves, duplication and publication SHALL evaluate
`visibility` rules on the server for every write path: the admin REST API,
MCP tools and `lace import`. A client SHALL NOT be able to make a visible
required field optional by omitting it, nor be forced to fill a hidden one.
Validation issues for visible targets SHALL keep the existing codes and exact
paths, including list indexes and block keys. Behavior SHALL be identical on
Node and Cloudflare.

#### Scenario: Hidden required field is not demanded
- **WHEN** an MCP client publishes a gallery item with `kind: "image"`, a `media` value and no `videoUrl`, where both targets are required
- **THEN** publication succeeds

#### Scenario: Visible required field is demanded
- **WHEN** a REST client publishes an item with `kind: "video"` and no `videoUrl`
- **THEN** publication fails with `missing_required_field` at that item's `videoUrl` path, and the entry, route, published snapshot, public-state version and build queue are unchanged

#### Scenario: Import validates through the same rules
- **WHEN** `lace import --validate-only` submits an item whose controller hides a field that carries an over-long value
- **THEN** the item is rejected with the draft length issue at that path, and an item whose hidden field holds a valid value is accepted

### Requirement: Publication stores the published projection
Publication SHALL validate the stored draft in publish mode and SHALL write
the published projection of its fields and of every block's data, including
hidden blocks, as the new published snapshot within the same guarded atomic
publication: the expected draft revision, route and singleton checks,
idempotency, public-state version increase and build request keep their
existing behavior. The stored draft SHALL keep its hidden values and revision.
Block envelopes, settings, positions, keys, title, slug and SEO SHALL be
published unchanged. An entry whose model and draft blocks declare no rules
SHALL publish exactly as before. A replayed publication SHALL return the
original result without writing another projection.

#### Scenario: Gallery publication omits stale values
- **WHEN** a draft list holds an `image` item with a stale `videoUrl` and a `video` item with a stale `media`, and the entry is published
- **THEN** the published snapshot holds both items in order, the first without `videoUrl` and the second without `media`, while the draft still holds both stale values

#### Scenario: Model-level and block-data rules
- **WHEN** a model field and a block's data field are hidden by their owners' rules and the entry is published
- **THEN** neither hidden value appears in the published snapshot and every visible value is unchanged

#### Scenario: Hidden block data is projected too
- **WHEN** a block marked hidden holds a hidden conditional value and the entry is published
- **THEN** the published snapshot keeps the hidden block with its envelope and settings and without the hidden conditional value

#### Scenario: Stale draft revision
- **WHEN** another writer saves the draft after the publisher read it and the publisher publishes with the older revision
- **THEN** publication fails with the revision conflict and no projection of either revision is published

#### Scenario: Unopted content is unchanged
- **WHEN** an entry of a model without rules, using blocks without rules, is published
- **THEN** the published snapshot equals the draft values, as before this change

#### Scenario: Toggle back after publication
- **WHEN** an editor publishes a `video` item, switches it to `image` and publishes, then switches it back to `video` in the draft
- **THEN** the draft still holds the earlier `videoUrl`, and the current published snapshot holds no `videoUrl` until the next publication

### Requirement: Published references follow the projection
Media references and internal-link references of a published snapshot SHALL
be derived from its published projection. A media item referenced only by a
hidden value SHALL count as draft usage while the draft references it and
SHALL NOT count as published usage. Internal links inside hidden values SHALL
be recorded in the draft as not delivered, SHALL NOT be checked for a
published target at publication, SHALL NOT appear in the published snapshot
and SHALL NOT be reported as incoming usage of the published source. Visible
delivered internal links SHALL keep the existing strict publication check,
evaluated inside the atomic publication on the projected references. Media
metadata edits SHALL request builds only for published references that remain.

#### Scenario: Hidden media is draft usage only
- **WHEN** the only reference to an image is a hidden `media` value of a published entry
- **THEN** the image's usage lists that entry's draft location only, deletion stays refused while the draft keeps the value, and a metadata edit of the image requests no build

#### Scenario: Hidden link to an unpublished target
- **WHEN** a hidden URL field links to an unpublished entry and the source is published
- **THEN** publication succeeds, the published snapshot and its link references omit the link, and unpublishing or deleting the target reports no incoming usage from that publication

#### Scenario: Visible link to an unpublished target
- **WHEN** the controller makes that URL field visible and the source is published
- **THEN** publication fails with `internal_link_unavailable` at the field path and nothing changes

#### Scenario: Target unpublished during publication
- **WHEN** a visible link's target is unpublished after the use case checked it but before the source's atomic publication commits
- **THEN** the atomic publication refuses with `internal_link_unavailable` on Node and Cloudflare

### Requirement: Delivery contains only the published projection
Every read of published content SHALL contain no hidden values: public entry
and global reads, the paged build export with its media dictionary and link
manifest, and the published snapshot returned by admin and MCP entry reads.
Draft reads, including admin draft lists and configured collection queries,
SHALL keep operating on draft values with hidden values retained. Delivered
representations SHALL acquire no visibility keys or computed visibility state,
and their shapes SHALL stay unchanged.

#### Scenario: Public read and build export
- **WHEN** a published gallery holds an `image` item whose draft also holds a `videoUrl`
- **THEN** the public entry read and the build export page return the item without `videoUrl`, and the export's media dictionary includes no media referenced only by hidden values

#### Scenario: Admin read shows both views
- **WHEN** an MCP client calls `get_entry` for that entry
- **THEN** the draft holds the stale `videoUrl` and the published snapshot does not

#### Scenario: Draft queries keep draft values
- **WHEN** an admin draft list filters a collection with `isSet` on a model-level target that one entry's draft holds while hidden
- **THEN** that entry matches, because draft queries read the retained draft value

### Requirement: Published value types make conditional targets optional
Typed published values SHALL mark every conditional target optional, even
when its descriptor is required or has a default, because the target is
absent when hidden. This SHALL apply to model field values, group values
(including list-item groups at every depth) and block data, using the
owner's declared rules. Unconditional fields and controllers SHALL keep their
existing optionality and value types. Owners without rules SHALL infer
exactly the types they inferred before. Draft value types SHALL be unchanged.

#### Scenario: Required target becomes optional
- **WHEN** a block declares required `media` and `videoUrl` with rules on `kind`
- **THEN** its typed published data has a required `kind` and optional `media` and `videoUrl`

#### Scenario: Unopted inference unchanged
- **WHEN** a block or model declares no rules
- **THEN** type tests show the same inferred published value types as before this change
