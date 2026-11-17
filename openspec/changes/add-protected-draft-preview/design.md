## Context

See [proposal.md](proposal.md) for motivation and scope. The selected architecture
is recorded in ADR 0033. See [verification.md](verification.md) for checkpoint status.

The current editor saves mutable drafts separately from publication. Publication
uses shared guarded write plans, SQLite transactions or D1 batches, and a
published-state version/outbox. The public SDK and `createAstroSiteLoader` read
published exports only. Site routes, layouts and block components are user-owned.
The Node builder serializes `/build` calls, copies selected source into scratch
space and switches complete public releases. Cloudflare publication uses Pages
hooks/tracking. None of these public paths currently supports draft preview.

The existing auth boundary exposes the current actor and original session ID;
Node/D1 security persistence can revoke those sessions. The application must
continue to receive portable actors, not Better Auth records.

Local November 17 spikes used Astro 7.4.12, the reference site and real Lace
Better Auth with temporary SQLite. They demonstrated single-route prerendering,
CSS/font/image/dynamic-import/lightbox preservation under two generation prefixes,
browser-bound handoff, immediate denial on logout/disablement, multiple tabs,
same-site iframe bootstrap and failure of cross-site iframe Lax cookies. They
also showed that navigation hrefs need explicit public-origin rewriting.
Compilation and `getStaticPaths` still visit unrelated code. These are feasibility
observations, not shipped features or real GitHub/Workers verification. Temporary
artifacts are not dependencies of this proposal; PV1C/PV1F recreate durable tests.

## Goals / Non-Goals

**Goals:** isolate editorial input, execution and delivery from publication;
maintain identical lifecycle/security behavior across Node and Cloudflare;
make duplicate delivery and late results harmless; provide explicit integration
for site-owned code; and support independently testable implementation checkpoints.

**Non-Goals:** revision history, an unrestricted build service, a public draft
API, a production deployment through preview, hiding arbitrary external effects
of site JavaScript, automatic rebuild/retry, and guaranteeing a particular free
hosting capacity or a fixed percentage reduction in build time.

## Decisions

### 1. One plan, six implementation checkpoints

PV1A–PV1F in [tasks.md](tasks.md) are verified in order, one checkpoint at a time.
The initial estimate is 6–10 working sessions, not a single apply turn. A session
may finish only part of a checkpoint; completed task boxes and concise evidence
must distinguish what is complete from what remains. The feature stays disabled
until the final acceptance gate. Keep one coordinated protocol/specification set;
do not pre-create six additional changes or independently release partial preview
surfaces. This is an explicit staged roadmap exception, separate from EX units.

### 2. Responsibilities and dependency direction

| Area | Responsibility |
| --- | --- |
| `domain` / `content` | Portable identities, state rules and reuse of publication candidate validation; no runner or provider imports |
| `application/src/preview/`, `ports/preview.ts` | Admission, input capture, invalidation, finalization, deadline/cleanup coordination; actor permission checks |
| `db` | Additive preview schema, read queries, shared guarded write plans and repository contracts; hook successful lifecycle plans into invalidation |
| `auth` / runtime security adapters | Validate original session/current user and exchange restricted preview credentials; no grant to admin from a preview cookie |
| `contracts` / `server` | Validated DTOs, closed route policies, body/rate limits and status mapping; preview-host routing separate from CMS routing |
| `sdk` | Explicit frozen preview-input client and immutable site-view assembly, with no framework imports or widening of public export auth |
| `astro` | Opt-in preview loader glue and integration, one-route prerendering and private media mapping; server-only `parse5` HTML transform |
| `platform-node`, `platform-cloudflare` | Portable ports implemented with SQLite/D1, private S3/R2, session persistence, Node builder/GitHub and scheduled maintenance |
| `apps/builder` | Fixed isolated preview command, source pinning, shared process scheduling and cancellation |
| `apps/admin` | Permission-driven actions/status, separate preview screen and responsive iframe/new-tab behavior |
| `cli`, `create-lace`, deployment templates | Setup diagnostics, generated workflow/configuration and existing-site adoption guidance |

