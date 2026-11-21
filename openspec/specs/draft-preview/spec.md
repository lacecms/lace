# Draft Preview

## Purpose

Defines explicit saved-draft preview creation, immutable input capture,
lifecycle and editor behavior without changing the published website.

## Requirements

### Requirement: Creation is explicit, configured and session-authorized
Lace SHALL accept preview creation only for an existing saved page or routed
collection entry with a resolvable path, by a browser-session actor with
`content:write`. The request SHALL identify the expected saved revision and
an idempotency key. Preview SHALL require complete operator configuration.
Globals, route-less collections and unsaved new entities SHALL be ineligible.
Reading preview status and opening a ready preview SHALL require current
`content:read`. Import, MCP and ordinary build credentials SHALL NOT authorize
these operations. Preview SHALL NOT save editor values or publish content.

#### Scenario: Editor requests an unpublished post
- **WHEN** an editor requests preview of the current saved revision of a routed unpublished post with complete configuration
- **THEN** the request is eligible without `content:publish`, and the post remains unpublished

#### Scenario: Viewer or automation attempts creation
- **WHEN** a viewer or a caller using an import, MCP or public build credential requests preview creation
- **THEN** the request is denied before any job, storage write or runner dispatch

#### Scenario: Ineligible or unconfigured request
- **WHEN** the entity has no route, has not been saved, or preview configuration is incomplete
- **THEN** no build starts and the response identifies the ineligible or unavailable condition

### Requirement: Validation precedes admission and build execution
Preview SHALL validate the complete target candidate using publication-required
fields, visible blocks, conditional-field projection, media and content budgets.
Hidden blocks SHALL retain the existing draft-mode validation and SHALL NOT
be rendered. Missing required content SHALL produce field/block-addressed
issues without placeholders. Route collisions and stale expected revisions
SHALL be rejected. A rejected request SHALL preserve any existing preview.

#### Scenario: Required visible content is incomplete
- **WHEN** a visible block lacks a required value
- **THEN** preview creation returns its validation location without dispatching a build or invalidating the previous preview

#### Scenario: Incomplete hidden block
- **WHEN** an unfinished hidden block satisfies draft-mode rules and the remaining target satisfies publication rules
- **THEN** preview can proceed and the hidden block is absent from its output

#### Scenario: Concurrent save before admission
- **WHEN** another save advances the draft revision after validation but before admission
- **THEN** admission fails with a revision conflict without silently previewing the newer draft

### Requirement: Preview freezes the target and published context
An admitted preview SHALL identify and retain the exact target revision,
resolved route, active model configuration identity and published-state
version captured for that request. Its build input SHALL overlay that target
on a consistent published-only context including globals and route-less
records. The target's former published representation SHALL be replaced, not
duplicated. Other entities' drafts SHALL never enter the input. The input SHALL
remain unchanged after capture. If consistent capture cannot complete for the
admitted version, the operation SHALL fail and require manual retry instead of
silently using newer context. Preview SHALL record its exact source commit.

#### Scenario: Changed draft over an existing publication
- **WHEN** a post has published revision 4 and preview captures saved revision 7
- **THEN** the preview renders revision 7 in the frozen published site context while public consumers continue to receive revision 4

#### Scenario: Save while generation is active
- **WHEN** revision 8 is saved after revision 7 was admitted
- **THEN** that generation still renders revision 7 and the editor identifies it as older than the saved draft

#### Scenario: Published context changes during capture
- **WHEN** a publication changes the public version before all input pages are captured consistently
- **THEN** the job fails with a context-change reason rather than mixing versions or recapturing automatically

#### Scenario: Published block migration commits during capture
- **WHEN** an in-place migration of a published block commits between context pages before the public version advances
- **THEN** the preview capture epoch change prevents sealing with `PREVIEW_CONTEXT_CHANGED`, without dispatching or recapturing automatically

### Requirement: Admission permits one active preview operation per installation
Lace SHALL admit at most one preparing, dispatched or running preview operation
per installation, across all entities and actors, and SHALL maintain no
preview waiting queue. Admission SHALL be atomic across processes and runtimes.
An identical idempotent request SHALL return its existing operation; concurrent
requests for the same entity/revision SHALL not dispatch duplicate work.
A different request while busy SHALL return a busy outcome and SHALL NOT
invalidate any ready preview. Provider runner waiting SHALL count as activity
of the admitted operation, not as a Lace preview queue.

#### Scenario: Two editors request different previews
- **WHEN** two eligible requests race for an idle installation
- **THEN** exactly one is admitted and dispatched, and the other receives busy with its previous preview preserved

#### Scenario: Lost acceptance response
- **WHEN** a client repeats an admitted request with the same idempotency key and payload
- **THEN** it receives the same operation without recreating inputs, invalidating again or dispatching a second execution

#### Scenario: Key reused for different input
- **WHEN** an idempotency key is reused with a different entity or revision
- **THEN** the request is rejected as a conflict

### Requirement: Replacement and retention have explicit boundaries
There SHALL be at most one accessible ready preview per entity. Admission of
a new generation SHALL immediately invalidate that entity's previous ready
preview. Failure of the replacement SHALL NOT restore it. A ready generation
SHALL expire 24 hours after successful finalization. Saving or reverting a
draft, unpublishing the target, publishing another entity/global, and changing
site source SHALL NOT invalidate an otherwise valid ready preview. Those
operations SHALL NOT extend its expiry or automatically rebuild it.

#### Scenario: Replacement fails
- **WHEN** a replacement is admitted and then fails to build
- **THEN** the old URL remains unavailable and the UI offers a manual retry

