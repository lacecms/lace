## ADDED Requirements

### Requirement: Optimized published media offers lazy thumbnail access
With image optimization enabled, the loader SHALL attach a server-side thumbnail reader to each resolved media item from the build export. The reader SHALL use the same configured API base, fetch and build token as the export and SHALL be bound to that media ID. Media access from the site, entries and globals, including the usage-alt image lookup, SHALL preserve the reader without fetching bytes. Loading the export, resolving media metadata and rendering SEO SHALL make no thumbnail request. With optimization off, resolved media SHALL carry no thumbnail reader. Neither export DTOs nor resolved URL properties SHALL carry thumbnail bytes, credentials or private storage addresses.

#### Scenario: An image is described through an entry
- **WHEN** a site resolves the same optimized media via its site and entry lookups and overrides the alt for one use
- **THEN** both lookups offer the same lazy access for that media, and the API receives no thumbnail request until a renderer calls the reader

#### Scenario: The loader has no optimized media
- **WHEN** optimization is off or the requested ID is absent from the export
- **THEN** no thumbnail access is available and no thumbnail request is made
