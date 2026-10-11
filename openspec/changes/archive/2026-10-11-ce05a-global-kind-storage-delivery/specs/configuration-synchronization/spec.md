## MODIFIED Requirements

### Requirement: Synchronization creates page singletons and advances public projection state
The system SHALL create one draft-only singleton entry for every newly created
page model and every newly created global model in the same guarded atomic
operation as its model identity. That entry SHALL use the configured model
defaults, an empty block list, a `NULL` slug, the model label (or its stable
key when no optional label is configured) as its title, and
`system:content-sync` as its audit actor; it MAY omit required model fields
until publication. Collections SHALL NOT receive an entry from
synchronization. If one or more committed operations change a serializable
configuration projection visible to public consumers or rewrite a published
snapshot, the operation SHALL increment the global published-state version and
create or coalesce exactly one pending site-build request for that version in
the same atomic mutation. An apply whose operations only record structure
baselines SHALL NOT advance the version or enqueue build work.

#### Scenario: New page receives one system draft
- **WHEN** synchronization creates a page model that has no persisted identity
- **THEN** it commits the model and exactly one singleton draft entry with the
  configured defaults, empty blocks, `NULL` slug, model-label title, and
  `system:content-sync` audit values

#### Scenario: New global receives one system draft
- **WHEN** synchronization creates a global model that has no persisted
  identity
- **THEN** it commits the model with kind `global` and exactly one unpublished
  singleton draft entry with the configured defaults, empty blocks, `NULL`
  slug, model-label title, and `system:content-sync` audit values, and no
  published route

#### Scenario: Projection-changing apply coalesces build work
- **WHEN** an atomic synchronization applies one or more operations that change
  a public configuration projection while a pending unlocked site-build request
  exists
- **THEN** it increments published state once and leaves exactly one pending
  site-build request targeting the new version

#### Scenario: Failed page creation rolls back the identity update
- **WHEN** a new page or global model cannot create its singleton draft during
  synchronization
- **THEN** neither the model identity nor any public-state or outbox change is
  committed

#### Scenario: Baseline-only apply does not request a build
- **WHEN** synchronization only records structure baselines for unchanged
  models
- **THEN** the baselines are stored and the published-state version and build
  outbox are unchanged

## ADDED Requirements

### Requirement: Synchronization refuses kind changes between all model kinds
The planner SHALL treat a change of a stored model's kind between `page`,
`collection` and `global` as an incompatible change that permits no apply, both
for a model matched by key and for a `renamedFrom` rename whose former and new
kinds differ. A global removal SHALL follow the same rule as any model
removal: it is blocked while the stored model has entries, so a synchronized
global cannot be removed while its singleton exists.

#### Scenario: A page becomes a global
- **WHEN** a stored page model `settings` is configured as a global with the
  same key
- **THEN** the plan reports an incompatible kind change and apply is refused
  without writing

#### Scenario: A rename changes the kind
- **WHEN** a new global declares `renamedFrom` naming a stored collection
- **THEN** the plan is invalid with the rename-kind diagnostic

#### Scenario: A configured global is removed
- **WHEN** a stored global with its singleton entry is absent from
  configuration
- **THEN** the plan marks the removal blocked by existing entries
