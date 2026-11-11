## ADDED Requirements

### Requirement: Public SDK reads published records
The SDK SHALL expose `listRecords(modelKey, options?)` with the optional
cursor and limit of the collection read. It SHALL validate the model key as a
public identifier, request only `/api/v1/public/records/:modelKey`, and return
the validated `{items, media, nextCursor?}` response. A `404` SHALL surface as
the SDK's typed API error. The build-export operation SHALL return the
export's `records` list, empty when the response omits it, with each record's
`internalLinks` manifest.

#### Scenario: A client reads records
- **WHEN** a client calls `listRecords("testimonials")` and testimonials are
  published
- **THEN** the SDK requests `/api/v1/public/records/testimonials` and returns
  the records and their media dictionary

#### Scenario: A malformed record
- **WHEN** the API returns a record carrying a `path` or `slug` key under the
  strict variant
- **THEN** the SDK fails with its contract-violation error

#### Scenario: An export from an API without records
- **WHEN** a format 2 export carries no `records` key
- **THEN** the SDK returns the export with an empty `records` list

## MODIFIED Requirements

### Requirement: Public SDK reads and assembles export pages
The SDK SHALL expose a build-export page operation that accepts an optional
cursor, an optional limit from 1 to 100 and an optional prior entity tag. It
SHALL return the tolerant-validated page with its entity tag, or an unchanged
result for a first-page `304`.

The build-export operation SHALL follow `nextCursor` from the first page until
no cursor remains, sending the caller's optional page size on every request.
It SHALL return one assembled export `{formatVersion, version, entries,
records, globals, media, seo}`:

- `entries`: the concatenation of all page entries;
- `records`: the concatenation of all page records, treating a page without
  `records` as holding none;
- `globals` and `seo`: those of the first page;
- `media`: the merge of all page media dictionaries, keyed in ascending ID
  order.

It SHALL reject the traversal with a typed contract error, and return no
export, when any of these holds:

- a page carries a different `version` or `formatVersion` than the first page;
- a page's entry paths do not strictly continue the previous page's ascending
  path order;
- a page's records do not strictly continue the previous records' ascending
  order by model key and then identifier, or an entry follows a record in
  delivery order;
- the same media ID resolves to different items on two pages;
- a continuation page carries `globals` or `seo`, or the first page lacks
  them.

When a continuation page fails with HTTP 409 `BUILD_EXPORT_VERSION_CHANGED`,
or a first page does, the operation SHALL restart from an unconditional first
page. It SHALL make at most two traversal attempts in total, and SHALL then
reject with that HTTP error. A caller SHALL be able to disable restarts.

#### Scenario: A multi-page export is assembled
- **WHEN** the API serves three pages for version 9 with distinct entries and
  overlapping identical media
- **THEN** the SDK returns one export with version 9, all entries in path
  order, the first page's globals and SEO section, and one merged media
  dictionary

#### Scenario: Publication interrupts the traversal once
- **WHEN** the second page fails with `BUILD_EXPORT_VERSION_CHANGED` and a
  fresh traversal succeeds at version 10
- **THEN** the SDK returns the version-10 export assembled only from the
  second traversal

#### Scenario: Content keeps changing
- **WHEN** two consecutive traversals are interrupted by
  `BUILD_EXPORT_VERSION_CHANGED`
- **THEN** the SDK rejects with that HTTP error after the second attempt and
  makes no third attempt

#### Scenario: Pages disagree
- **WHEN** a continuation page carries version 8 after a version-9 first
  page, or repeats an earlier path
- **THEN** the SDK rejects the traversal with a contract error and returns no
  export

#### Scenario: Records follow the routed entries
- **WHEN** the API serves a first page with the last routed entries followed
  by records of `cv` and `testimonials`, and a continuation page with more
  `testimonials` records
- **THEN** the SDK returns all entries in path order and all records in model
  key and identifier order

#### Scenario: Entries after records
- **WHEN** a continuation page carries a routed entry after an earlier page
  delivered records
- **THEN** the SDK rejects the traversal with a contract error and returns no
  export
