# Preview implementation verification

## PV1F task 6.3 verified locally on 2026-11-21

Open preview shows a full-screen read-only dialog with the entry title, captured
revision, saved revision when different, readiness time and expiry. The editor
stays mounted. The dialog has keyboard-operable desktop and 390 px narrow
widths, and closing it restores focus to its trigger or the preview card.

Readiness uses the catalog-pinned Public Suffix List through `tldts`, including
private suffixes. Only distinct HTTPS hostnames with a known common registrable
domain get iframe mode. The iframe and the new-tab link each start a fresh
handoff on the preview host. The iframe status channel checks the sending
window, exact origin, generation and message shape.

The compiled Admin passed the HTTPS Chromium fixture with real Better Auth
sessions, SQLite and disposable SILO. It exercised same-site framing,
site scripts and styles, blocked parent access and service workers, desktop and
narrow widths including a 375 px window, and cross-site new-tab access. Two
generations remained available in separate tabs. The fixture also verified
frame recovery after loss of the preview cookie, normal sign-in in a new tab
after loss of the CMS cookie, keyboard operation and preservation of unsaved
text. The final browser command was
`pnpm exec vitest run --config vitest.verification.config.mjs --project preview-https`.

The editor and API suites passed 184 tests, and the final targeted Admin rerun
passed 26. The preview contract and server suites passed 20, and local
Cloudflare D1/R2 passed eight. The two optional Node/S3 tests passed in isolation.
The combined Node/S3 run reported an asynchronous AWS SDK checksum error after
its assertions passed. The reported checksum matches the original manifest
in the existing manifest-size mismatch exercise, whose read returns before
consuming the body. The storage handling is outside this checkpoint.

Root typecheck, lint, formatting and strict OpenSpec validation passed. The
OpenAPI artifact includes both view modes and passed regeneration using a
temporary Git index. Task 6.4 is next.

## PV1F task 6.2 verified locally on 2026-11-21

The entry editor shows preparation, builder waiting, execution and terminal
outcomes. It displays the captured revision and the current saved revision when
they differ, with request time, readiness time and expiry where applicable.
The ready link disappears when its expiry passes in the open editor. Build
failure guidance uses the closed preview reason codes and includes the
generation ID in technical details. Status and admission request errors expose
safe guidance and the request ID when available.

The foreground editor reads active status every five seconds for up to 15
minutes from its first active response. Polling stops on a terminal response or
read failure. A manual status refresh can recover a failed read. Tests with
controlled timers covered all active phases, terminal outcomes, expiry and the
polling limit. They also verified that readiness opens no tab, that polling
sends only status requests, and that an explicit Retry after a save submits the
new saved revision while unsaved edits keep Retry disabled.

The admin entry and API suites passed 181 tests across 26 files, including the
OpenAPI client guard. Root typecheck, lint (including boundaries and schema),
format check and strict OpenSpec change validation passed. Task 6.3 is next.

## PV1E real-provider acceptance on 2026-11-21

With the corrected PAT, the packed candidate Worker dispatched GitHub Actions
run `44917152693` from D1 generation `01M7ZA50YB0XAT9XZB288C094M` for the
saved Home revision 3 at source SHA `22cb77c16387c28a099bc930af1b742729aeb50c`.
D1, GitHub's Actions API and the trusted runner log matched all three IDs.
The first run attempt finished successfully. The package contained five files
and 7,607 bytes. The runner took 47.9 seconds, the generation became ready after
56.8 seconds, and its lifetime was 24 hours from readiness.

With a normal Lace admin session and the preview handoff, the real gateway
served the draft HTML with its CSS, a generation-scoped asset and the original
image with the expected SHA-256. The image supported authenticated HEAD and
range requests. Without the preview cookie, the three resources were refused
including an anonymous conditional range request. The ordinary CMS media URL
returned 404 for the unpublished original. Pages deployment IDs and published
HTML were unchanged after the ready run. The publication version was 2 and
the build history still contained two records.

Generation `01M7ZA9FKACN4WXNBMW0G17ADP` dispatched run `44917378559` at the same
source SHA. A test-only job kept the GitHub run active without claiming the
preview. The API reported `PREVIEW_TIMED_OUT` after the 15-minute deadline.
The scheduled Worker made the timeout durable on its next pass and requested
cancellation of that run. D1 held the slot while GitHub still reported the run
in progress. GitHub confirmed cancellation before the preview job could claim.
A later maintenance pass released the slot and removed the private inputs.
A late claim using the correct runner secret, SHA and run ID returned 409.
There was one GitHub run per generation and no automatic retry.