No new domain-to-contract REST edge, server-to-platform edge or Astro-to-content
edge is allowed. Durable preview notifications, if needed for post-commit work,
use the existing `contracts/outbox` boundary; they must not inherit automatic
build reruns. Maintenance retries cleanup and idempotent transport only.
The exact `parse5` exception is confined to one server-only adapter module and
covered by the workspace-governance delta. It avoids regex rewriting of HTML.

### 3. State and persistence model

Use preview-owned tables rather than `site_builds` or extra content snapshots:

- `preview_generations`: generation/entity/model identity, captured draft revision,
  logical target path, public version, preview capture epoch, configuration identity, source commit,
  creator, state, timestamps/deadlines, execution claim/fencing token, provider
  correlation, input/output manifest references and safe failure reason.
- One installation execution slot and one entity current-generation pointer.
  Slot reservation is guarded in SQL, not an in-process mutex or a GitHub
  concurrency group alone. Historical metadata is bounded operational evidence,
  not a list of reusable preview revisions.
- Temporary captured target rows/blocks and a media-reference projection keyed
  by generation. Copy rows set-based under the admission guards; avoid one
  giant JSON record that can exceed D1 row limits. Media references identify
  affected generations but must not add restrictive content-history references.
- Hashed handoff/preview-session/runner credentials and bounded expiry metadata.
  Preview sessions reference the original security session ID. Invalidated
  generation tombstones remain until credentials and late callbacks cannot live.
- Frozen context pages and staged/final artifact objects live in private object
  storage, never binary SQL rows. Manifests identify schema version, hashes,
  byte lengths and normalized paths. Database pointers expose only sealed output.

States: `preparing -> dispatched -> running -> ready`; terminal outcomes include
`failed`, `timed_out`, `invalidated`, and `expired`. Absence is represented by no
current generation. `dispatched` includes provider runner waiting, not a preview
queue. Ready generations do not occupy the build slot. A separate executor lease
tracks whether physical work is still running after logical termination.

Node and D1 use the same predicates and ordered plans. D1 admission, claim,
finalization and invalidation use bounded atomic batches with explicit no-op
outcomes; Node uses the native transaction executor. No interactive D1 transaction
or process-local concurrency assumption is introduced.

### 4. Admission and immutable input capture

1. Authenticate a browser actor with `content:write`; validate eligible model,
   configured capability, expected revision and closed idempotency request.
2. Read and validate the complete candidate using the existing publication
   projection, including required visible fields/blocks, conditional omission,
   hidden-block draft rules, media validity and route constraints. Validation
   failures preserve existing preview and start no runner.
3. Atomically reserve the installation slot, fence the validated draft revision,
   configuration, publication version, preview capture epoch and source selection, copy the
   target input and references, record the captured public version, set the
   current generation and invalidate the prior preview. Conflicts/busy/replays
   perform no replacement writes. On VPS also obtain executor admission as
   described below, releasing a provisional reservation if SQL admission fails.
4. Capture published context in bounded pages against that recorded version,
   including globals and route-less records. Seal it only after all pages pass
   version/configuration/epoch checks. Store target media metadata with the capture.
   If any capture fence changes before sealing, fail this generation;
   do not silently shift it or retry the build. The target copy survives a later
   save. Once sealed, later unrelated publications do not affect the input.
5. Remove the target's old published entry/path from the captured context and
   overlay its projected saved representation. Resolve links from this coherent
   view without mutating stored data or importing other drafts. The preview
   envelope carries capture time/revision; it must not present a synthetic
   timestamp as evidence that an unpublished target was published.
6. Resolve and pin the configured source commit before invoking site code,
   seal the input manifest and dispatch the fixed runner. Fail safely if the
   source or input cannot be pinned within the overall deadline.