#### Scenario: Save or unpublish preserves preview
- **WHEN** the target is saved, reverted or unpublished after preview becomes ready
- **THEN** the captured preview remains accessible until its original expiry, with its own revision displayed

#### Scenario: Ready lifetime elapses
- **WHEN** 24 hours have elapsed since successful finalization
- **THEN** HTML and resources are unavailable even if physical cleanup has not run

### Requirement: Publication and deletion atomically invalidate preview access
Successful publication of the target SHALL invalidate its ready and in-flight
preview in the same atomic lifecycle mutation. Target deletion or removal of
its model SHALL do the same. Successful deletion of media included in a
preview input/package SHALL invalidate every affected preview, including
copied originals. Preview references SHALL NOT prevent an otherwise permitted
media deletion. Failed lifecycle commands and idempotent replay of an earlier
publication SHALL NOT invalidate a subsequently created preview. Physical
cleanup SHALL be recoverable separately from logical access denial.

#### Scenario: Publication races with runner completion
- **WHEN** publication commits before finalization of the target's preview
- **THEN** finalization is rejected and no ready URL is resurrected

#### Scenario: Old publish response is retried
- **WHEN** an old successful publish request is replayed after a new preview was created
- **THEN** its stored result is returned without invalidating the new preview

#### Scenario: Copied media is deleted
- **WHEN** deletion of a media item used by a ready or in-flight preview succeeds
- **THEN** the affected generation becomes unavailable, and cleanup includes its copied original and partial artifacts

### Requirement: Execution and total duration are bounded with manual retry
A preview SHALL have a 15-minute overall deadline from admission, including
capture, provider waiting and upload. Once runner execution starts, preparation,
installation, rendering and artifact upload together SHALL have a 10-minute
execution deadline, capped by the earlier overall deadline. A timed-out job
SHALL become terminal and reject subsequent input access, uploads and success
callbacks. The executor SHALL stop the underlying process/job; expiry of a
logical lease alone SHALL NOT authorize overlapping execution. Failed or
timed-out builds SHALL NOT be retried automatically. An explicit retry SHALL
create a new generation for the current saved revision after revalidation.

#### Scenario: Runner starts late
- **WHEN** a runner starts 8 minutes after admission
- **THEN** it has at most 7 minutes remaining and cannot extend the overall deadline by reporting progress

#### Scenario: Timeout followed by late success
- **WHEN** a timed-out runner uploads or reports success
- **THEN** the result is refused and any partial output stays inaccessible

#### Scenario: Retry after another save
- **WHEN** revision 7 failed and the editor saves revision 8 before selecting Retry
- **THEN** retry validates and builds revision 8 as a new generation, not revision 7

### Requirement: Status and diagnostics describe preview rather than publication
Preview status SHALL distinguish absence, preparation, provider waiting,
running, ready, failure, timeout, invalidation and expiry. It SHALL carry
captured revision, creation/readiness/expiry times as applicable, and a safe
failure reason. It SHALL NOT describe provider acceptance as readiness.
The UI SHALL expose actionable validation, configuration, source, dependency,
route, render, storage and timeout failures without raw secrets, internal paths,
content dumps or subprocess logs. Detailed bounded operator diagnostics SHALL
be correlated by generation and provider run identifiers.

#### Scenario: Provider accepts the workflow
- **WHEN** GitHub accepts dispatch but no package has been finalized
- **THEN** the user sees waiting or building and cannot open a purportedly ready preview

#### Scenario: Build logs contain credentials
- **WHEN** a build failure includes a secret in its raw output
- **THEN** the editor receives only a safe reason and generation identifier

### Requirement: The editor exposes saved-only preview actions
For eligible entities with complete configuration, the editor SHALL show
Create preview to users with `content:write`, disabled while the form has
unsaved changes or creation is unavailable, with an explanation. When a ready
preview exists it SHALL offer Open and Recreate; a viewer SHALL only be able
to open or inspect status. Opening an existing preview SHALL NOT save or
replace dirty editor state. The UI SHALL show the preview revision and a
stale-revision notice when it differs from the current saved revision. It
SHALL NOT auto-open a new tab when an asynchronous build completes.

#### Scenario: Dirty editor with older ready preview
- **WHEN** an editor changes local fields while revision 7 has a ready preview
- **THEN** creation/recreation is disabled, opening revision 7 remains possible, and local edits are retained

#### Scenario: Setup is incomplete
- **WHEN** preview readiness reports incomplete configuration
- **THEN** the editor hides preview creation and authorized settings users can inspect the missing setup requirements

#### Scenario: Manual retry with unsaved changes
- **WHEN** the failed preview's editor has unsaved changes
- **THEN** Retry remains disabled until those changes are saved or discarded

### Requirement: The preview screen uses isolated framing with a top-level fallback
The preview screen SHALL identify the entity, captured revision, freshness
relative to the current saved revision and expiry outside the site document.
For compatible same-site HTTPS origins it SHALL embed the distinct preview
origin in an iframe and offer desktop and narrow viewport widths. It SHALL
always offer Open in new tab without opener/referrer access. Incompatible
origins SHALL use top-level viewing instead of relying on third-party cookies.
The page SHALL remain read-only from the CMS perspective; no in-page editing
or automatic draft refresh SHALL be introduced.

#### Scenario: Sibling subdomains
- **WHEN** CMS and preview use compatible HTTPS sibling subdomains and the user opens a ready preview
- **THEN** the iframe renders the page with the site's own styles and scripts while metadata stays in the Lace screen

#### Scenario: Separate registrable domains
- **WHEN** the origins are not same-site or embedding cannot establish authorized access
- **THEN** Lace offers top-level preview access with an explanation instead of a blank frame or repeated login loop