After the deadline run, Pages still reported the same production and preview
deployment IDs. The published HTML and public CMS home response matched the
baseline. The publication version and build count stayed at 2. The R2 bucket
had `r2.dev` access disabled and no custom domains. The original RC5 Worker
version and cron were restored. The temporary acceptance entry returned 404
on both hosts, and the GitHub workflow and its temporary settings were
deactivated after the run.

The 14 focused Cloudflare and GitHub tests, root typecheck, lint, format check
and strict OpenSpec validation passed. Task 5.5 is complete.

## PV1E real-provider attempt on 2026-11-21

The authorized `test-homepage` stand used the RC5 public-content baseline in a
separate D1 database, new private media and preview R2 buckets, and a temporary
candidate Worker version. All six migrations were present. The test used a
normal Lace administrator session created through setup on the isolated copy.
It saved revision 3 of Home with a synthetic draft-only image. The public
media endpoint returned 404, and the publication version stayed at 2.

GitHub Actions built the private Linux amd64 candidate builder image in run
`44910860424`. The acceptance source ref resolved to
`22cb77c16387c28a099bc930af1b742729aeb50c`. Real Workers exposed three transport
gaps: an empty HTTP POST can arrive as a stream, the global `fetch` requires
its Workerd receiver, and Workerd accepts `manual` redirect handling instead of
the `error` option. The test adapter now checks for bytes in the request body.
The GitHub client binds `fetch` and treats redirects as errors without
following them. Focused tests exercise each case.

With the corrected transport behavior, GitHub returned 200 for commit lookup
and 403 for workflow dispatch with the configured Worker PAT. GitHub classified
the failure as a PAT permission denial. The same dispatch endpoint returned
200 with the operator CLI authorization for the inert workflow registration
on `main` (run `44915826494`, skipped). The preview generation had no provider
run and reported `PREVIEW_CONFIGURATION_UNAVAILABLE`. The Pages deployment
inventory was unchanged from the baseline recorded after workflow registration
and branch pushes. The temporary preview bucket had public `r2.dev` access off.

This attempt left task 5.5 open. The pre-test RC5 Worker and its original
schedule were restored. Both the CMS and Pages returned 200, and the temporary
acceptance route returned 404 on both hostnames. The acceptance run above
reused the isolated resources and test branches with a corrected credential.

## PV1F task 6.1 verified locally on 2026-11-18

The owner approved applying 6.1 after the local PV1E checks and before the
real-provider acceptance in 5.5. Both runtime compositions
advertise preview readiness and allow admission only when explicitly enabled
in the checkpoint fixture and the runner settings are complete. The default
deployment reports preview unavailable.

The session-only API returns safe readiness, preview status and admission
receipts. Admins and editors can create, recreate or retry the saved revision.
Viewers can inspect and open a ready preview in a new tab. The actions preserve
unsaved values and map field and block issues to the existing validation flow.
Local D1 tests verified stale revision, missing field/block data, cross-origin
mutation, busy admission and idempotent replay with a single dispatch.

- Admin editor and client suites passed 147 tests. The relocated preview-action
  companion and OpenAPI client check passed 15 tests on rerun.
- Cloudflare preview suites passed nine tests on local D1/R2. The Node suite
  passed two SQLite/session cases. Two existing S3 integration cases require the
  separate `LACE_TEST_PREVIEW_S3_URL` fixture.
- Contracts passed 13 tests and two packaged export checks. Server routes and
  OpenAPI coverage passed 12 tests.
- Root typecheck, lint, format check and strict OpenSpec validation passed.
  OpenAPI regenerated byte-for-byte and its check passed using a temporary Git
  index containing the regenerated artifact.

## PV1E local verification on 2026-11-18

Tasks 5.1–5.4 passed locally. The Worker resolves the configured GitHub ref,
records the dispatch response's exact run ID in D1, and checks the workflow
path, generation, source SHA and initial run attempt before granting a claim.
Changing the configured site selection fences outstanding claims. The generated
workflow checks the claim before checkout, uses a 10-minute job timeout and
runs the fixed Astro build in a separate container with frozen dependencies and
detached preview input. The trusted wrapper holds the scoped upload credential.

The consumer Worker uses a private `PREVIEW` R2 binding and a distinct HTTPS
preview hostname. The local fixture issued runner requests against a migrated D1
and private R2, including a native streaming upload in Workerd. Concurrent
claims yielded one authorization. The checks covered mismatched runs and source,
private originals, unauthenticated delivery, prefix isolation, oversized input,
partial output and duplicate completion with fixed TTL. The publication version
and build-trigger count stayed stable throughout the preview. The GitHub fixture
observed only repository commit and Actions endpoints.