Resumable block migration units can change published snapshots before final
sync advances the public version (architecture §4.7). Advance a separate
preview capture epoch in the same SQL transaction as each committed in-place
published block migration. Admission and the atomic input seal compare the
observed epoch as well as the public version and configuration identity.
An epoch change fails capture with `PREVIEW_CONTEXT_CHANGED`. The epoch
does not participate in public export or publication scheduling.

The full context is needed even for one output page: a site can read navigation,
settings, records or related posts. It is not a full-site draft overlay. The
ordinary public export, version, route table and production outbox are untouched.
Inputs are purged after terminal recovery no longer needs them; output stays for
24 hours from readiness. Frozen inputs never become user-accessible history.

### 5. Lifecycle fences and deadline handling

| Event | Ready preview | In-flight generation |
| --- | --- | --- |
| Save/revert target | Retain; show captured revision as older if changed | Continue captured revision |
| Unpublish target | Retain | Continue captured revision |
| Publish target successfully | Invalidate atomically | Invalidate and fence completion |
| Delete target / remove model | Invalidate atomically | Invalidate and fence completion |
| Delete included media successfully | Invalidate every affected package | Invalidate and fence completion |
| Publish another entity/global after input sealed | Retain frozen context | Continue frozen context |
| Change site source after commit pinned | Retain pinned output | Continue pinned source |
| Admit replacement | Invalidate immediately | Another active preview is busy, no replacement admitted |
| TTL or deadline | Deny regardless of object cleanup | Terminate, revoke runner access, reject completion |

Extend the success branch of publication, entity/model removal and media deletion
shared plans. Do not invalidate on a rejected command or on idempotent replay;
otherwise replaying yesterday's publish could delete today's preview. While preparing, conservatively track media from captured input; on sealing
the final manifest retain the target dependencies and media actually used in
the output/copied originals. Finalization rechecks that all used media are still
valid, including dependencies discovered during rendering. Removing unrelated
media after readiness does not invalidate an unaffected package. Use a
lifecycle generation/epoch fence independent of the mutable draft revision so
ordinary saves do not cancel work. Model removal/re-addition must not make an
old generation valid again. Config incompatibility before input seal fails;
a compatible already frozen package remains independent of later code changes.

Overall deadline is admission + 15 minutes. Execution deadline is
`min(startedAt + 10 minutes, overallDeadline)`, covering source checkout/install,
render and upload together. Heartbeats do not extend either. Node kills the
process group and confirms termination; GitHub sets a 10-minute job timeout and
also runs the earlier-deadline watchdog, with API cancellation/reconciliation.
A stale executor cannot upload/finalize after its lease/deadline. Do not free
physical capacity merely because a timestamp elapsed: until termination is
confirmed or the executor's hard-stop guarantee has elapsed, refuse overlapping
preview execution with a recovery status. Reconcile crashes through scheduled
maintenance and before admission; never automatically start another build.

### 6. HTTP and credential surfaces

Route names below are the planned contract, mounted below an installation's
existing API base where relevant; exact request/response schemas are owned by
`contracts` and OpenAPI. No editor-supplied commands or locations are accepted.

| Surface | Credential / operation |
| --- | --- |
| `GET /api/v1/admin/preview/config` | Browser `content:read`; safe readiness, view mode and missing-setup summary |
| `GET /api/v1/admin/entries/:id/preview` | Browser `content:read`; current generation/status |
| `POST /api/v1/admin/entries/:id/preview` | Browser `content:write`; expectedRevision + idempotency key; also used for recreate/retry |
| `GET /api/v1/admin/preview/authorize` | Live browser session; complete a validated preview-origin initiation |
| Preview host `/access/start`, `/access/callback` | Restricted browser-bound handoff, never admin APIs |
| Preview host `/view/:generationId` | Protected standalone viewer metadata and frame for top-level access |
| Preview host `/p/:generationId/*` | Restricted preview session; guarded manifest-listed package files |
| CMS `/api/v1/preview-runner/*` | Dedicated executor bootstrap or generation-scoped claim; input, artifact upload and completion only |
| Builder `/preview` | Dedicated private API-to-builder credential; opaque generation/claim IDs only |

