## ADDED Requirements

### Requirement: Repository contract fixtures cover the paged build export
Shared repository contract fixtures SHALL run against the Node and D1
repositories and the in-memory double, and SHALL verify the following.

**Paging:**

- pages follow path order without gaps or repetition;
- the entry limit and the byte budget end pages, and an entry larger than the
  budget is delivered alone;
- globals and their media appear only on the first page, including a first
  page with no routed entries;
- each page's media are exactly those its entries or globals deliver, so media
  referenced only by hidden blocks or drafts stay excluded;
- draft-only content never appears.

**Guards:**

- a cursor issued before a publication, unpublication, entry deletion,
  published media-metadata edit or synchronization that advanced the
  published state fails with `BUILD_EXPORT_VERSION_CHANGED`;
- a cursor of another list, or a malformed cursor, fails as a validation
  failure.

**Equivalence:** concatenating every page of an unchanged state SHALL equal
the content of the former complete export for the same fixture, apart from
media being split across pages.

#### Scenario: Pages reproduce the complete export
- **WHEN** the shared fixture with entries, globals, hidden blocks, composites
  and SEO images is exported with limit 2 on each runtime
- **THEN** the concatenated entries, the first-page globals and the union of
  page media equal the expected complete export on every runtime

#### Scenario: A publication invalidates an export cursor
- **WHEN** a fixture reads the first page, publishes another entry and
  requests the next page with the first page's cursor
- **THEN** each runtime fails with `BUILD_EXPORT_VERSION_CHANGED` and the
  expected and actual versions

#### Scenario: An oversized entry is isolated
- **WHEN** an entry's stored fields and visible block data exceed the page
  byte budget
- **THEN** each runtime delivers that entry alone on its page and continues
  with the following entries on the next page
