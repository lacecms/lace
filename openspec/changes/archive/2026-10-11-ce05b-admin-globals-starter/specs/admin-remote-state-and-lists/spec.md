## MODIFIED Requirements

### Requirement: Content landing explains empty and unsynchronized models
The content landing route SHALL show a distinct empty state when the authenticated model list succeeds with no configured models, with guidance to define a page, collection or global in code and run local synchronization. When a configured page or global has no singleton entry, it SHALL explain the likely pending synchronization and give the local command. API failures SHALL remain visible as errors rather than appearing as an empty configuration. Where the API does not expose persisted identity for a collection, the UI SHALL not claim synchronization is complete from an empty entry list alone.

#### Scenario: No configured models
- **WHEN** the content-model API succeeds with an empty list
- **THEN** the landing route shows a no-models explanation and local setup guidance

#### Scenario: Page has no synchronized singleton
- **WHEN** the model API contains a page but its entry list is empty
- **THEN** the landing route explains that local synchronization may be pending and shows `pnpm content:sync`

#### Scenario: Global has no synchronized singleton
- **WHEN** the model API contains a global but its entry list is empty
- **THEN** its Site card explains that local synchronization may be pending and shows `pnpm content:sync`

#### Scenario: Model API fails
- **WHEN** loading models fails
- **THEN** the landing route shows the API error and does not present the no-models state

## ADDED Requirements

### Requirement: Content landing summarizes site globals
The content landing route SHALL present configured globals in a Site group
after Pages and Collections, with an anchor that navigation can target, and
SHALL omit the group when no global is configured. Each global SHALL show its
label, its description when configured, the singleton's derived status
(draft, published, or changed), its relative last-edit time and the last
editor's display name, and SHALL open the singleton editor. A global card
SHALL show no path, route, slug or entry count, and never an entry ID or user
ID. A failed summary request for one global SHALL show that global's error in
place without hiding other models.

#### Scenario: A published global with later edits
- **WHEN** the `settings` global labelled "Site settings" has status
  `changed` and was updated an hour ago by "Ada Editor"
- **THEN** its Site card shows a Changed status, "1 hour ago" and "Ada
  Editor", links to the singleton editor, and shows no public path

#### Scenario: One global summary fails
- **WHEN** the entry-list request for `settings` fails while `home` succeeds
- **THEN** the Site settings card shows the error and the Home card still
  renders

### Requirement: The model route of a global points to its singleton
Opening the model route of a global (for example `/content/settings`) SHALL
not present a collection entry list, a create action or a count. It SHALL
present the same singleton guidance as a page model route, leading to the
content landing route.

#### Scenario: A user opens a global's model route directly
- **WHEN** a user opens `/content/settings` for the `settings` global
- **THEN** no entry list or create action is shown and the route leads back to
  the content landing route
