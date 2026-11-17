## Purpose

Defines the private artifact and session boundary that lets Lace users view
saved drafts without exposing unpublished HTML, images or administrative access.

## ADDED Requirements

### Requirement: Preview has an isolated host and a closed surface
Preview SHALL be served from an explicitly configured origin distinct from
the administrative origin. The preview hostname SHALL expose only its access
handoff and generation resources. Routing the same process or Worker through
multiple hostnames SHALL NOT expose admin, OAuth, MCP, import or build-control
routes on the preview hostname. Unknown hosts SHALL be rejected.

#### Scenario: Admin API requested on preview host
- **WHEN** a caller requests an administrative endpoint on the preview hostname
- **THEN** it is unavailable even with a valid preview cookie

#### Scenario: Site code tries to inspect the admin frame
- **WHEN** preview JavaScript attempts to read the embedding admin document
- **THEN** browser origin isolation prevents access

### Requirement: Handoff is one-use, browser-bound and tied to a live Lace session
A signed-in user with `content:read` SHALL obtain preview access through a
short-lived, single-use handoff bound to the initiating browser, configured
CMS/preview origins, return path and parent Lace session. A handoff code alone
SHALL NOT authenticate another browser. Redirect targets SHALL be allowlisted
and generation-scoped. An expired, replayed, mismatched or revoked handoff
SHALL be denied. Codes SHALL be removed from the final URL and excluded from
logs and referrers. Missing Lace authentication SHALL lead to the normal
sign-in flow with a validated return destination, outside an embedded login.

#### Scenario: Automatic handoff from a signed-in browser
- **WHEN** an authorized user opens preview without a preview cookie
- **THEN** Lace establishes restricted preview access without asking for credentials again and redirects to a clean generation URL

#### Scenario: Stolen callback URL
- **WHEN** another browser opens a valid callback URL without the initiating browser binding
- **THEN** the callback is denied and cannot consume the legitimate browser's authorization

#### Scenario: Replay or parent revocation
- **WHEN** a consumed code is replayed or the parent session is revoked before redemption
- **THEN** redemption fails without creating a preview session

#### Scenario: Unauthenticated frame
- **WHEN** handoff requires an interactive Lace login while preview is embedded
- **THEN** the UI offers a top-level sign-in/return path and does not embed the login form or loop redirects

### Requirement: Preview sessions never confer administrative authority
Preview cookies SHALL be Secure, HttpOnly and host-only in production, with
SameSite policy compatible with top-level navigation and same-site framing.
They SHALL authorize preview reading only and SHALL remain linked to the
original Lace session. A preview session SHALL support multiple tabs and
valid generations without rebinding a single cookie to one entity. The
administrative session cookie SHALL never be copied or sent to the preview
host. The system SHALL NOT introduce anonymous bearer preview links.

#### Scenario: Two previews in different tabs
- **WHEN** an authorized user opens two valid entities' preview generations
- **THEN** both remain readable under the same preview session without one tab replacing the other's entity binding

#### Scenario: Preview cookie used against CMS
- **WHEN** a caller supplies only a preview cookie to the administrative API
- **THEN** it does not authenticate an administrative session

### Requirement: Every private resource checks current access before delivery
HTML, CSS, JavaScript, fonts, optimized images and copied originals SHALL share
a guard checking the preview session, live parent session, current active user
and `content:read`, and generation readiness/expiry/invalidation. These checks
SHALL precede storage delivery and any conditional, HEAD or range response.
No auth cache SHALL allow delayed revocation. Unauthorized requests SHALL NOT
receive binary bytes, redirects to private storage or a revealing validator.
Already delivered bytes cannot be recalled, but subsequent requests SHALL fail.

#### Scenario: Direct asset URL without a session
- **WHEN** an unauthenticated caller requests a copied image or CSS URL
- **THEN** the response denies access without returning object bytes

#### Scenario: Logout or account disablement
- **WHEN** the parent session is signed out, revoked or expired, or the account becomes disabled
- **THEN** the next HTML or resource request is denied even if the preview cookie and package have not expired