The scheduled pass recognizes a completed run with a missing callback, handles
late starts and deadlines, and requests cancellation of the exact run. It holds
capacity until it can confirm termination, including when the GitHub credential
is temporarily revoked. After confirmation it clears the lease and removes
private inputs in bounded passes. The tests exercised late and duplicate
callbacks and verified one dispatch without an automatic rebuild.

### Test results

- Focused Cloudflare and D1 suite (32 passing), SQLite preview repository
  contracts (30 passing), generator tests (36 passing), server preview tests
  (2 passing) and transport contract tests (4 passing).
- `node scripts/generated-project-acceptance.mjs snapshots` verified byte-stable
  regeneration for six variants. The fixture refresh also picked up the PV1D
  Compose and Nginx template changes already in the checkout.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and
  `pnpm exec openspec validate add-protected-draft-preview --type change --strict`.

### Remaining release gate

Task 5.5 remained open at the local checkpoint. The GitHub REST calls in the
local tests use a fixture.
Real acceptance requires an authorized disposable GitHub repository with the
workflow, the candidate builder image, and a deployed Worker with migrated D1,
private R2, the preview hostname and scoped provider and runner credentials.
Record the real run correlation, resource access, deadline cancellation and
publication isolation there before declaring PV1E verified on real providers.
Admin preview creation remains disabled pending the final checkpoints.

The [disposable Worker adapter](../../../packages/platform-cloudflare/src/test-support/preview-acceptance.ts)
was prepared and verified locally against D1 and Better Auth. Use it only in the
stand's Worker entry by exporting `previewAcceptanceWorker(createCloudflareWorker({ config }))`
and setting `LACE_PV1E_ACCEPTANCE` to `true` there. It uses the normal CMS admin
session and delegates preview delivery and scheduled maintenance to the Worker.

- Start with an empty-body `POST /__lace-pv1e/entries/<entryId>/<revision>/<key>`
  on the CMS origin with the admin cookie and matching `Origin` header. The
  receipt contains the generation ID, commit and overall deadline. Reuse the
  key only to check idempotent replay.
- Poll `GET /__lace-pv1e/entries/<entryId>` with the same session for lifecycle
  status and the publication version. Correlate the generation and commit with
  the Worker dispatch log and GitHub run. Open `/view/<generationId>` on the
  preview origin and check access with and without the session.
- Capture the publication baseline before the first run and repeat the check
  after the ready run and the deadline/cancellation run. Remove the temporary
  adapter from the stand's entry after recording the evidence.

## PV1D verified on 2026-11-17

Tasks 4.1–4.5 passed. The VPS builder pins the configured publication checkout
to its current clean Git commit and stages its tracked blobs and frozen lockfile.
The source tests cover dirty tracked and relevant untracked files, runtime data
and credential exclusions, a moving HEAD and unsupported source links.

The private builder reserves one preview before SQL admission. A rejected SQL
admission releases the reservation. A pending publication cancels a provisional
reservation and gets the next slot. A running preview retains physical capacity
until its process group exits and cleanup finishes. The image runs under
`tini`, which reaps children and closes the old PID namespace when the builder
exits. Startup removes interrupted preview scratch directories before accepting
new work. SQLite claims and the combined execution deadline fence late input,
uploads and completion, including after a container restart.

The image-pinned Astro helper stages scoped input and validates the output.
Site subprocesses receive the detached input path. The API streams the package
to private SILO storage and seals the ready result after verifying the required
files. Nginx forwards only viewer and handoff routes on the preview hostname.
The runner API stays on the private backend network.

### Test results

- The builder passed 62 focused cases and its packaged interruption test.
  Server claim and route tests passed. Preview repository contracts passed
  30 cases on SQLite and 15 on local D1. Generator tests passed 43 cases.
  The proxy and Compose checks passed nine cases.
- `docker build -f apps/builder/Dockerfile -t lace-pv1d-builder:local .`
  built the checked-out image. With a disposable local SILO and that image set
  through `LACE_TEST_PREVIEW_S3_URL` and `LACE_TEST_PREVIEW_BUILDER_IMAGE`,
  `pnpm exec vitest run --config vitest.verification.config.mjs --project preview-vps --project preview-https`
  passed both acceptance journeys. The fixed runner built a packed Astro
  consumer. A failed second file upload left the partial package inaccessible.
  A container restart and deadline reconciliation denied the old runner and
  cleared its scratch. Preview preserved the public release pointer, and
  normal publication afterward successfully switched it. Chromium exercised
  same-site framing and incompatible-domain top-level viewing.
