## ADDED Requirements

### Requirement: Repository contract fixtures cover global models
The shared repository contract SHALL configure a global model and SHALL verify
on Node SQLite and D1 that: synchronization creates its singleton draft with
the page-singleton rules; a second entry for it is refused with
`CONTENT_MODEL_CARDINALITY_CONFLICT`; publishing it creates a published
snapshot and no published route, advances the published-state version and
coalesces one build; republishing replaces the snapshot; unpublishing removes
the snapshot and leaves the draft; reverting copies the publication into the
draft without a version change; and an injected failure at any publication or
unpublication checkpoint leaves the global, version and build state unchanged.
A public global read by model key SHALL return the published global with the
active media its published snapshot references, and nothing for an unpublished
global, an unknown key or a page or collection key. Public path reads,
collection lists and the export `entries` SHALL never contain a global, the
export SHALL list published globals ordered by model key, and the public media
read SHALL serve media referenced only by a published global. The in-memory
repository fake SHALL satisfy the same global rules, and its public media read
SHALL accept media referenced by any current published snapshot.

#### Scenario: A global is published and read
- **WHEN** the contract synchronizes the `settings` global, saves a draft that
  references one media item and publishes it
- **THEN** the public global read returns its fields, blocks, publication time
  and that media item, no published route exists for the entry, and the
  published-state version advanced by one

#### Scenario: Globals stay out of routed reads
- **WHEN** a page, a collection entry and a global are published
- **THEN** path reads and collection lists never return the global, the export
  lists the page and collection entry under `entries` and the global under
  `globals`, and the export media covers all three

#### Scenario: A global is unpublished
- **WHEN** the published global is unpublished with its current snapshot ID
- **THEN** the public global read returns nothing, the export has no globals,
  the draft is unchanged and the published-state version advanced

#### Scenario: Media used only by a global is public
- **WHEN** a media item is referenced only by a published global
- **THEN** the public media read returns it on both runtimes and in the fake
