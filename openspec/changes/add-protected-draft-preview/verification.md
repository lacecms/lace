# Preview implementation verification

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
