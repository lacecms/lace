## Purpose

Defines reproducible local verification that Lace's two runtime compositions preserve the same editorial, public-content and static-site behavior before the stable contract freeze.

## ADDED Requirements

### Requirement: Local verification runs both runtime contracts
The project SHALL expose one documented local verification command that runs the same repository cases against migrated SQLite and local D1 and the same API scenarios against Node and local Worker composition roots. API scenarios SHALL share seed inputs and expected response fixtures, and SHALL validate status, relevant headers and shared response schemas as well as fixture content. Verification SHALL use isolated owned state, fail on any required failed or skipped scenario, and clean up its processes and resources on success or failure without deleting ordinary development data. No infrastructure credential or remote mutation SHALL be required.

#### Scenario: Both runtimes conform
- **WHEN** the local verification command runs with its documented local prerequisites
- **THEN** SQLite and local D1 repository cases and Node and Worker API cases pass against identical expectations and the command reports each runtime's result

#### Scenario: A runtime diverges
- **WHEN** either API returns a different status, contract shape, semantic body or required header from the common expectation
- **THEN** verification fails and identifies the runtime and scenario without replacing the expectation with that runtime's result

#### Scenario: A phase fails
- **WHEN** a required phase fails or cannot run
- **THEN** the overall run is incomplete or failed, owned resources are cleaned up, and unexecuted phases are not recorded as passed

### Requirement: API parity covers lifecycle and authorization
Shared API verification SHALL cover real session authentication, admin/editor/viewer permissions, content creation and full-draft save, stale-revision rejection, publication and idempotent replay, route conflicts, cursor pagination, media upload/reuse and published-media access, build history and safe failure responses, public reads and authenticated build exports including ETag conditional responses. Fixtures SHALL distinguish a published snapshot from a later changed draft and from an unpublished entry. Runtime-generated values SHALL be normalized only through documented field-specific substitutions; differences in content, authorization, ordering, revisions, paths, statuses and error codes SHALL remain observable.

#### Scenario: A draft is changed after publication
- **WHEN** both runtimes save a changed draft and an unpublished entry after an initial publication
- **THEN** public page, collection, path and export reads contain only published snapshot values, successful public entries have a published snapshot and a matching mirrored draft, and unpublished entries are absent

#### Scenario: Restricted users call privileged endpoints
- **WHEN** an editor attempts publication or user/token administration or a viewer attempts content/media mutation
- **THEN** both runtime APIs deny each operation under the existing authentication and authorization contracts without side effects

#### Scenario: Two writers use the same revision
- **WHEN** independent authenticated writers submit different drafts with the same expected revision
- **THEN** exactly one save commits and the other receives the stable revision conflict without a partial aggregate

### Requirement: Browser scenarios exercise both real backends
Local Playwright verification SHALL run required editorial scenarios against both runtime backends with the corresponding admin application. It SHALL cover administrator sign-in, editing and block ordering, editor draft-save permission without publication, viewer read-only content/media behavior, stale-revision recovery preserving local edits, media upload and reuse, successful publication followed by build failure with truthful UI status, and session expiry. Mocked browser route responses alone SHALL NOT satisfy backend acceptance. Existing accessibility and keyboard acceptance SHALL remain enabled where reused. The opened failed-build explanation SHALL pass WCAG A/AA, including at least 4.5:1 contrast for normal-size explanatory text, in both source and exact-candidate browser checks. Cloudflare provider outcomes SHALL use controlled stubs and SHALL be described as simulation.

#### Scenario: Conflict recovery preserves authoring
- **WHEN** a second session saves before the first session submits its local draft
- **THEN** each runtime's admin reports the conflict, retains the local values and offers explicit recovery

#### Scenario: Session expires during editing
- **WHEN** an authenticated browser session is expired or revoked in the local backend before the next protected action
- **THEN** the next action is rejected, the browser exposes session loss and a sign-in recovery path for Save, Publish and Reload draft errors, preserves explicit confirmation before discarding unsaved authoring, and no unauthorized mutation occurs

#### Scenario: Publication succeeds but its build fails
- **WHEN** a publication commits and the controlled build attempt fails
- **THEN** the admin distinguishes successful publication from failed build, offers the applicable recovery action and does not claim a deployment succeeded

### Requirement: Astro output is compared across runtime exports
Verification SHALL build the same Astro fixture separately from each runtime's actual authenticated export and compare canonical published data, emitted route inventories and media references against common expected results. Canonicalization SHALL preserve content and block ordering and remove only documented runtime-specific origins and generated identities/times. The published-site view SHALL contain no draft-shaped property or editorial metadata. Rendered output SHALL exclude later draft sentinels, unpublished content and build credentials. The current v1 public DTO SHALL remain compatible; a dedicated published-only wire schema is not introduced by this verification change.

#### Scenario: Equivalent published sites build identically
- **WHEN** the common seeded site is exported from Node and local Worker and built with the same Astro fixture
- **THEN** canonical published values, static route sets and media references match the shared expected output for both builds

#### Scenario: Draft content leaks into output
- **WHEN** either export, loader view or static build exposes a later draft sentinel, an unpublished route or a build credential
- **THEN** verification fails with a sanitized runtime and scenario diagnostic

### Requirement: Evidence distinguishes source tests and candidate acceptance
The verification record SHALL identify source revision and working-tree state, tool versions, commands, runtime/scenario results, public-contract decision and candidate package/image inventory when artifacts are used. Exact-artifact checks SHALL reference verified checksums and image identities from the final candidate; workspace-only tests SHALL be explicitly identified. Missing or stale candidate artifacts SHALL prevent an exact-artifact success claim. Shipped-behavior changes SHALL require newly reviewed candidate artifacts before final candidate acceptance is claimed. Local simulation SHALL NOT count as real VPS/Cloudflare deployment evidence, stable-release approval, or completion of sessions 34B/34C.

#### Scenario: Existing candidate is reused
- **WHEN** candidate identity and checksums match the verified Step 33 inventory and shipped behavior is unchanged
- **THEN** local artifact acceptance can reuse that set while separately recording current-source contract results

#### Scenario: Only source tests are available
- **WHEN** tests pass in the workspace but exact candidate acceptance has not run
- **THEN** the record reports source verification only and leaves candidate acceptance unverified
