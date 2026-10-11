## ADDED Requirements

### Requirement: Public repository reads include referenced media
The public content read port SHALL return, with each public entry and path,
the active media items referenced by that entry's current published snapshot,
read from the content reference projection, for page, path and collection reads
and for the build export. The Node and D1 repositories and the in-memory
repository fake SHALL satisfy the same repository contract fixtures: media
referenced only by a draft SHALL be absent, media of every returned entry SHALL
be present with its descriptive metadata and dimensions, and no public read SHALL
expose the entry's independently mutable draft snapshot. Reading media SHALL use
bounded, chunked statements and SHALL NOT read media per entry.

#### Scenario: A published entry references media
- **WHEN** the repository contract publishes an entry referencing two media
  items, then saves a draft referencing a third
- **THEN** public reads and the build export return the entry with exactly the
  two published media items on both runtimes and in the fake

#### Scenario: The fake hides the draft
- **WHEN** an entry is published and its draft changes
- **THEN** the in-memory fake's public reads expose only published values, like
  the Node and D1 repositories