- The Nginx 1.27.5 container routed the configured preview hostname to the
  protected viewer paths, returned 404 for admin and private runner paths
  through public ingress, and preserved the ordinary health route.
- `pnpm typecheck`, `pnpm lint` (including boundaries and Drizzle),
  `pnpm format:check`, `pnpm openapi:check` and
  `pnpm exec openspec validate add-protected-draft-preview --type change --strict`
  passed.

### Limits and handoff

VPS preview requires a clean mounted Git checkout at its repository root,
the supported static Astro integration and complete operator settings. Admin
creation remains disabled pending the final checkpoints. The next unchecked
task is 5.1 (PV1E), the Cloudflare GitHub runner configuration and dispatch.

## PV1C verified on 2026-11-17

Tasks 3.1–3.6 passed. The packed Astro integration renders the saved home,
fixed, newly routed and renamed collection pages through the selected site's
components. The SDK overlays only the target, keeps the captured public
context and resolves internal links against that view. The saved target has
a revision and capture time with no synthetic publication timestamp.

The trusted runner stages frozen input and originals in scratch and supplies
the input file through `LACE_PREVIEW_INPUT_FILE`. The site build uses a
loopback source for Astro image optimization and serves needed originals from
the generation prefix. The manifest reports media used by the image pipeline
and by literal output references. The package is checked with the same path,
type and manifest rules as the gateway. Build credentials and absolute
scratch paths are rejected from package files. Shared Astro assets can remain
in the package even when the selected page does not request them.

The starter pins Astro 7.4.12. The preview preflight accepts 7.4.12 and later
7.4 patches in static directory mode. Existing sites opt in by installing
`lacePreview()` and using the preview-aware server loader. The HTML pass
rebases literal local asset paths and rewrites page navigation against the
public site base. Custom runtime URL construction stays with the site.
Compilation and route enumeration can still visit unrelated code.

### Test results

- `pnpm turbo build --filter=@lacecms/astro --filter=create-lace` and
  `pnpm exec vitest run --config vitest.verification.config.mjs --project preview-astro`
  passed all 12 acceptance cases. The fixtures unpacked actual `pnpm pack`
  tarballs outside the checkout and reused the lockfile's third-party dependencies.
- Chromium loaded both generation prefixes at 1280 and 360 pixels. CSS and
  its font and background, optimized images, the lazy script and the lightbox
  original all loaded within the generation. The browser checks exercised
  fragment navigation and verified the public base path and new-tab link attributes.
- The packed starter rendered the saved post and reproduced byte-identical
  published post HTML on the ordinary builds before and after preview. The
  published API received only the two ordinary build requests. The generator
  reproduced all six reviewed project snapshots.
- Astro (87), SDK (115), application (170), contracts (209), generated
  onboarding (3), local D1/R2 preview (3) and server preview routing (1)
  tests passed. Packaged export checks and the boundary and release-artifact
  suites passed.
- `pnpm typecheck`, `pnpm lint` (including boundaries and Drizzle),
  `pnpm format:check`, `pnpm openapi:check` and
  `pnpm exec openspec validate add-protected-draft-preview --type change --strict`
  passed.

### Limits and handoff

The local staging limit is 10 MiB per original and 100 MiB total for originals
in the frozen context. The output package allows 2,000 files, 32 MiB per file,
100 MiB total and a 1 MiB manifest. The trusted runner can lower output limits.
The fixture checks missing and duplicate routes, missing literal assets,
unrelated route enumeration failure, unsupported Astro output, and denied
source maps, linked files, raw input and private values in output.

Runtime creation remains disabled. The next unchecked task is 4.1 (PV1D),
operator-selected immutable source preparation for the fixed VPS runner.

## PV1B verified on 2026-11-17

Tasks 2.1–2.6 passed. Node and the Worker exercise the same browser-bound
handoff against real Better Auth sessions. The callback exchanges its code from
the URL fragment in a bounded POST. An embedded handoff requests authorization
from the single CORS-enabled CMS endpoint, which lets the admin frame policy
allow only the configured preview origin. The standalone viewer supports
top-level sign-in and opens a fresh handoff after sign-in.

Private S3 and R2 staging accepts an immutable manifest first, so it can reject
files outside the declared package limits before writing them. The manifest
allows up to 2,000 files, 32 MiB per file, 100 MiB total and 1 MiB of manifest
data. Files use generation-scoped content hashes and create-only writes with
integrity checks. Finalization verifies the complete inventory before making
the manifest visible through the guarded generation pointer. Range requests
support a single byte interval. All resource methods check live parent
authorization and generation readiness before opening storage or returning a
validator.

