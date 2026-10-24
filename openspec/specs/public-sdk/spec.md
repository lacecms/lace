# public-sdk Specification

## Purpose

Defines the public, build-time Lace client so static sites consume validated
published content without access to administrative or mutable CMS operations.

## Requirements

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

### Requirement: Public SDK normalizes safe client transport
The SDK SHALL accept an absolute HTTP(S) API base URL with or without a trailing
slash and preserve an intentional path prefix when forming public API URLs. It
SHALL use an injected fetch implementation when provided and otherwise the
runtime global fetch. Each request SHALL apply the SDK's stable user-agent when
the runtime permits that header, and SHALL combine a configured timeout with a
caller-supplied abort signal without discarding either cancellation cause.

#### Scenario: An API runs beneath a base path
- **WHEN** a client is configured with `https://cms.example/lace` or
  `https://cms.example/lace/`
- **THEN** its public-content and media URLs retain `/lace/` exactly once before
  `/api/v1/public/`

#### Scenario: A timed-out request is cancelled
- **WHEN** a public SDK operation exceeds its configured timeout
- **THEN** the request is aborted and the caller receives a typed transport
  error that identifies cancellation rather than a fabricated HTTP response

#### Scenario: A caller cancels an in-flight request
- **WHEN** a caller-supplied abort signal aborts before a response completes
- **THEN** the SDK stops the request and preserves that abort as the failure
  cause

### Requirement: Build credentials are isolated to build exports
The SDK SHALL accept an optional build token and send it as a bearer credential
only when reading the build-export resource. Page, collection, path, and public
media requests SHALL be anonymous regardless of whether a build token is
configured.

#### Scenario: A build reads its authenticated export
- **WHEN** a client with a build token requests the build export
- **THEN** it sends that token only in the export request's Authorization header

#### Scenario: A public content read follows an export read
- **WHEN** the same configured client subsequently reads a page, collection,
  path, or media URL
- **THEN** that request contains no build-token Authorization header

### Requirement: Public SDK validates responses and reports typed failures
The SDK SHALL validate successful JSON responses with the tolerant variants of
the shared public DTO schemas before returning them. Object keys unknown to
the contract SHALL be ignored and removed at every depth, so the returned
value holds exactly the contract's keys. Missing required keys, wrong value
types and violated value constraints SHALL still fail validation.

The SDK SHALL map a valid Lace error envelope on a non-success response to a
typed HTTP error containing its status and error code. An error code unknown
to the SDK SHALL be preserved as a string, not treated as a contract
violation. The SDK SHALL report any of the following as a typed contract
error:

- an invalid JSON body;
- a success body that fails tolerant validation;
- a non-success response without a valid tolerant error envelope.

It SHALL NOT return unchecked JSON.

#### Scenario: A server returns malformed published content
- **WHEN** a successful public response lacks a required key or carries a
  wrong value type
- **THEN** the SDK rejects it with a typed contract error and exposes no
  partially validated content to the caller

#### Scenario: A newer server returns additional keys
- **WHEN** a public page response carries an unknown key on the response, on
  the entry, on a block and on a media item, together with every required key
- **THEN** the SDK returns the page without those keys and raises no error

#### Scenario: A server rejects a public request
- **WHEN** a public resource responds with a valid Lace error envelope such as
  `NOT_FOUND` or `AUTHORIZATION_DENIED`
- **THEN** the SDK rejects it with a typed HTTP error carrying that status and
  stable error code

#### Scenario: A newer server reports an unknown error code
- **WHEN** a public resource responds with HTTP 409 and an envelope whose code
  is `FUTURE_CONDITION`
- **THEN** the SDK rejects it with a typed HTTP error carrying status 409 and
  code `FUTURE_CONDITION`

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

### Requirement: Public SDK reads published globals
The SDK SHALL expose `getGlobal(modelKey)`, which validates the model key as a
public identifier, requests only `/api/v1/public/globals/:modelKey`, and returns
the validated `{global, media}` response. A `404` SHALL surface as the SDK's
typed API error, like other single public reads. The build-export operation
SHALL return the export's `globals` list, empty when the response omits it.

#### Scenario: A build reads a global
- **WHEN** a build calls `getGlobal("settings")` and the global is published
- **THEN** the SDK requests `/api/v1/public/globals/settings` and returns the
  published global and its media dictionary

#### Scenario: A malformed global response
- **WHEN** the API returns a global carrying a `path` or `draft` key
- **THEN** the SDK fails with its contract-violation error

#### Scenario: An invalid model key
- **WHEN** a caller passes an empty model key
- **THEN** the SDK refuses it before sending a request

### Requirement: Public SDK preserves composite published values
Every existing page, collection, slug, path, global and build-export operation
SHALL preserve nested objects, arrays, order and media IDs through validated
response parsing. Published-site views SHALL expose those values unchanged and
resolve nested media IDs with the existing site/entry media and image helpers.
Merged collection dictionaries SHALL retain existing merging rules. The SDK
SHALL retain its transport boundary without executing definitions or importing
CMS validation/render packages.

#### Scenario: Nested collection and global values
- **WHEN** a client loads a collection with nested fields and a global with a nested block through public reads and the export loader
- **THEN** both paths retain their exact nested values and resolve the referenced published media through existing helpers

#### Scenario: Empty composites are retained
- **WHEN** a response contains a present `{}` group and `[]` list
- **THEN** SDK parsing preserves both values rather than treating them as absent

### Requirement: Public SDK rejects unsupported export formats
The SDK SHALL declare the highest build-export format version it supports.
When a validated export carries a higher `formatVersion`, the SDK SHALL reject
it with a typed contract error. The error SHALL name the received and the
supported format versions and tell the operator to upgrade `@lacecms/sdk` to a
release compatible with the Lace API. It SHALL NOT include the export body or
the build credential. An export whose `formatVersion` is equal to or lower
than the supported version SHALL be accepted when it satisfies the tolerant
contract.

#### Scenario: A newer API changes the export format
- **WHEN** the SDK supports format version 1 and the export carries
  `formatVersion: 2`
- **THEN** the SDK rejects it with a contract error naming versions 2 and 1
  and advising an SDK upgrade, and returns no export

#### Scenario: The export format is supported
- **WHEN** the export carries `formatVersion: 1` and additional unknown keys
- **THEN** the SDK returns the validated export without the unknown keys

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

### Requirement: The SDK consumes link-aware export versions and manifests
The SDK SHALL support build-export formats 1 and 2, preserve validated
`internalLinks` on every entry/global and assemble them with their source across
existing keyset pages. A format 2 entry/global SHALL carry its manifest; a
format 1 entry/global without it SHALL read as no internal references. Transport
validation SHALL continue to preserve authored JSON unchanged. Format mismatch,
page-version drift, malformed known keys and invalid manifest shape SHALL remain
contract errors. No target fetch, reference recursion or admin API SHALL be
added to public SDK reads. Older SDKs supporting only format 1 SHALL reject
format 2 with the existing actionable upgrade error.

#### Scenario: Target appears on a later export page
- **WHEN** a source on page 1 refers to a target on page 3
- **THEN** the SDK assembles all pages before site resolution without falsely declaring the target missing or issuing a target request

#### Scenario: Legacy fixture
- **WHEN** a valid format 1 fixture has no manifests and uses only manual URLs
- **THEN** the upgraded SDK and loader accept it with unchanged rendering