#### Scenario: Revalidation after invalidation
- **WHEN** an invalidated preview resource is requested with a previous validator or a byte range
- **THEN** it is denied rather than returning 304 or 206

### Requirement: Artifact URLs cannot bypass protection or escape a generation
Private output SHALL be accessible only through generation-scoped gateway
paths. A finalized manifest SHALL allowlist normalized relative paths, lengths,
content types and integrity metadata. Traversal, encoded separator ambiguity,
symlinks, special files and access to another generation's storage prefix SHALL
be rejected. Credentials, build inputs, environment files, source maps and
operator files SHALL NOT be served as artifacts. The browser SHALL never
receive an unauthenticated R2/S3 URL or a reusable presigned URL for draft media.

#### Scenario: Encoded traversal
- **WHEN** a request attempts an encoded parent traversal or a path outside the finalized manifest
- **THEN** no storage object outside the allowlist is returned

#### Scenario: Original image in lightbox
- **WHEN** a preview opens an original image that is not public
- **THEN** it loads the private copied original through the same generation guard

### Requirement: Private responses avoid shared caching and unwanted embedding
Private preview responses SHALL use `Cache-Control: private, no-store`, a
no-referrer policy, noindex directives and safe content-type handling. HTML
SHALL permit framing only by the configured Lace administrative origin and
the preview origin for its own protected standalone viewer.
The admin SHALL allow frames only from the configured preview origin for this
feature. Private responses SHALL NOT enter a public CDN, public bucket or
service-worker offline cache. Published external resources SHALL retain their
existing public delivery policy.

#### Scenario: Standalone viewer retains revision identity
- **WHEN** a user opens preview in a top-level tab on an incompatible domain
- **THEN** the protected preview-host viewer shows the captured revision and expiry and loads the site with first-party preview access

#### Scenario: Another website embeds preview
- **WHEN** an unrelated origin embeds a preview URL
- **THEN** the browser refuses framing even if the user has a preview session

#### Scenario: Public media remains public
- **WHEN** an already published media URL is requested through its ordinary public endpoint
- **THEN** the existing public access and caching rules remain unchanged

### Requirement: Upload and finalization are scoped and atomic
A runner SHALL receive only the authority needed to read one frozen input,
upload one generation and report its result before its deadline. Ordinary
build tokens SHALL remain published-only. A staged artifact SHALL not be
readable until all required files and its bounded manifest are verified and
finalization atomically confirms that this is the active, valid generation.
Duplicate runner claims and callbacks SHALL be idempotent; a stale or foreign
runner SHALL NOT finalize another generation. Finalized objects SHALL not be
overwritten by a later runner request.

#### Scenario: Partial upload
- **WHEN** rendering succeeds but one required resource fails to upload
- **THEN** the preview never becomes ready and partial objects remain private cleanup candidates

#### Scenario: Invalidation between upload and finalization
- **WHEN** publication invalidates a generation after its files are uploaded
- **THEN** finalization fails and those files are never exposed

#### Scenario: Duplicate callback
- **WHEN** the same valid completion is delivered twice
- **THEN** one ready result is retained without extending its TTL or replacing its manifest

### Requirement: Cleanup is eventual while denial is immediate
Expiry, replacement and invalidation SHALL deny access independently of
physical deletion. Scheduled maintenance SHALL remove expired/invalid input
snapshots, copied originals, staged artifacts, handoffs and preview sessions
in bounded recoverable batches. Failed cleanup SHALL retry without rerunning
the build or restoring access. Job deadlines and invalidation tombstones
SHALL prevent delayed callbacks from recreating cleaned generations.

#### Scenario: Storage is unavailable during cleanup
- **WHEN** deletion of an expired artifact fails
- **THEN** the resource remains inaccessible and maintenance retries physical deletion later

#### Scenario: Crash after partial upload
- **WHEN** a worker or runner crashes before finalization
- **THEN** deadline processing makes the job terminal and orphan cleanup eventually removes its private inputs and output