Maintenance removes up to 16 expired handoffs and 16 expired preview sessions
per pass. The existing lifecycle cleanup processes up to two namespaces per
pass with up to 64 objects per namespace and preserves ready output when
purging inputs. Worker preview maintenance uses a dedicated `*/2 * * * *`
invocation so publication and preview have independent query budgets. The
runtime hook is wired in the checkpoint fixture. Production ingress and
executor configuration belong to PV1D/PV1E.

### Test results

- `pnpm --filter @lacecms/platform-node test src/runtime/preview.test.ts` passed
  three cases using SQLite and an ephemeral loopback SILO container from the
  repository-pinned image. Set `LACE_TEST_PREVIEW_S3_URL` to the disposable
  endpoint to include the S3 cases.
- `pnpm --filter @lacecms/platform-cloudflare test src/runtime/preview.test.ts
  src/worker-dispatch.test.ts` passed 11 cases on local D1/R2. The preview
  cleanup pass stayed within 50 statements and 100 bound parameters.
- `pnpm exec vitest run --config vitest.verification.config.mjs --project preview-https`
  passed in Chromium with the SILO fixture and compiled admin. It covered
  same-site framing with scripts and CSS, protection from foreign framing and
  service worker registration, cross-site new-tab access, and sign-in through
  the normal admin screen with return to the protected viewer.
- The focused `src/repository-contract.test.ts -t preview` reruns passed 30
  SQLite cases and 15 local D1 cases. Focused server, Better Auth and admin
  login regressions passed.
- Root `pnpm typecheck`, `pnpm lint` (including boundaries and Drizzle),
  `pnpm format:check`, `pnpm openapi:check` and
  `pnpm exec openspec validate add-protected-draft-preview --type change --strict`
  passed.

The fixture packages exercise delivery before a site runner is available.
Preview remained disabled in the deployment entry points. The next task at
the PV1B handoff was 3.1 (PV1C).

## PV1A verified on 2026-11-17

Tasks 1.1–1.8 passed. The shared application and SQL layers implement admission,
immutable input capture, runner claims, finalization, expiry, invalidation and
recovery. Invalidation shares the guarded publication, content removal, model
removal and media deletion transactions. Preview runtime creation and routes
remained disabled at the PV1A handoff.

The approved capture fence uses a preview-only epoch. The migration trigger
advances the epoch when a committed in-place write updates the current published
snapshot's revision or timestamp. Resumable published block migration changes
that epoch before the usual public version advances. Admission and the atomic
input seal check the epoch, configuration and public version. The race contract
runs an actual repository block migration between pages and verifies failure
with `PREVIEW_CONTEXT_CHANGED`, without sealing or automatically recapturing.

### Test results

- `pnpm --filter @lacecms/platform-node test src/repository-contract.test.ts`:
  295 passed across file-backed and in-memory SQLite.
- `pnpm --filter @lacecms/platform-cloudflare test src/repository-contract.test.ts
  src/d1-migration.test.ts src/d1-content-repository.test.ts src/d1-sync-batch.test.ts
  src/repository/publication-race.test.ts src/repository/media-budget.test.ts`:
  171 passed on local D1 using Miniflare with loopback access.
- Final focused reruns passed 30 preview cases on SQLite and 16 cases on local
  D1, including the preview migration. Additional schema and migration, shared
  read, SQLite publication race, conditional publication, route policy, schema
  validation and packaged entry point suites passed.
- `pnpm typecheck`, `pnpm lint` (including boundary and Drizzle checks),
  `pnpm format:check`, `pnpm openapi:check` and
  `pnpm exec openspec validate add-protected-draft-preview --type change --strict`
  passed.

### Limits observed in PV1A

One capture reads up to three pages of up to 100 published entries and records
per page, with globals in the first page. The 301-entry fixture rejected the
fourth page with `PREVIEW_RESOURCE_LIMIT` after 36 D1 statements and 7,320 rows
read. Oversized globals were rejected after the three preflight statements.
Capture also caps the configuration at 128 models, stored input at 8 MiB and
media dependencies at 2,000. These are implementation limits of PV1A.

Maintenance processes at most three deadlines and two private namespaces per
pass, deleting at most 64 objects per namespace operation. The recovery contract
covers unconfirmed termination, object store failure, and a SQL failure after
the objects are gone. It verifies that an unconfirmed executor retains the slot
and that recovery retries cleanup without restarting the build. The object
store and executor were injected fixtures. Session handoff, private delivery
and real runtime execution are later checkpoints.