Use the existing route-policy registry, same-origin mutation protections and
permission-derived admin affordances. Expected outcomes: unauthenticated 401,
insufficient scope 403, ineligible/conflicting/busy 409, validation 422 under
existing error conventions, setup/provider unavailable 503, unavailable
artifacts 404 or 410 only after authorization. Use closed stable `PREVIEW_*`
reasons and localized explanations. No raw provider errors in browser DTOs.

The preview host starts a random short-lived flow with a Secure/HttpOnly
host-only nonce cookie. Server state binds its hashed nonce, allowlisted return
path and origin pair. CMS authorization checks the real session and issues a
one-use code bound to that flow/session. Callback atomically redeems it only
with the correct browser nonce, rechecks the parent, clears transient state and
sets a `__Host-` preview cookie (`Path=/`, no Domain, Secure, HttpOnly,
SameSite=Lax). Proposed protocol default: handoff lifetime 60 seconds;
preview session absolute lifetime no longer than 24 hours or the parent session,
whichever ends first. Access still checks the parent on every request. Flow
storage supports independent browser tabs rather than one global pending flow.
Use high-entropy tokens, hashed storage, bounded attempts, no token-bearing
logs, and `no-referrer` on transition responses. Login returns through a new
validated flow rather than preserving an expired code. Public build/import/MCP
credentials are never accepted at these boundaries.

### 7. Resource gateway, framing and standalone viewing

Check the current preview grant, live original session, active user/current
`content:read`, and valid current generation before every resource access.
Use an indexed joined lookup where possible; no cross-request authorization cache
that delays revocation. Then normalize the URL once, check manifest membership,
and stream the private object with known content type and `nosniff`. Handle HEAD
and range consistently after authorization. All private responses are
`private, no-store`; disable public edge caching and service-worker registration
on the preview origin. Already loaded bytes cannot be recalled after logout.

The CMS screen owns the revision, freshness/expiry banner and viewport controls.
Its iframe loads the distinct preview host. Compute compatibility using HTTPS
scheme and registrable-domain comparison with public-suffix awareness, not a
naive string suffix (`workers.dev` and similar provider domains require care).
Unknown/incompatible configurations use top-level viewing. Do not weaken cookie
policy to depend on third-party cookies. Keep an explicit Open in new tab action.

A top-level `/view/:generationId` on the preview hostname supplies a minimal
Lace-owned revision/expiry header and frames the site's `/p/...` document on that
same hostname. This preserves revision visibility for incompatible-domain users
without granting admin authority or injecting admin CSS into the site. Both
wrapper and site require the same preview session. CSP permits only configured
CMS ancestry and the preview origin's own viewer; an arbitrary external site is
not permitted. A same-origin relationship within that restricted viewer grants
no CMS session privileges. The CMS itself remains protected from framing.

Choose iframe permissions that keep the site's supported scripts, images,
lightboxes, videos, forms and new-tab links functional while denying navigation
of the administrative top-level window. A preview flag, not guessed script
rewriting, lets the site suppress analytics/forms. On missing login, frame failure
or expired access, offer a top-level sign-in/view action without redirect loops.
Use a narrowly validated readiness/error message channel (origin, source window
and generation) if needed; do not accept administrative commands from the frame.

### 8. Astro integration and artifact construction

Expose a server-only `@lacecms/astro/preview` entry for the opt-in integration and
loader glue. It is inert outside a validated preview build; do not turn ordinary
`createAstroSiteLoader` into a draft reader. The separate SDK preview input path
reuses pure site-view assembly, preserving existing public wire contracts.
The preview view exposes the target's logical path independently of the serving
prefix; `byPath`/route helpers normalize the generation prefix only in preview
mode so fixed pages using `Astro.url.pathname` work as well as slug routes.

