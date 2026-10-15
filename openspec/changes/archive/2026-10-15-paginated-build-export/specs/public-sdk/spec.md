## ADDED Requirements

### Requirement: Public SDK reads and assembles export pages
The SDK SHALL expose a build-export page operation that accepts an optional
cursor, an optional limit from 1 to 100 and an optional prior entity tag. It
SHALL return the tolerant-validated page with its entity tag, or an unchanged
result for a first-page `304`.

The build-export operation SHALL follow `nextCursor` from the first page until
no cursor remains, sending the caller's optional page size on every request.
It SHALL return one assembled export `{formatVersion, version, entries,
globals, media, seo}`:

- `entries`: the concatenation of all page entries;
- `globals` and `seo`: those of the first page;
- `media`: the merge of all page media dictionaries, keyed in ascending ID
  order.

It SHALL reject the traversal with a typed contract error, and return no
export, when any of these holds:

- a page carries a different `version` or `formatVersion` than the first page;
- a page's entry paths do not strictly continue the previous page's ascending
  path order;
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

## MODIFIED Requirements

### Requirement: Build export supports conditional retrieval
The SDK build-export operation SHALL accept an optional prior entity tag and
send it in `If-None-Match` on the first-page request only. On a `304`
response it SHALL return an unchanged result with the response entity tag. It
SHALL NOT parse a response body or request further pages. On a successful
first page it SHALL follow and validate every page, and return the assembled
export with the first page's entity tag.

The operation SHALL validate strong and weak version-derived tags. It SHALL
return the received validator unchanged and send a supplied validator
unchanged.

Missing and malformed ETag headers on any `200` page or `304` SHALL raise
distinct `LaceContractError` messages. The messages SHALL:

- name the expected `"N"` or `W/"N"` format;
- advise a compatible API/SDK upgrade and a proxy/header configuration check.

A malformed value SHALL be displayed as an escaped preview of at most 80
characters, after build-token redaction. Diagnostics SHALL contain neither the
build credential nor any page body. Every `200` page tag SHALL encode that
page's version. A `304` tag SHALL encode the supplied prior version when a
prior tag was supplied.

#### Scenario: The published version is unchanged
- **WHEN** a caller supplies an entity tag for the current published version
  and the first-page request returns `304`
- **THEN** the SDK reports that the export is unchanged, makes no JSON parse
  attempt and requests no further page

#### Scenario: The published version has changed
- **WHEN** the caller supplies a stale entity tag and the endpoint returns a
  successful first page with a replacement entity tag and a `nextCursor`
- **THEN** the SDK follows the cursor without a conditional header and
  returns the assembled export and the replacement entity tag

#### Scenario: A compressed response has a weak validator
- **WHEN** compression rewrites an export tag to `W/"7"`
- **THEN** the SDK accepts and returns that exact tag and can send it on the next read

#### Scenario: Header diagnostics are actionable and safe
- **WHEN** an export page response lacks an ETag or carries a malformed one containing controls, a long value or the configured token
- **THEN** a distinct bounded contract error explains the expected format and recovery, escapes controls and redacts the token without including the page body

#### Scenario: A response validator disagrees with its version
- **WHEN** a `200` page tag encodes a different version than its page, or a `304` tag differs from the prior version
- **THEN** the SDK rejects the response as a contract violation
