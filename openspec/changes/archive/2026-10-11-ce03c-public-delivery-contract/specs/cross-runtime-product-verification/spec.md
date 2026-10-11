## MODIFIED Requirements

### Requirement: API parity covers lifecycle and authorization
Shared API verification SHALL cover real session authentication, admin/editor/viewer permissions, content creation and full-draft save, stale-revision rejection, publication and idempotent replay, route conflicts, cursor pagination, media upload/reuse and published-media access, build history and safe failure responses, public reads and authenticated build exports including ETag conditional responses. Fixtures SHALL distinguish a published snapshot from a later changed draft and from an unpublished entry. Runtime-generated values SHALL be normalized only through documented field-specific substitutions; differences in content, authorization, ordering, revisions, paths, statuses and error codes SHALL remain observable.

#### Scenario: A draft is changed after publication
- **WHEN** both runtimes save a changed draft and an unpublished entry after an initial publication
- **THEN** public page, collection, path and export reads contain only published values in the public entry shape without a `draft` key, their media dictionaries contain exactly the published media references, and unpublished entries are absent

#### Scenario: Restricted users call privileged endpoints
- **WHEN** an editor attempts publication or user/token administration or a viewer attempts content/media mutation
- **THEN** both runtime APIs deny each operation under the existing authentication and authorization contracts without side effects

#### Scenario: Two writers use the same revision
- **WHEN** independent authenticated writers submit different drafts with the same expected revision
- **THEN** exactly one save commits and the other receives the stable revision conflict without a partial aggregate

### Requirement: Astro output is compared across runtime exports
Verification SHALL build the same Astro fixture separately from each runtime's actual authenticated export and compare canonical published data, emitted route inventories and media references against common expected results. Canonicalization SHALL preserve content and block ordering and remove only documented runtime-specific origins and generated identities/times. The published-site view SHALL contain no draft-shaped property or editorial metadata. Rendered output SHALL exclude later draft sentinels, unpublished content and build credentials. Exports SHALL use the published public entry shape with a resolved media dictionary, and canonical comparison SHALL include each referenced media item's dimensions and descriptive metadata with its runtime-specific origin removed.

#### Scenario: Equivalent published sites build identically
- **WHEN** the common seeded site is exported from Node and local Worker and built with the same Astro fixture
- **THEN** canonical published values, static route sets and media references match the shared expected output for both builds

#### Scenario: Draft content leaks into output
- **WHEN** either export, loader view or static build exposes a later draft sentinel, an unpublished route or a build credential
- **THEN** verification fails with a sanitized runtime and scenario diagnostic