Use the supported Astro prerenderer extension demonstrated by the spike: wrap
path enumeration, require exactly one target and preserve underlying lifecycle
and image collection behavior. Fail compatibility checks for unsupported Astro
versions. Do not rely on private Vite output naming. Filter non-target HTML,
robots and sitemap output before packaging; shared chunks and safe public assets
may remain, so single-page rendering is not a minimal-byte guarantee.

Set Astro base to `/p/<generation>/` for its asset graph. Use the build's private
input/media access during image optimization and map output/original URLs to
that prefix. Copy needed originals into the generation package, record media
identities for invalidation, and ensure decoded source/variant URLs contain no
credentials. Stage originals before invoking Astro; materialize them locally
so image reads do not require leaking build credentials into HTML URLs.

Use a server-only `parse5` pass to classify rendered anchor hrefs separately
from resources, retain fragment-only navigation and turn page links into public
URLs under the configured site base path. Preserve safe query/fragment parts
and nofollow, add `_blank` plus `noopener noreferrer` for page navigation, and
exclude download/media links from page rewriting. Do not use `<base>` or regex
substitution. Imported resources work through Astro; literal root-relative
`public/` assets require an explicit preview asset helper or safe manifest-based
rewriting. Missing required local assets fail packaging. Runtime `fetch`, custom
JavaScript URL generation and unsupported integrations are an explicit site
adoption responsibility, covered with positive and failing fixtures.

Inspect package contents before upload: one selected site HTML page, normal
files only, path/type allowlist, finite file-count/per-file/total-byte/manifest
budgets, and no raw input, `.env`, Git/CMS data, source maps or host paths. Stream
uploads and bounded manifest pages rather than buffering a package in Worker
memory. The initial conservative implementation defaults are 2,000 files,
32 MiB per file, 100 MiB total and a 1 MiB manifest; expose safe limit errors and
allow operators to lower these bounds. These are engineering defaults, not
promises about Cloudflare/GitHub free-tier capacity.

### 9. Execution, source pinning and finalization

**Shared protocol.** The job ID is not a credential. A configured executor
bootstrap credential can claim only an admitted job assigned to that executor;
it cannot create previews or use admin/content mutation APIs. Claim atomically
returns one generation-scoped short-lived credential, input manifest and exact
source identity. Duplicate dispatches lose the execution claim. Keep bootstrap
credentials outside the site subprocess environment; downloaded inputs allow
rendering without exposing control credentials. Upload/completion runs in the
trusted wrapper using the scoped credential. Validate expected claim, deadline,
file integrity and resource budgets on upload. Writes after sealing/finalization
are denied. Make the ready pointer visible only after the complete verified
manifest is stored and SQL finalization still admits that generation. Retransmit
an identical request/result when needed; never rerun a failed site build.

**Cloudflare.** Configure repository, workflow identity, source ref/project
selection, dispatch credential and executor bootstrap secret separately from
Pages. Resolve the current source ref to a commit, dispatch a fixed workflow with
opaque generation identity and the pinned checkout identity from trusted job
metadata, and freeze the lockfile/toolchain. The workflow exchanges its configured
runner credential for the generation claim. Record the exact run ID/attempt at
claim; do not infer it from newest branch activity. GitHub concurrency is an extra
safety guard, not the admission algorithm; do not cancel unrelated publication
work. Upload through authenticated streaming gateway endpoints into private R2,
with no public bucket/custom domain and no plaintext input in workflow inputs,
logs or downloadable public artifacts. Scheduled Worker maintenance reconciles
waiting/running jobs, deadlines and cleanup. No Pages preview is created.

