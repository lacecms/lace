## MODIFIED Requirements

### Requirement: Public SDK exposes only published-content operations
The SDK SHALL expose typed operations to read a published page, one cursor page
of a published collection, a published collection entry by model key and slug,
and published content by resolved path. It SHALL expose a separately named
operation that follows collection cursors until all items are collected, and
single-page collection reads SHALL NOT automatically follow cursors. The SDK
SHALL expose a public-media URL helper and a build-export read operation. It
SHALL NOT expose draft, admin-session, mutation, or token-administration
operations. Single reads SHALL return the public entry with its resolved media
dictionary, one-page collection reads SHALL return the items, media dictionary
and cursor, and the all-items operation SHALL return every item with one media
dictionary that merges the dictionaries of all pages.

#### Scenario: A static-site build reads published content
- **WHEN** a build calls the page, collection, slug, path, or media helper with
  valid public identifiers
- **THEN** the SDK requests only the matching `/api/v1/public` resource and
  returns data typed from the shared public DTO contract, including the
  resolved media dictionary

#### Scenario: A build explicitly requests every collection item
- **WHEN** a collection response supplies a next cursor and a caller invokes
  the all-items collection operation
- **THEN** the SDK requests each successive cursor in order and returns the
  concatenated published items and the merged media dictionary without
  decoding or altering the cursor value

#### Scenario: A one-page collection read preserves pagination control
- **WHEN** a caller invokes the one-page collection operation and the response
  supplies a next cursor
- **THEN** the SDK returns that cursor with the current items and media and
  makes no additional request