**VPS.** Extend the private builder with a separate closed `/preview` operation;
keep `/build` unchanged. Refactor its local scheduling to share one physical
execution slot: publication waiters retain their existing queue and next-slot
priority, preview has no waiting queue. Use a bounded provisional executor
reservation before preview SQL admission; failed admission releases it. If a
publication arrives after reservation but before execution, decline/cancel that
reservation rather than queue preview ahead of publication. An already running
preview completes within its cap. Persist/correlate executor claims so a builder
restart cannot overlap orphan processes; supervise process groups and recover
before accepting work. Private preview output goes to the configured private
S3 store, not the static web volume/current release pointer.

Node uses the configured publication source root/project, but preview requires
an immutable Git source identity: resolve the clean selected checkout's commit
and stage that tree (and frozen lockfile), excluding runtime data. Dirty tracked
or relevant untracked site source fails with a safe diagnostic rather than
silently omitting changes; configured secret/cache/data exclusions do not make a
checkout dirty. Unsupported submodule/LFS/source arrangements fail preflight until
explicitly supported and tested. This requirement is opt-in for preview and does
not change ordinary VPS publication's existing mounted-source behavior.

### 10. Migration, configuration and observability

Add forward migrations using the existing schema journal and Node/D1 parity
checks; add indexed generation/session/media lookups and bounded cleanup scans.
No existing draft/published rows are converted into preview state. Include
invalidation guards in the same release as tables; older deployment rollback
keeps the additive tables but disables preview routing/dispatch before reverting
packages. Cancel runners and revoke grants before rollback, then clean private
objects. Never roll back by restoring a public artifact or making the bucket
public. Main capability specs synchronize only after implementation verification.

Configuration is opt-in and fail-closed: explicit preview origin, public site
URL, compatible integration, source selection, private storage, executor identity
and credential references. Node adds preview host proxy routing; Cloudflare adds
host routing and the dedicated workflow/secret setup. Settings and doctor show
missing requirements without credentials. Readiness verifies known configuration
and compatibility; the first real build proves remote availability. Existing-site
mode requires explicit adoption, no-site mode remains unavailable. Document setup,
manual retry, TTL, limits, quota exhaustion and rollback on each deployment.

Emit bounded structured generation/entry/revision/source/run IDs, status/phase,
start/end times, elapsed time, bytes/file count and fixed failure codes. Redact
credentials, signed handoff URLs, raw draft data, absolute paths and subprocess
output. Keep user failure messages actionable without linking to logs they may
not be authorized to read. Separate preview metrics from publication build counts.

## Risks / Trade-offs

- Free-tier limits and per-asset authorization requests -> document measured
  requests/CPU/storage/run time; use bounded indexed checks and streaming; no
  promise that avoiding Pages makes preview free or zero-cost.
- One-page rendering still compiles/enumerates shared code -> compatibility tests
  and honest diagnostics; no whole-site fallback or unsupported speed guarantee.
- Frozen context can be large or change during capture -> paged snapshots and
  version fences, explicit failure/manual retry, D1 query/row budget tests.
- Async object storage cannot join SQL transactions -> staging, manifest sealing,
  SQL admission fences and eventual cleanup; never infer readiness from upload.
- Arbitrary site scripts and source mistakes -> separate origin, preview flag,
  trusted operator source and clear integration contract; no untrusted-code sandbox
  or guarantee of identical third-party behavior in preview.
- Same-site iframe support varies with domain configuration -> public-suffix-aware
  decision and always-available top-level viewer; browser tests, no Lax-to-None hack.
- Crash/timeout and lease races -> distinguish logical terminal state from physical
  execution, enforce provider/process hard stops and reject every stale callback.
- Real-provider behavior was not covered by the local spike -> PV1E/PV1F must
  record real GitHub/Worker/R2 acceptance before declaring Cloudflare ready.

## References

- [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
- [GitHub job timeouts](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes)
- [R2 Worker streaming API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cookie site boundaries](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies)
- [CSP frame ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)
