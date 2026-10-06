# Lace MVP Implementation Roadmap

## 1. Purpose and source of truth

This document turns [`mvp-architecture.md`](./mvp-architecture.md) into an
implementation sequence. The architecture document owns product scope,
invariants, and technology decisions. This roadmap owns dependency order,
deliverables, acceptance criteria, and recommended session boundaries.

If implementation uncovers a conflict, change the architecture document first
and record a short ADR under `docs/adr/`; do not silently implement a different
design.

## 2. How to use the roadmap

A **session unit** is one cohesive change set that can be implemented, reviewed,
and verified without relying on uncommitted placeholder behavior. It is not a
time estimate. A session ends only when its listed checks pass or a concrete
external blocker is documented.

Size labels:

- **S — one session:** implement the whole step in one session.
- **M — two sessions:** use the stated `A` and `B` boundaries.
- **L — three or more sessions:** each named session is independently testable.

Every session follows the same completion rules:

1. Production code contains no untracked `TODO` standing in for required
   behavior. Deferred behavior is an explicit issue or roadmap item.
2. New public APIs have runtime validation, TypeScript types, and negative tests.
3. Database behavior has migration coverage and foreign-key enforcement.
4. The narrowest relevant tests, then root `typecheck` and `lint`, pass.
5. User-visible or operational behavior is documented in the same change.
6. No dependency-direction rule from the architecture is violated.

## 3. OpenSpec delivery workflow

OpenSpec is mandatory for roadmap implementation after this bootstrap planning
update. Changes are created just in time; do not pre-create all roadmap changes.

### Change granularity and naming

- One recommended session unit maps to one OpenSpec change by default.
- Use kebab-case names prefixed by the roadmap unit, for example
  `m00-baseline-adrs`, `m02a-field-descriptors`, or
  `m14b-cloudflare-worker-r2`.
- A change may cover two neighboring units only when the proposal explains why
  they cannot be reviewed or verified independently and the user approves the
  combined scope.
- A change may contain delta specs for multiple capabilities when the session
  unit genuinely crosses them; do not create artificial one-file-per-package
  capabilities.
- `skip_specs` is allowed only for a purely mechanical/tooling change with no
  observable capability requirement, and its proposal must justify the skip.

### Required lifecycle for every unit

1. **Propose.** Use the repository's `openspec-propose` skill. It creates the
   complete artifact set required by the configured schema: proposal, delta
   specs, design when applicable, and tasks. The proposal cites the roadmap unit
   and relevant architecture sections, states scope and non-goals, and identifies
   affected capability specs. This action is planning-only and ends without code
   changes.
2. **Review.** The user reviews the artifacts. Material ambiguity is resolved in
   the artifacts before apply. An existing proposal is revised through
   `openspec-update-change`, not by silently changing implementation intent.
3. **Apply.** After an explicit user request, use `openspec-apply-change`. Read all
   context files returned by the CLI, implement pending tasks in order, verify
   each task, and mark its checkbox only after its specified behavior is complete.
4. **Reconcile.** If implementation exposes a design or scope problem, stop the
   apply workflow. Update the OpenSpec artifacts—and architecture/roadmap first if
   their invariants change—then resume only after review.
5. **Validate.** Before completion, run
   `openspec validate <change-name> --type change --strict` plus the tests and
   quality commands required by the unit. An OpenSpec task is not complete when
   behavior or verification is deferred.
6. **Archive.** After an explicit user request, use `openspec-archive-change`.
   Synchronize delta specs into `openspec/specs/**` unless the reviewed change
   intentionally has no specs, verify the sync, and archive the completed change.

Proposal, apply, and archive are separate agent turns, although they may remain
in the same Codex task. The session units below count implementation/apply units;
the planning and archive turns are workflow gates, not additional implementation
units.

### CI and source-of-truth rules

- CI runs `openspec validate --all --strict` and rejects invalid active or main
  specs.
- Accepted main specs refine the architecture but never override it silently.
- Active change artifacts describe proposed behavior and are not accepted product
  truth until synchronized during archive.
- Tasks must link behavior, implementation, tests, and documentation closely
  enough that completion can be verified without interpreting intent from chat.
- Agents do not implement roadmap work that has no active, apply-ready OpenSpec
  change.

## 4. Fixed implementation conventions

These conventions remove choices that would otherwise make two implementations
incompatible:

- TypeScript uses strict mode, ESM, explicit package exports, and no default
  cross-package deep imports.
- pnpm catalogs centralize third-party versions; the lockfile is committed.
- Turborepo orchestrates `build`, `typecheck`, `lint`, and `test`.
- `@fission-ai/openspec` is pinned as a root development dependency; project
  commands use `pnpm exec openspec` rather than relying on a global install.
- Oxlint and Oxfmt are the lint/format pair. Use repository-root
  `.oxlintrc.json` and `.oxfmtrc.json`; do not add ESLint or Prettier packages,
  configs, plugins, or compatibility wrappers.
- Vitest is used for unit, contract, and API integration tests; Playwright is
  reserved for browser flows.
- IDs are ULIDs generated through the application `IdGenerator` port.
- Application time comes from a `Clock` port. SQL stores UTC Unix milliseconds;
  HTTP exposes ISO 8601 UTC strings.
- Transport handlers map domain/application errors to shared REST error codes;
  repositories never return HTTP concepts.
- SQL identifiers and migrations use snake_case; TypeScript values use
  camelCase; DTO mapping is explicit.
- Test fixtures use deterministic clocks and ID sequences.

## 5. Dependency and delivery overview

```text
foundation
  -> content/config
  -> domain/application
  -> database + Node repositories
  -> content sync
  -> REST + Node runtime
  -> auth
  -> media
  -> SDK + Astro fixture
  -> admin shell + editor
  -> local development environment
  -> local code-first configuration + sync
  -> live local Astro content
  -> complete browser-admin workflows
  -> admin redesign (design system, shell, media, editor)
  -> outbox + builder
  -> public site styling hooks
  -> Cloudflare runtime
  -> generator + upgrade
  -> local onboarding + alpha artifact verification
  -> feedback-driven local setup + diagnostics + quickstart
  -> browser setup + admin introduction
  -> explicit build site + verified publication modes
  -> shared rendering core + block installation
  -> complete Cloudflare consumer onboarding
  -> feedback regression + next alpha verification
  -> alpha.2 field-trial fixes + next alpha verification
  -> cross-runtime/security/release gate
```

| Step | Outcome | Size | Recommended session units |
| ---: | --- | :---: | --- |
| 0 | Baseline and ADRs | S | whole step |
| 1 | Workspace and CI | S | whole step |
| 2 | Field DSL and portable validation | M | 2A, 2B |
| 3 | Models, blocks, and normalized config | M | 3A, 3B |
| 4 | Domain and application core | L | 4A, 4B, 4C |
| 5 | SQLite schema and Node persistence | L | 5A, 5B, 5C |
| 6 | Configuration synchronization | M | 6A, 6B |
| 7 | REST contracts and Node API | L | 7A, 7B, 7C |
| 8 | Authentication and authorization | M | 8A, 8B |
| 9 | Media backend and MinIO | L | 9A, 9B, 9C |
| 10 | SDK and reference Astro site | M | 10A, 10B |
| 11 | Admin foundation | M | 11A, 11B |
| 12 | Draft and block editor | L | 12A, 12B, 12C |
| 12.5 | Local development environment | S | whole step |
| 13 | Local code-first configuration and sync | M | 13A, 13B |
| 14 | Live local Astro site | M | 14A, 14B |
| 15 | Complete browser-admin workflows | L | 15A, 15B, 15C |
| 16 | Admin design foundation and structure | M | 16A, 16B |
| 17 | Shell and collection lists | L | 17A, 17B, 17C |
| 18 | Media library | L | 18A, 18B, 18C |
| 19 | Block editor | L | 19A, 19B, 19C |
| 20 | Remaining screens and redesign acceptance | M | 20A, 20B |
| 21 | Outbox, builds, and VPS builder | L | 21A, 21B, 21C |
| 21.5 | Public site styling hooks | S | 21.5A |
| 22 | Cloudflare runtime | L | 22A, 22B, 22C |
| 23 | CLI generator and operational commands | L | 23A, 23B, 23C |
| 24 | Upgrade safety | M | 24A, 24B |
| 25 | Local onboarding and alpha release preparation | L | 25A, 25B, 25C |
| 26 | Reliable local setup and CLI diagnostics | L | 26A, 26B, 26C |
| 27 | Environment checks and generated-project quickstart | M | 27A, 27B |
| 28 | First-admin setup and guided admin introduction | M | 28A, 28B |
| 29 | Explicit build site and publication-mode guidance | M | 29A, 29B |
| 30 | Shared rendering core and block installation | L | 30A, 30B, 30C, 30D, 30E |
| 31 | Complete generated Cloudflare consumer onboarding | M | 31A, 31B |
| 32 | Feedback regression acceptance and next alpha preparation | M | 32A, 32B |
| 33 | Alpha.2 field-trial fixes and next alpha | L | 33A, 33B, 33C, 33D, 33E, 33F, 33G, 33H |
| 34 | MVP release gate | L | 34A, 34B, 34C |

The roadmap is therefore **94 recommended session units**. Small neighboring
units can be combined after the foundation stabilizes, but units that introduce
a database migration, a runtime adapter, or a security boundary should remain
separate.

### Post-alpha continuation and scope

Steps 0–25 are the completed baseline for this continuation. The owner's
published-alpha trial in an independent Astro project is recorded in
[`onboarding-feedback.md`](./archive/step-32/onboarding-feedback.md). Steps 26–32 address that
feedback and the remaining Cloudflare consumer-installation gap before the
former Step 26 release gate, now Step 34. Existing archived change names and
historical session references retain their original meaning.

The feedback is input to future proposals, not an accepted capability spec.
New command names, DTOs, persistence choices, and deployment configuration must
be settled in each just-in-time OpenSpec proposal. This roadmap revision does
not pre-create changes or mark proposed behavior implemented. Keep the existing
architecture invariants: operator-issued one-time setup token, one installation
per site, Astro public output, fixed-command builds, and protected user source.

The component-installation idea (§7) was scoped on 2026-10-04: Step 30 delivers
a framework-neutral rendering core, a thin Astro adapter, and the
`lace add block` installer for user-owned block sources, and makes the
generated starter optional at project creation. In-place CMS
installation into a nonempty project (§11) stays post-MVP. Selecting an external site's build
source in Step 29 is operator configuration alongside a separately generated
CMS directory, not a relaxation of the generator's empty-target contract.

After `0.1.0-alpha.2` was published, the owner connected it to an existing Astro
project, ran it in Docker Compose dev and production, and deployed the CMS
Worker and the Pages-hosted static site to a real Cloudflare account. The
defects and documentation gaps from that trial are recorded in
[`lace-alpha-2-feedback.md`](./archive/step-33/lace-alpha-2-feedback.md) (§1–§6 plus a
cross-cutting diagnostics requirement). Step 33 fixes them and prepares the
next compatible alpha; the release gate moves to Step 34. That trial is
early field evidence, not Step 34 deployment acceptance: the gate still runs
against the final candidate. The alpha.2 feedback, like the earlier feedback,
is proposal input rather than an accepted spec, and its documented workarounds
are not product fixes.

## 6. Detailed implementation steps

## Step 0 — Baseline and ADRs

**Outcome:** contributors can reproduce the chosen toolchain and understand the
few decisions whose rationale is not obvious from code.

### Substeps

1. Record the exact current stable versions of Node LTS, pnpm, TypeScript,
   Turborepo, `@fission-ai/openspec`, Oxlint, Oxfmt, Hono, Valibot, Drizzle,
   Better Auth, Astro, React, Vite, Wrangler, Vitest, and Playwright. Verify
   compatibility in a disposable smoke package before pinning them.
2. Add ADRs for:
   - package/dependency boundaries;
   - guarded D1 batches versus interactive Node transactions;
   - media-reference projection and asynchronous deletion;
   - fixed-command VPS builder security model.
3. Add `docs/compatibility.md` with the supported Node, pnpm, SQLite, Wrangler,
   and browser ranges. Treat `@lacecms/*` and `create-lace` as provisional names;
   do not publish packages in this step.
4. Add `SECURITY.md` with a private vulnerability-reporting placeholder and a
   statement that the repository is pre-release.

### Acceptance

- ADRs agree with the architecture and introduce no new product features.
- Every pinned package installs together on the selected Node version.
- The compatibility document distinguishes supported versions from versions
  merely used in CI.

**Session boundary:** S; complete as one session.

## Step 1 — Workspace, package boundaries, and CI

**Outcome:** the empty monorepo becomes a buildable skeleton whose dependency
rules are mechanically enforced.

### Substeps

1. Create root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
   `pnpm-workspace.yaml` catalog entries, `turbo.json`, `.editorconfig`,
   `.gitignore`, `.oxfmtrc.json`, `.oxlintrc.json`, and strict base TypeScript
   configs for library, browser, Node, and Worker targets.
2. Scaffold every package and app named in the architecture, including
   `apps/builder`. Each package gets a private initial version, explicit
   `exports`, `types`, and scripts. Do not add implementation dependencies until
   a later step needs them.
3. Add root commands required by section 18. Commands whose feature is not built
   yet must print a clear “not implemented in milestone N” message and exit
   successfully only for non-verification developer commands; `build`,
   `typecheck`, `lint`, and `test` must genuinely execute across the workspace.
   Add `spec:validate` as
   `openspec validate --all --strict --no-interactive` through the pinned local
   CLI.
4. Configure a TypeScript source-level boundary checker to encode the
   architecture import graph. Add a fixture proving an illegal import fails.
   Dependency-cruiser is deferred until it supports the project-pinned
   TypeScript 7 baseline; the active OpenSpec change MUST record the deferral
   and its replacement check.
5. Add GitHub Actions for install with frozen lockfile, Oxfmt check, Oxlint,
   typecheck, unit tests, build, OpenSpec strict validation, and lockfile/cache
   integrity. Integration jobs are added when their runtimes exist.

### Acceptance

- A clean checkout passes `pnpm install --frozen-lockfile`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- No package relies on source files through `../../packages/...` imports.
- CI and local commands use the same scripts.

**Session boundary:** S; complete as one session.

## Step 2 — Field DSL and portable validation

**Outcome:** a field definition has one portable source that produces static
types, runtime validation, and serializable form metadata.

### Session 2A — Field descriptors

1. In `packages/content`, define a discriminated `FieldDefinition` union for
   text, textarea, rich text, number, boolean, date, datetime, select, URL, and
   media.
2. Implement `field.*` builders. Builders accept JSON-serializable options only;
   reject functions, symbols, cyclic values, duplicate select values, invalid
   defaults, and contradictory constraints at config normalization time.
3. Define common options (`label`, `description`, `required`, `defaultValue`) and
   type-specific options such as string length, numeric bounds, and select
   choices. Defaults must pass the same schema as submitted content.
4. Produce serializable form metadata without embedding Valibot schemas or
   executable callbacks.
5. Add compile-time type tests and runtime table tests for every field variant.

### Session 2B — Validators and canonical data

1. Compile each field definition to a Valibot schema and provide an exhaustive
   visitor so adding a future variant produces a TypeScript error until every
   consumer handles it.
2. Implement explicit draft and publish validators. Both reject unknown keys and
   invalid present values; draft mode permits missing required model fields,
   while publish mode enforces them.
3. Implement Tiptap JSON validation with the architecture allowlist and URL
   protocol rules. Export a safe shared document type.
4. Add canonical JSON serialization with recursively sorted object keys and
   preserved array order. Hash canonical UTF-8 bytes with a Web Crypto-compatible
   SHA-256 helper; use the same fixtures in Node and Worker-like tests.
5. Enforce the title, slug, JSON-byte, and block-count constants defined by the
   architecture.

### Acceptance

- Metadata round-trips through JSON and contains no executable values.
- Type inference matches runtime optionality/default behavior.
- Malformed rich text, unsafe links, unknown fields, and oversized JSON fail with
  stable path-aware validation issues.

**Session boundary:** M; 2A and 2B are separate sessions.

## Step 3 — Models, blocks, and normalized configuration

**Outcome:** `lace.config.ts` can describe the complete MVP content structure and
produce deterministic runtime/admin projections.

### Session 3A — Models and routes

1. In `packages/config`, implement `definePage`, `defineCollection`, and
   `defineConfig` with inferred field types and duplicate-key detection.
2. Require model `version`, validate stable keys, and implement temporary
   `renamedFrom` metadata. Validate one page path or one collection route with
   exactly one `:slug` segment.
3. Implement route normalization/resolution and reject query strings, fragments,
   dot segments, duplicate slashes, ambiguous trailing slashes, and cross-model
   fixed-path collisions detectable from configuration alone.
4. Normalize definitions into deeply readonly plain data. Generate deterministic
   structural hashes excluding display metadata and projection hashes including
   it, at both per-model and whole-config levels.

### Session 3B — Block registry and projections

1. Implement `defineBlock`, schema versions, defaults, runtime validation,
   serializable metadata, and a registry with duplicate type/version checks.
2. Implement the five built-in block definitions exactly as documented. Built-ins
   must use the public DSL rather than hidden special-case validators.
3. Validate each model's allowed block types against its registry and validate
   a complete ordered draft aggregate.
4. Produce two projections:
   - runtime projection with compiled validators;
   - JSON admin/public projection with metadata and no functions.
5. Add a root-config fixture matching the architecture example and snapshot its
   canonical serialized projection.

### Acceptance

- Equal semantic configs produce equal hashes regardless of object insertion
  order.
- A Node import and a Worker bundle import normalize to identical fixtures.
- Invalid routes, missing blocks, duplicate keys, stale version/hash combinations,
  and invalid built-in defaults fail before the server starts.

**Session boundary:** M; 3A and 3B are separate sessions.

## Step 4 — Domain and application core

**Outcome:** all CMS behavior is executable in memory without Hono, Drizzle,
Better Auth, Node, or Cloudflare imports.

### Session 4A — Domain vocabulary and rules

1. Define branded IDs/keys where useful, `ContentModelKind`, draft/published
   aggregates, blocks, media metadata, build state, `Actor`, roles, permissions,
   and stable domain error codes.
2. Implement the default role-to-permission matrix and `requirePermission`.
3. Implement page cardinality, collection slug, route resolution, sparse block
   positions, normalization, and public-path conflict rules.
4. Define lifecycle invariants: one draft, zero/one published snapshot, immutable
   published data, and revision increment on every complete draft mutation.

### Session 4B — Ports and commands

1. Define focused read ports and specialized atomic mutation ports. Do not expose
   a generic cross-runtime transaction callback.
2. Required operations include model sync inspection/apply, create entry, load
   draft/published aggregate, list entries with cursor, save complete draft,
   publish guarded draft, delete entry, list public data, and build export.
3. Define `ObjectStorage`, `Cache`, `SiteBuildTrigger`, `Clock`, `IdGenerator`,
   password-safe token hashing, and dispatcher lease ports.
4. Define input/output types independently of REST DTOs and database rows.
5. Create in-memory fakes in `packages/test-utils` that enforce the same revision,
   route, singleton, and immutability invariants expected from SQL.

### Session 4C — Use cases

1. Implement create/list/get/save/publish/delete content use cases against ports.
2. Save accepts the full draft aggregate and expected revision; it applies draft
   validation to fields, blocks, media IDs, order, and byte limits before one
   atomic write. Publish reruns strict publish validation.
3. Publish validates, resolves the future route, calls the guarded atomic port,
   separates publication success from build status, and honors idempotency keys.
4. Delete requires `content:publish` when public output exists.
5. Add tests for permission denial, singleton races, revision conflicts, route
   conflicts, idempotency reuse, draft isolation, and unchanged published data
   after later draft edits.

### Acceptance

- The in-memory vertical slice can create a page, save blocks, publish it, edit
  the draft again, and still read the previous published value.
- Application and domain package dependency checks prove they do not import
  transport/framework/infrastructure packages.

**Session boundary:** L; use 4A, 4B, and 4C as three sessions.

## Step 5 — SQLite schema and Node persistence

**Outcome:** the application core runs against a real SQLite database with the
same atomic guarantees later required from D1.

### Session 5A — Schema and migrations

1. Implement the Drizzle SQLite schema for content models, entries, snapshots,
   blocks, routes, media, media references, published state, outbox events, site
   builds, idempotency records, installation state, setup tokens, API tokens, and
   rate-limit buckets.
2. Add every check, unique/partial index, foreign key, cascade/restrict action,
   and dispatcher lease column specified by the architecture. Add indexes for
   entry listing, route lookup, snapshot block order, media reference lookup,
   outbox availability, and build history.
3. Generate the first forward migration and a migration metadata/version query.
4. Enable WAL and foreign keys for Node connections. Keep SQL within the shared
   SQLite/D1 subset; any driver-specific pragma stays in the Node composition
   layer.
5. Test migrating an empty file and reopening it with all invariants enabled.

### Session 5B — Node repositories

1. Implement row mappers and read repositories with bounded queries and cursor
   pagination. Cursor payloads are base64url-encoded, versioned JSON validated
   before use. Admin entry lists order by `(updated_at DESC, id DESC)`; public
   collection lists order by `(published snapshot created_at DESC, entry id DESC)`.
   Cursor values are query boundaries, never authorization claims, so they do not
   require a signature.
2. Implement entry creation and complete-draft save with `better-sqlite3`
   transactions. A save replaces/upserts block rows and rebuilds draft media
   references atomically, then increments revision once.
3. Implement public route/media lookup and build export without N+1 queries.
4. Keep published snapshot mutation methods impossible to call through the
   ordinary draft repository API.

### Session 5C — Atomic publication and repository contracts

1. Implement Node publication in the same statement order as the architecture's
   guarded D1 batch, even though it runs inside an interactive transaction.
2. Copy blocks and media references with `INSERT ... SELECT`; update published
   version, route, idempotency record, and coalesced outbox event atomically.
3. Implement published-entry deletion and media delete marking.
4. Build a reusable repository contract suite in `test-utils`. It must assert
   cardinality, revision guards, route rollback, immutable publication,
   idempotency, reference projection, cascades, outbox coalescing, and cursor
   order.
5. Run the suite against a temporary file and in-memory SQLite.

### Acceptance

- Killing or throwing at each injected transaction checkpoint leaves either the
  old state or the complete new state, never a partial publication.
- `EXPLAIN QUERY PLAN` fixtures confirm indexed route, block-order, media-use,
  entry-list, and outbox scans.

**Session boundary:** L; 5A, 5B, and 5C are separate sessions.

## Step 6 — Configuration synchronization

**Outcome:** stored model identities can be reconciled safely with code-first
configuration before serving traffic.

### Session 6A — Planner

1. Implement a pure sync planner comparing normalized config with stored model
   key, kind, version, and hash.
2. Classify operations as create, label-only update, compatible version update,
   explicit rename, blocked removal, or incompatible change.
3. Refuse kind changes, version regressions, structural hash changes without a
   version bump, ambiguous rename hints, removals with entries, and incompatible
   changes with any draft or published snapshot.
4. Render deterministic human and JSON reports. `--check` returns non-zero when
   an apply would be needed or when the plan is invalid.

### Session 6B — Atomic apply

1. Apply an approved plan through a specialized repository operation.
2. Rename model foreign keys and the primary key atomically when `renamedFrom`
   is valid. Do not infer renames.
3. Create a missing singleton entry for each new page with model-label title,
   configured defaults, and the `system:content-sync` actor.
4. When the public projection changes, increment published state and enqueue one
   build request in the same transaction.
5. Add dry-run, apply, repeat-apply idempotency, and concurrent-sync tests.

### Acceptance

- Re-running sync with unchanged config performs no writes.
- `--check` never mutates data.
- Failed plans print exact model/field reasons and preserve all stored content.

**Session boundary:** M; 6A and 6B are separate sessions.

## Step 7 — REST contracts and Node API

**Outcome:** the content vertical slice is accessible through versioned,
documented HTTP endpoints on Node.

### Session 7A — Shared contracts

1. In `packages/contracts`, define Valibot request/response schemas for content
   models, entry lists/details, complete draft save, publish, delete, public
   reads, build export, media metadata, builds, pagination, and errors.
2. Map every application error to one stable status/code pair. Validation issues
   use stable field paths and never expose stack traces or SQL text.
3. Define ISO timestamp transforms, opaque cursors, ETag headers, idempotency-key
   rules, and `If-Match`/body revision precedence. Prefer one canonical mechanism
   in generated clients: body `expectedRevision`; accept `If-Match` only as an
   equivalent HTTP affordance and reject disagreement.
4. Add schema round-trip and invalid-payload tests.

### Session 7B — Hono app factory

1. Build a runtime-neutral Hono app factory receiving normalized config, use
   cases, auth middleware, logger, rate limiter, and environment metadata.
2. Mount request IDs, structured logging, sanitized error handling, JSON/body
   limits, `/health/live`, `/health/ready`, `/api/v1/*`, and generated OpenAPI.
3. Register public and admin content routes with Standard Schema validation.
4. Implement build-export ETag from `published_state.version`; return `304`
   without loading the full export when `If-None-Match` matches.
5. Serve the built admin fallback only outside `/api/*` and health routes.

### Session 7C — Node composition and integration tests

1. Compose Hono, normalized config, SQLite repositories, system clock/ULID, no-op
   cache, placeholder object storage, and no-op build trigger in `apps/api` and
   `packages/platform-node`.
2. Add environment validation that fails startup with named missing/invalid
   variables and never logs secret values. Require canonical
   `LACE_PUBLIC_BASE_URL`; never derive public media URLs from request host
   headers.
3. Implement `pnpm dev:node` with same-origin API proxying for admin/site dev.
4. Add HTTP integration tests for the complete unauthenticated public path and a
   test-only actor adapter for admin behavior; production cannot enable it.
5. Generate OpenAPI in CI and fail on an uncommitted contract diff.

### Acceptance

- A seeded Node server supports create, save, publish, public read, and
  conditional build export entirely through HTTP.
- Database rows are never serialized directly.
- Readiness fails for unavailable DB/config and stays cheap enough for probes.

**Session boundary:** L; use 7A, 7B, and 7C.

## Step 8 — Authentication and authorization

**Outcome:** browser admins use Better Auth sessions, automation uses separate
hashed tokens, and every protected operation checks permissions.

### Session 8A — Better Auth and actor boundary

1. Add Better Auth Drizzle tables through a forward migration and configure
   email/password authentication with public sign-up disabled.
2. Store validated role on the user record with `viewer` default. Add an auth
   adapter that maps Better Auth session data to the application `Actor`.
3. Mount `/api/auth/*` before catch-all routes and add session middleware only to
   protected paths. Configure same-origin cookies, trusted origins, CSRF/origin
   rules, and production secure-cookie behavior.
4. Replace the test actor in production composition. Route handlers request
   permissions; they never compare role strings.

### Session 8B — Bootstrap, users, tokens, and abuse controls

1. Implement one-time setup-token creation/storage/expiry and the guarded,
   retryable first-admin protocol. Claim the token for the requested email hash
   before Better Auth user creation, resume the same claim after interruption,
   reject takeover by another email, and return `404` after setup completes.
2. Implement admin-only create/list/disable-user and role-change endpoints needed
   by the `/users` MVP route. Prevent removal/demotion of the last active admin.
3. Implement opaque build-token creation, hashed storage, prefix display,
   revocation, constant-time verification, and `last_used_at` updates. Only the
   build-export endpoint accepts the initial capability.
4. Apply the architecture's SQL fixed-window limits to auth, setup, token, and
   later upload routes through a narrow middleware/port. Store only HMAC bucket
   keys; responses use `429` and `Retry-After`.
5. Test cookie flags, origin rejection, expired/reused setup tokens, revoked build
   tokens, permission matrix, and last-admin protection.

### Acceptance

- Anonymous users can access only documented public item/media routes, not
  build-export or admin routes.
- Editor cannot publish; viewer cannot mutate; admin can perform all matrix
  operations.
- No plaintext setup/build token is stored or logged.

**Session boundary:** M; 8A and 8B.

## Step 9 — Media backend and MinIO

**Outcome:** authenticated users can safely upload, reuse, view, and recoverably
delete media without storing binary data in SQL.

### Session 9A — Storage-neutral media use cases

1. Implement upload validation for the 10 MiB limit and exact MIME allowlist.
   Detect magic bytes, reject SVG/polyglot/empty/truncated files, sanitize the
   display filename, and generate an opaque storage key.
2. Extract image dimensions with a library proven to run in both target runtime
   builds or behind a portable metadata port. Enforce pixel/dimension ceilings to
   limit decompression bombs.
3. Implement create/list/get/delete/retry use cases. Metadata insertion happens
   only after a successful object put; a failed metadata insert triggers
   best-effort object cleanup and an error log with the storage key.
4. Validate media references during complete draft save and rebuild the
   relational reference projection.

### Session 9B — MinIO and HTTP

1. Implement Node S3-compatible storage against MinIO with streaming put/get,
   explicit timeouts, and bucket existence/startup checks.
2. Add admin multipart upload/list/delete/preview routes and the public stable
   media route. Public access requires a join to a currently published snapshot;
   admin preview requires `content:read`.
3. Add Docker Compose MinIO for development with persistent named volumes and no
   hard-coded production credentials.
4. Test filename/header injection, MIME mismatch, size cutoff while streaming,
   unauthenticated draft probing, and storage/database failures.

### Session 9C — Recoverable deletion

1. Implement generic outbox leasing sufficient for `media.delete.requested`:
   conditional claim, 60-second lease, bounded exponential retry with jitter,
   maximum-attempt visibility, and lease recovery.
2. On dispatch, delete the object idempotently, then remove the `deleting` media
   row. Set `delete_failed` plus sanitized error after terminal failure and expose
   an admin retry command.
3. Prove a concurrent draft save cannot select a deleting item and a concurrent
   delete cannot pass while a new reference commits.

### Acceptance

- No binary bytes enter SQLite.
- A published image remains reachable through its stable Lace URL across signed
  URL expiry.
- Storage outage leaves retryable metadata rather than a broken published
  reference.

**Session boundary:** L; use 9A, 9B, and 9C.

## Step 10 — Public SDK and reference Astro site

**Outcome:** a static Astro build consumes only published Lace contracts and
renders the starter content safely.

### Session 10A — SDK

1. Implement `createLaceClient` on injected/global `fetch` with base URL,
   optional build token, timeout/abort, stable user agent, and typed errors.
2. Implement page, collection pagination, collection-by-slug, by-path,
   build-export, and public-media URL helpers. Automatically follow collection
   cursors only in an explicitly named `getAll...` method.
3. Implement conditional build-export support and response validation; malformed
   server data is a contract error, not unchecked JSON.
4. Add fetch-mock tests for status mapping, aborts, cursors, `304`, token scoping,
   and base-path normalization.

### Session 10B — Astro fixture

1. Build `apps/site` with home and blog routes matching the starter config.
2. Implement Astro components for all five built-in blocks and a safe Tiptap
   allowlist renderer. Unknown block types fail the build with model, entry, and
   block identifiers.
3. Fetch one build export per build and derive static paths/data locally; do not
   issue one request per page.
4. Add a seeded export fixture and CI build proving draft content is absent,
   routes are generated, media URLs are stable, and unsafe rich text cannot be
   rendered.

### Acceptance

- The site builds with no CMS access when given the committed test export.
- The live mode builds through one authenticated export request.
- SDK has no admin-session or content-mutation capability.

**Session boundary:** M; 10A and 10B.

## Step 11 — Admin foundation

**Outcome:** users can sign in and navigate a responsive, accessible admin shell
driven by server configuration.

### Session 11A — UI system and routing

1. Configure React/Vite, TanStack Router, TanStack Query, Tailwind, and Radix.
2. Define Lace design tokens for color, typography, spacing, radius, focus, and
   motion. Build owned Button, Input, Select, Dialog, Toast, Table, Badge,
   Skeleton, EmptyState, and ErrorState components with Storybook or an
   equivalent isolated preview only if it does not delay the vertical slice.
3. Implement typed routes for login, content, model, entry, media, builds, users,
   and settings. Route guards load the session and redirect without flashing
   protected content.
4. Meet keyboard focus, label, contrast, reduced-motion, and narrow-screen shell
   requirements from the start.

### Session 11B — Remote state and lists

1. Implement the credentialed admin client from shared schemas, with one error
   mapper and request ID surfaced in technical details.
2. Load model projection to build navigation. Page items link directly to the
   singleton editor; collections show cursor-paginated entries.
3. Add create/delete entry flows with permission-aware controls. Hiding a button
   is convenience only; the API remains authoritative.
4. Add login/logout, expired-session recovery, loading/empty/error states, and
   query invalidation rules.

### Acceptance

- Viewer, editor, and admin shells show the correct affordances.
- Keyboard-only navigation reaches all current actions.
- Refreshing any client route is served by the API/admin composition root.

**Session boundary:** M; 11A and 11B.

## Step 12 — Draft and block editor

**Outcome:** editors can manage the entire draft aggregate without violating
revision or publication isolation.

### Session 12A — Metadata-driven fields

1. Build a field-renderer registry over serializable metadata for every MVP field
   type. React Hook Form owns editable values; Valibot validates locally using a
   client-safe compiled schema.
2. Implement title and collection slug as explicit system fields. Slug suggestion
   is opt-in and stops auto-updating after manual edits.
3. Add dirty-state navigation protection, accessible field errors, save status,
   and no implicit autosave in the MVP.
4. Save through one complete-draft `PUT` with expected revision and replace local
   state only from the validated server response.

### Session 12B — Blocks and rich text

1. Implement add, duplicate, remove, collapse, and keyboard/drag reorder for
   allowed blocks. Preserve stable block keys; the browser generates ULIDs for
   new blocks and the server accepts them after format and per-snapshot uniqueness
   validation.
2. Use sparse positions locally but send an ordered list; the server assigns or
   normalizes canonical positions.
3. Integrate Tiptap with exactly the shared allowlist and no raw HTML extension.
4. Add generic built-in block forms and media-picker placeholders connected to
   the media API from step 9.

### Session 12C — Publication and conflict UX

1. Show draft revision, last editor/time, published state, resolved public path,
   and latest target/build status.
2. On `CONTENT_REVISION_CONFLICT`, preserve the user's unsaved values and offer
   “reload server draft” or “copy my JSON”; do not implement an unsafe automatic
   merge.
3. Add admin-only publish with explicit confirmation and idempotency key retained
   across network retries. Show “published/build pending” separately from build
   success.
4. Add component tests and Playwright coverage for add/edit/reorder/save,
   concurrent conflict, editor publish denial, admin publish, and later draft
   edits not changing public output.

### Acceptance

- Every Save increments revision once regardless of how many fields/blocks
  changed.
- Reloading after a conflict cannot overwrite the local draft without an explicit
  user choice.
- Rich text and URLs rejected by the server are also identified in the form.

**Session boundary:** L; use 12A, 12B, and 12C.

## Step 12.5 — Local development environment

**Outcome:** a contributor can start the complete Node/SQLite/MinIO/API/Admin/
Astro browser stack from a clean configured checkout, bootstrap a first local
administrator, and repeat a non-destructive smoke verification before Step 13
begins the local content workflow.

### Substeps

1. Expand the development Compose topology to include persistent SQLite and
   MinIO data, idempotent bucket initialization, forward migrations, the Node
   API gateway, Admin Vite, and Astro development servers. Use health checks and
   dependency conditions instead of fixed sleeps; mount workspace sources while
   isolating container-native dependencies. Do not add a builder, release
   directory, production reverse proxy, public object bucket, or hard-coded
   credentials.
2. Make `pnpm dev:node` the single Node local-start command. Add documented
   start/stop/log/reset/bootstrap/smoke commands that delegate to one Compose
   topology. Preserve API and health namespaces at the Node gateway, support
   frontend development upgrade traffic, and make reset the only explicitly
   destructive operation. The local bootstrap helper must mint the existing
   one-time setup token and never seed a password or write a plaintext token.
3. Complete `.env.example` with every required local setting but no usable
   secret. Replace the root README with the canonical developer guide covering
   prerequisites, first start, first-admin setup, local URLs, normal operations,
   testing, quality gates, resets, and troubleshooting; reconcile focused Node,
   authentication, and migration references.
4. Add a `dev:smoke` command that creates a unique temporary Compose project,
   waits with bounded polling, verifies API, admin, site, and MinIO reachability,
   and cleans up only resources it created. Cover root lifecycle helpers and
   gateway routing/upgrade behavior with focused tests.

### Acceptance

- A clean configured checkout starts the full browser stack with `pnpm dev:node`;
  API, Admin, and site requests use the documented Node origin, while MinIO
  remains private.
- Normal stop/start preserves only the named Lace development data; reset is
  explicit, clearly destructive, and cannot target arbitrary Docker resources.
- `pnpm dev:smoke` is repeatable and does not alter an existing local stack or
  its data.
- The README alone is sufficient to complete first run, create an administrator,
  sign in, run tests, and diagnose common local failures.

**Session boundary:** S; complete as one session under the OpenSpec change
`m12d-local-dev-stack`.

## Step 13 — Local code-first configuration and sync

**Outcome:** a contributor can define a page or collection in version-controlled
configuration, synchronize it with local SQLite, and immediately find it in the
browser admin. Model structure remains code-first; content values remain
admin-managed. This advances the local Node portion of Step 23B without replacing
its cross-environment operational CLI.

### Session 13A — Project configuration entry point

1. Add a root `lace.config.ts` with the existing home page and posts collection as
   editable examples. Load and normalize this file in the Node development
   composition instead of using the hard-coded development configuration.
2. Preserve the architecture's typed page, collection, field, and block
   definitions. Changing a model key, path, route, or structure follows the
   existing version and `renamedFrom` rules; do not add browser-based model
   creation or arbitrary TypeScript evaluation through HTTP.
3. Document how a contributor defines a page or collection, chooses its Astro
   route and rendering code, and restarts the development API when configuration
   changes. Keep the sample project usable from a clean checkout.

### Session 13B — Local sync and empty-state guidance

1. Wire a local-only `content:sync` command to the existing planner and guarded
   Node apply operation. Show the plan before mutation, support non-mutating
   `--check`, and reject invalid or stale plans with actionable diagnostics.
2. Keep synchronization explicit. Startup and migration do not silently create,
   rename, or remove models. Sync creates singleton page drafts; collection
   entries are created later through the admin/API.
3. Make `/admin/content` explain the empty-model state and the local sync step.
   Distinguish no configured models, pending synchronization, and an API error
   where the available server information permits it.
4. Test first sync, repeated no-op sync, changed configuration, blocked unsafe
   changes, and the browser path from synced models to a page editor or
   collection list. Update the local developer guide.

### Acceptance

- A clean local checkout can synchronize its example models without a generated
  project or production deployment.
- A newly defined page gets exactly one editable draft; a newly defined
  collection appears with an empty entry list and a permitted create action.
- `--check` and failed plans preserve SQLite content and public state.

**Session boundary:** M; use 13A and 13B as separate OpenSpec changes.

## Step 14 — Live local Astro site

**Outcome:** the local site renders content published through the admin instead
of relying on the fixture export. The fixture remains available for isolated
reference-site tests.

### Session 14A — Published-content development mode

1. Connect the Astro development process to the local published-content API with
   a read-only build token, using the existing SDK and same-origin local stack.
   Document token setup through the existing admin API until the Settings screen
   in Step 15B exposes token management. Keep secrets on the server side and
   retain fixture mode for deterministic tests.
2. Ensure local content changes are visible through a documented refresh or
   restart workflow before automated build dispatch exists. Explain that saved
   drafts do not change the public site until publication.
3. Cover missing or invalid build tokens, an unavailable API, and a published
   export with no home page using actionable local errors.

### Session 14B — Code-owned routes and end-to-end content proof

1. Demonstrate one additional page and one additional collection using
   `lace.config.ts`, matching Astro route files, and the existing block renderer.
   Preserve the rule that the CMS validates route patterns but does not create
   Astro route files or choose site presentation.
2. Verify local sync, admin draft editing, publication, published-only API
   output, and the resulting Astro pages in one browser-level flow. Verify a
   later draft remains invisible on the public site until published.
3. Document the repeatable developer workflow for a new page, collection,
   field, and block, including which changes require a config version bump.

### Acceptance

- The local Astro site displays the latest published content from local SQLite
  after the documented refresh or restart step, without editing a JSON fixture.
- Adding a new code-owned route and synchronizing its model produces an editable
  admin surface and the expected public URL.

**Session boundary:** M; use 14A and 14B as separate OpenSpec changes.

## Step 15 — Complete browser-admin workflows

**Outcome:** a user can manage content, media, access, and operational settings
through the existing local browser stack before deployment tooling is expanded.
The server remains authoritative for permissions and validation.

### Session 15A — Media library and reuse

1. Replace the `/media` placeholder with browse, upload, preview, pagination,
   and permitted deletion/recovery controls backed by the existing media API.
2. Connect media selection in fields and blocks to the library, including a clear
   empty state, upload progress, validation errors, and inaccessible media.
3. Verify keyboard access and browser flows for upload, reuse, and failure
   recovery. Keep object storage credentials out of browser responses.

### Session 15B — Users and settings

1. Replace the `/users` placeholder with the existing admin-only user list,
   creation, role-change, and disable flows. Surface last-admin protection and
   API errors without suggesting a failed change succeeded.
2. Replace the `/settings` placeholder with the available status and API-token
   operations needed to configure and inspect a local site. Add missing
   read-only status contracts only when they have a concrete operator use.
3. Verify admin/editor/viewer affordances against server authorization, session
   expiry recovery, and safe handling of once-shown token values.

### Session 15C — Local product acceptance

1. Exercise a clean local setup from configuration sync through page editing,
   collection-entry creation, media upload/reuse, publication, and Astro output.
2. Test role restrictions, draft/published isolation, conflict recovery,
   responsive navigation, keyboard access, and the empty/error states of each
   now-functional route.
3. Resolve concrete product-flow gaps found by this pass before acceptance.
   Revise the active OpenSpec artifacts first when a fix changes accepted
   behavior; keep broader feature ideas in later, just-in-time changes rather
   than hiding them in the release gate.

### Acceptance

- An administrator can complete the local editorial flow without modifying a
  fixture or calling the content API by hand.
- Content, Media, Users, and Settings have useful behavior or an explicit,
  justified operational state; Builds gains its history/retry screen in Step 21.
  Viewer and editor permissions remain enforced by the API.
- A local product walkthrough can be repeated before any VPS, Cloudflare, or
  generated-project work starts.

**Session boundary:** L; use 15A, 15B, and 15C.

## Step 16 — Admin design foundation and structure

**Outcome:** the admin has an owned design system, a layered source structure,
and the existing behavior running unchanged inside it, so later steps can
rebuild screens one at a time.

The visual reference for Steps 16–20 is direction A of the admin redesign
canvas: a neutral inset-panel shell, indigo accent, Inter, 13px base text,
stacked collapsible block cards, and a right-hand editor column that holds
publication status and entry fields. Dark mode, a command palette, site-wide
search, and an activity feed are deferred beyond the MVP; the token structure
must allow dark mode later without rewriting components.

### Session 16A — Architecture, tooling, and tokens

1. Update architecture §17 and §19 and record an ADR: shadcn/ui generated on
   Radix as Lace-owned source (not a themed dependency), `lucide-react`,
   `sonner`, `@tanstack/react-table`, `react-dropzone`, `react-day-picker`, and
   self-hosted Inter through `@fontsource-variable/inter`.
2. Document the admin source layers and their import direction:
   `app → pages → widgets → features → entities → shared`. Slices in one layer
   do not import each other, every slice exposes only its `index.ts`, and every
   React component lives in its own PascalCase folder with its test and
   `index.ts`.
3. Define color, typography, spacing, radius, shadow, focus, and motion tokens
   as CSS variables in the shadcn convention. Ship the light theme only, with a
   theme selector structure that can add dark values later. Replace hand-written
   component CSS with Tailwind utilities over those tokens.
4. Add a lint check that rejects raw color literals in admin components.

### Session 16B — Layered skeleton and code migration

1. Create `app/`, `pages/`, `widgets/`, `features/`, `entities/`, and `shared/`
   under `apps/admin/src`, and extend `scripts/check-boundaries.mjs` so layer
   direction and slice public APIs are enforced by `pnpm lint`.
2. Generate the shadcn primitives (Button, Input, Textarea, Select, Dialog,
   Sheet, DropdownMenu, Popover, Tooltip, Badge, Table, Tabs, Skeleton, Toaster,
   Calendar, ScrollArea) and move each into `shared/ui/<Component>/`.
3. Move the admin client, error mapper, session, editor form, field renderer
   registry, and rich-text editor into `shared` and `entities`. Move each route
   screen out of `app.tsx` into its `pages/<route>/` folder without behavior
   changes; keep the code-based TanStack route tree in `app/router/`.
4. Move Playwright specs to `apps/admin/e2e/`. Existing component and browser
   tests pass unchanged in intent.

### Acceptance

- `pnpm lint` fails on an upward or cross-slice import.
- Every existing admin workflow still passes its tests after the move.
- No component in the new structure uses a raw color literal.

**Session boundary:** M; 16A and 16B.

## Step 17 — Shell and collection lists

**Outcome:** navigation and collection lists show what exists, its state, and
who changed it, without exposing internal identifiers.

### Session 17A — List fields and list contracts

1. Add optional `listFields` to `defineCollection`. Configuration validation
   rejects unknown and non-scalar fields; the admin configuration projection
   carries the list.
2. Extend the entry summary DTO with `slug`, a derived `status`
   (`draft`, `published`, or `changed`), `publishedAt`, `updatedBy` with
   `id` and `displayName`, and the values of the model's `listFields`.
3. Add entry-list query parameters `q` (title or slug), `status`, and `sort`,
   plus per-status totals. The full entry DTO also exposes the last editor's
   display name so viewers never need the users API to render it.
4. Cover the contracts, OpenAPI output, repositories, and negative cases.

### Session 17B — Application shell

1. Build the inset-panel shell: sidebar grouped into Pages, Collections,
   Library, and Admin with icons, counts, and role-aware items; a user menu with
   name, role, and log out; and a header with breadcrumbs.
2. Collapse the sidebar into a sheet on narrow screens and keep keyboard order
   and focus return correct.
3. Rebuild `/content` as an overview of pages and collections with status
   summaries.

### Session 17C — Collection list

1. Rebuild the collection route with TanStack Table: title with slug, status
   badge, `listFields` columns, published date, and relative edit time.
2. Keep search, status filter, and sort in router search parameters; paginate
   with the API cursor.
3. Restyle create and delete entry dialogs and add empty, loading, and error
   states.

### Acceptance

- A viewer, editor, and admin see the same list data with role-appropriate
  actions only.
- Reloading a filtered list URL restores the same filters.
- No list or shell surface shows a raw user or entry ID.

**Session boundary:** L; use 17A, 17B, and 17C.

## Step 18 — Media library

**Outcome:** editors browse, upload, inspect, and reuse images visually.

### Session 18A — Media contracts

1. Add media-list query parameters `q` (filename), `type`, and `sort`.
2. Record image width and height on the server at upload.
3. Expose where an item is used (entries and blocks), reusing existing reference
   data when it exists and adding it otherwise; deletion guidance uses the same
   data.

### Session 18B — Library screen

1. Rebuild `/media` as a tile grid with lazily loaded previews, type filters,
   search, sort, and a grid/list toggle.
2. Add a drop zone over the library plus multi-file upload with per-file
   progress, client-side type and size checks, and per-file server errors.
3. Add a details side panel with preview, type, dimensions, size, uploader,
   usage, copy URL, and confirmed deletion that respects recoverable deletion.

### Session 18C — Media picker

1. Replace the inline picker with a dialog that reuses the library grid, search,
   and in-dialog upload.
2. Show selected media in fields and blocks as a thumbnail with filename,
   Replace, and Remove, with explicit states for deleted or inaccessible items.

### Acceptance

- An editor can upload several images, see failures per file, and reuse an
  uploaded image in a block without leaving the editor.
- Keyboard users can open, choose, and close the picker and details panel.
- Object-storage credentials never reach the browser.

**Session boundary:** L; use 18A, 18B, and 18C.

## Step 19 — Block editor

**Outcome:** editing a page or entry is clear at a glance: the active block is
obvious, collapsed blocks stay recognizable, and publication state reads as
plain language.

### Session 19A — Editor layout and fields

1. Add a sticky header with breadcrumbs, unsaved-changes indicator, Save with
   `⌘S`/`Ctrl+S`, and Publish; render the title as a large input.
2. Add the right-hand column: publication status, live and draft revisions,
   last editor and relative time, public URL, latest build state, and the
   entry's slug and model fields.
3. Rebuild field renderers on the new primitives, including Select, a date
   picker, URL, boolean, and number fields. Restyle the publish confirmation and
   revision-conflict dialogs without changing their semantics.

### Session 19B — Block cards

1. Add optional `description` to block definitions and carry it in the block
   projection. The admin maps built-in block types to icons and uses a default
   icon for other blocks.
2. Render each block as a card with drag handle, icon, type, and a summary
   derived from its data; support collapse and expand, highlight the block being
   edited, and fix overlapping header text.
3. Add an actions menu (move up, move down, duplicate, remove with undo), an
   insert control between blocks, and an Add block menu with filter, icons, and
   descriptions. Keep keyboard and drag reordering.

### Session 19C — Rich text and validation

1. Add a fixed Tiptap toolbar for paragraph and heading level, bold, italic,
   strike, code, lists, quote, and links; links use a URL popover validated
   against the shared allowlist.
2. Add keyboard shortcuts and placeholders.
3. Show validation errors on fields and blocks plus a summary that links to the
   first invalid block; server rejections map to the same locations.

### Acceptance

- Adding, collapsing, reordering, and editing blocks keeps stable block keys and
  saves one revision per Save.
- Publication, build, and conflict states are shown without raw IDs or ISO
  timestamps.
- Every editor action is reachable by keyboard.

**Session boundary:** L; use 19A, 19B, and 19C.

## Step 20 — Remaining screens and redesign acceptance

**Outcome:** every admin route uses the new design system and structure, and the
legacy admin code is gone.

### Session 20A — Login, users, and settings

1. Rebuild login, users (table, role change, disable, create dialog), and
   settings (status cards, API token table, once-shown token dialog).
2. Add a not-found route and consistent empty, loading, and error states.

### Session 20B — Redesign acceptance

1. Add automated accessibility checks with `@axe-core/playwright` on every
   route, and complete a keyboard-only walkthrough.
2. Verify narrow-screen layouts, including the editor column stacking below the
   blocks, and confirm no component bypasses the theme tokens.
3. Repeat the Step 15C local product walkthrough on the redesigned admin.
4. Delete `app.tsx` and the legacy `components/ui.tsx`, and update admin and
   acceptance documentation.

### Acceptance

- No admin source remains outside the layered structure.
- Accessibility checks pass on every route.
- The local editorial walkthrough succeeds without fixture edits.

**Session boundary:** M; 20A and 20B.

## Step 21 — Outbox, build tracking, and VPS builder

**Outcome:** publication reliably causes a coalesced static build and operators
can see/retry failures.

### Session 21A — Site-build dispatch

1. Extend the generic dispatcher for `site.build.requested`. Use the architecture
   defaults: 5-second debounce, 60-second leases, full-jitter exponential backoff
   from 5 seconds capped at 15 minutes, and 8 total attempts. Keep these values
   centralized and testable.
2. Atomically claim an event and create a `site_builds` row with target published
   version. Publications after claim create the next pending event.
3. Define trigger outcomes as accepted with provider ID, synchronously succeeded,
   or failed. Store `pending/running/succeeded/failed` transitions and timestamps.
4. Add manual admin build request and retry semantics; both still coalesce through
   the outbox.

### Session 21B — Fixed-command builder

1. Build `apps/builder` as a private service accepting only an authenticated
   trigger containing build ID and target version. Reject command, path, env, or
   arbitrary argument fields.
2. Copy the read-only mounted site project into a temporary work directory,
   install with frozen lockfile using an image-pinned toolchain, run the fixed
   Astro build, and write to a new release directory. Use the reference project
   until Step 23 supplies the generated-project template; the generated project
   must then pass the same builder contract.
3. Atomically switch the static-output `current` release only after success; keep
   the previous successful release and clean older releases by fixed retention.
4. Return sanitized logs/status to the API without secrets or full environment
   dumps. Authenticate API-to-builder with a dedicated secret and no public port.

### Session 21C — VPS composition and build UI

1. Complete Docker Compose with API, MinIO, builder, and static reverse proxy,
   named database/object/output volumes, health checks, and internal networks.
2. Run a recovery dispatcher loop in a separate process/service so API restarts
   do not abandon events.
3. Implement `/builds` history/detail/retry UI with target version, provider ID,
   timestamps, and sanitized errors, using the Step 16 design system and layered
   admin structure.
4. Add an integration test that publishes several entries rapidly, observes one
   normal build, serves the new release, then verifies a failed build leaves the
   previous release online and can be retried.

### Acceptance

- Publication commits successfully even when the builder is offline.
- Recovery after process termination dispatches the leased event after expiry.
- No HTTP input can choose a shell command or filesystem target.

**Session boundary:** L; use 21A, 21B, and 21C.

## Step 21.5 — Public site styling hooks

**Outcome:** site owners can style built-in blocks globally, within one model,
or on one published entry using stable public HTML selectors without editing
block renderers or content data.

### Session 21.5A — Entry, block, and semantic part selectors

1. Add `data-lace-model` and `data-lace-entry` to the published entry container
   in the reference Astro site. Add `data-lace-block` and
   `data-lace-block-key` to each built-in block's semantic root.
2. Expose documented `data-lace-part` hooks for the meaningful parts of `hero`,
   `richText`, `image`, `quote`, and `cta`; omit hooks for absent optional parts.
   Keep rich-text safety and unsupported-block build failures intact.
3. Provide a site-owned global stylesheet entry and document type, model,
   entry, and instance selectors. Keep styling out of the CMS config, admin,
   REST contracts, and database.
4. Verify selectors and published-only output in the reference site's fixture
   build across all four routes.

### Acceptance

- Site-owned CSS can target a block type site-wide, in one model, or in one
  entry without changing the block renderer or CMS data.
- Each built-in block exposes its specified semantic parts; optional parts are
  absent when their data is absent.
- Routes and build data remain code-owned and published-only. No persistence or
  API migration is required.

**Session boundary:** S; use 21.5A as one OpenSpec change.

## Step 22 — Cloudflare runtime

**Outcome:** the same contracts and application behavior run locally and in a
Cloudflare Worker with D1 and R2.

### Session 22A — D1 persistence

1. Implement D1 read repositories and specialized atomic mutations using
   prepared statements and `batch()`. Never emulate an interactive transaction
   callback.
2. Publication uses guarded `INSERT ... SELECT`; every later statement is
   conditional on the new snapshot existing. Inspect affected rows and return a
   revision conflict on zero-row guard results.
3. Chunk complete draft block inserts within D1 bound-parameter and invocation
   query budgets while retaining one atomic batch and the 200-block/200-media-
   reference caps.
4. Run the reusable repository contract suite against local D1/Miniflare and add
   targeted tests for route-conflict rollback and concurrent revisions.

### Session 22B — R2, Worker, and scheduled recovery

1. Implement native R2 storage without the AWS SDK and the same media semantics
   as MinIO.
2. Compose Worker bindings for D1, R2, optional KV/no-op cache, deploy hook,
   secrets, and normalized statically imported `lace.config.ts`.
3. Enable the Better Auth compatibility flag, serve built admin assets under
   `/admin`, and preserve API/auth routing order.
4. Implement scheduled outbox recovery and event leasing. `waitUntil` may improve
   latency after commit but is never the only recovery path.
5. Implement D1 security-service persistence (setup tokens, first-admin
   bootstrap, users, API tokens, and rate-limit buckets) with the same guarded
   batch rules as 22A, together with Better Auth on D1.

The Worker bindings, secrets, routing, and recovery model are documented in
[`docs/cloudflare-worker.md`](cloudflare-worker.md).

### Session 22C — Cloudflare development and deploy hook

1. Implement `pnpm dev:cloudflare` with persisted local D1/R2 state and same-origin
   admin/API proxying.
2. Add the Cloudflare deploy-hook trigger with timeouts, authentication kept in
   Worker secrets, provider ID capture where available, and failure mapping.
3. Add migration commands for local and remote D1 with explicit environment
   selection and confirmation outside CI.
4. Add smoke tests for auth, upload/R2, publish, scheduled dispatch, build export,
   static admin fallback, and health endpoints.

Local development, the deploy hook, and D1 migration commands are documented in
[`docs/cloudflare-worker.md`](cloudflare-worker.md).

### Acceptance

- Node SQLite and local D1 pass the exact same repository contract suite.
- Worker bundle contains no Node-only SQLite, S3, filesystem, or secret material.
- Correctness is unchanged when KV is absent or stale.

**Session boundary:** L; use 22A, 22B, and 22C.

## Step 23 — CLI generator and operational commands

**Outcome:** a user can create an upgrade-aware Lace project and operate either
runtime without editing engine source.

### Session 23A — Generator

1. Implement `create-lace` commands `create <dir>` and `init .`. Resolve and
   validate the target path; allow only `.git`, `README.md`, and `LICENSE` in an
   otherwise empty target.
2. Generate user-owned `site/**` and `lace.config.ts`, root workspace files,
   `.env.example`, Docker Compose, optional Cloudflare workflow/config, and
   `.lace/manifest.json`.
3. Classify every template path as user-owned or managed. Record template version
   and SHA-256 for managed files only. Never include secrets in templates or the
   manifest.
4. Make generation transactional through a sibling temporary directory and
   atomic final rename where possible. On failure, leave the original target
   unchanged and report cleanup instructions.

### Session 23B — Migrate, sync, and bootstrap commands

1. Implement one CLI environment loader with named Node and Cloudflare targets;
   redact secret values in errors.
2. Wire `db migrate`, `content sync [--check]`, and `auth bootstrap` to the
   application services. Require explicit remote target selection; commands must
   not accidentally use production from a local default. Extend the local Node
   sync delivered in Step 13 rather than implementing a second sync policy.
3. Add machine-readable `--json`, non-interactive CI behavior, stable exit codes,
   and actionable human output.
4. Make migrations explicit deployment steps; API startup reports an outdated
   schema and fails readiness rather than auto-migrating production.

### Session 23C — Generated-project acceptance

1. Pack workspace packages locally and generate a project using the tarballs so
   tests do not accidentally resolve source-workspace imports.
2. Verify `pnpm install`, Node dev startup, migration, sync, bootstrap, login,
   edit, publish, Astro build, and Docker Compose production flow from the
   generated directory.
3. Verify the optional Cloudflare template bundles and passes local smoke tests.
4. Snapshot the generated tree and ownership manifest as a contract fixture.

### Acceptance

- A generated project contains no editable admin/engine source.
- The starter can be deleted and regenerated in tests with byte-stable managed
  files for the same template version.
- Commands never print passwords, tokens after their one allowed reveal, or
  complete environment values.

**Session boundary:** L; use 23A, 23B, and 23C.

## Step 24 — Upgrade safety

**Outcome:** engine upgrades preserve user source and never overwrite modified
managed files without an explicit resolution.

### Session 24A — Upgrade planner

1. Read the old manifest, hash current files, and compare old template, working
   tree, and new template as a three-way ownership decision.
2. Plan automatic dependency/image updates, unchanged managed-file replacement,
   conflicts for modified managed files, and no writes for user-owned paths.
3. Produce deterministic human/JSON plans and unified diffs. A dry run is the
   default until the user passes an explicit apply flag.
4. Validate manifest schema/version and refuse unknown newer formats.

### Session 24B — Apply and recovery

1. Apply conflict-free changes through temporary files and atomic renames; write
   the new manifest last.
2. For conflicts, write proposed files under `.lace/conflicts/<version>/` and
   leave working files untouched. Never resolve by choosing the new template
   automatically.
3. Print database/config migration instructions associated with the target engine
   version; do not auto-run production migrations.
4. Test unchanged upgrade, user-owned site edits, modified Compose conflicts,
   interrupted apply, repeated apply, and rollback using the preserved old
   manifest/template metadata.

### Acceptance

- A byte-different file under `site/**` is never rewritten.
- A user-modified managed file produces a reviewable diff and conflict artifact.
- Interrupted upgrades are detectable and safely repeatable.

**Session boundary:** M; 24A and 24B.

## Step 25 — Local onboarding and alpha release preparation

**Outcome:** a fresh consumer project can run the CMS and build its Astro site
locally using the prepared alpha packages and runtime images, without source
workspace links, manual dependency substitutions, or undocumented setup steps.
The artifacts are verified before their first publication.

This step prepares an experimental release such as `0.1.0-alpha.1` with the npm
`next` tag; it does not declare the MVP stable. Actual registry publication, the
owner's subsequent test repository, and a real Cloudflare deployment follow
separately. The full release gate remains Step 34. Preserve existing Node/D1 and
Worker checks; complete Cloudflare consumer onboarding after local user feedback
and before the Cloudflare deployment acceptance in Step 34.

### Session 25A — Minimal generated-project onboarding

Completed on 2026-09-30 with generator template `0.3.0` and a verified local
consumer journey. Artifact preparation and release acceptance remain separate
25B/25C boundaries.

1. Provide one documented local sequence for generation, dependency installation,
   environment setup, migrations, configuration sync, first-admin setup, login,
   publication, and Astro build. Use the generated project's commands and
   packaged runtime; no engine checkout is needed by the consumer.
2. Make first-admin setup usable through a supported command or browser flow.
   If the initial alpha retains the explicit setup API request, document that
   request accurately and do not direct users to a nonexistent setup wizard.
   Explain one-time setup/build tokens and supply no default credentials.
3. Include site-owned renderers for the five built-in blocks in the generated
   Astro starter, reusing the verified reference rendering behavior. Read a
   consistent published build export, keep rich-text validation and stable
   styling hooks, and document code-owned routes and custom-block renderers.
4. Separate the builder's internal API URL from browser-facing media URLs in
   generated Compose. Verify rendered images work outside Docker and that local
   API/admin, editable Astro development, and full Compose build commands are
   documented with their required environment settings.
5. Document existing content-model synchronization limits, including blocked
   structural changes to populated models. Keep content migration tooling,
   additional CMS features, and a complete Cloudflare generator outside this
   minimal onboarding unit.

### Session 25B — Coherent alpha packages and runtime artifacts

Completed on 2026-09-30 with package/image version `0.1.0-alpha.1`, template
`0.4.0` and local amd64/arm64 runtime verification. See
[`alpha-release.md`](./alpha-release.md) for owner-operated release
preparation/publication. Registry publication and 25C acceptance remain separate.

1. Confirm npm package-name ownership and container registry coordinates. Define
   the publishable runtime dependency graph and keep internal/test-only packages
   private. Choose explicit compatible prerelease package, generator/template,
   and API/builder image versions from one reviewed source revision.
2. Prepare publishable package manifests, exports, CLI executables, compiled
   files, database migrations, and template assets. Packed dependencies must
   resolve to release versions rather than `workspace:`, source paths, or the
   local tarball substitutions used only by acceptance tests.
3. Prepare versioned API and builder images, including the compatible compiled
   admin bundle, and document supported container architectures. Generated
   projects must select usable matching image coordinates without building the
   engine themselves; do not introduce a separate editable admin application.
4. Provide a repeatable build/pack/image preparation and publication procedure
   with an artifact inventory, prerequisites, version checks, and the explicit
   alpha channel. Keep registry credentials outside artifacts and generated
   files. Preparing or dry-running this procedure does not itself publish.

### Session 25C — Pre-publication consumer and security checks

Completed on 2026-09-30 against the exact clean `0.1.0-alpha.1` artifact set,
template `0.4.0`, with the full local arm64 consumer/security/recovery journey
and independent amd64/arm64 preparation smokes.
Alpha publication and Step 34 remain separate explicit release boundaries.

1. Extend the existing generated-project acceptance to install the exact packed
   alpha dependency graph and use its matching built images in an isolated
   consumer. Allow test-only artifact resolution without changing the delivered
   template; reject source-workspace imports and undocumented manual patches.
2. Verify generation, install, migration, sync, bootstrap/setup, login, draft
   editing, media upload/reuse, publication, and Astro output. Check built-in
   blocks and browser-reachable media URLs, then restart the local services and
   confirm database and object persistence.
3. Exercise the local Compose dispatcher/builder path through publication or an
   explicit build request. Confirm a successful release is served and a failed
   build preserves the previous release and can be retried. A remote VPS is not
   required for these checks.
4. Verify the essential authorization boundaries: editor/viewer cannot publish,
   anonymous consumers cannot read drafts or admin resources, a later draft does
   not alter published output, and build tokens only authorize published export.
   Check that generated files, package archives, images, static output, and
   diagnostics contain no setup passwords, tokens, or deployment secrets.
5. Run the existing Node/D1 and Worker smoke/contract checks relevant to the
   prepared artifacts, plus required root quality and strict OpenSpec checks.
   Inspect package/image contents and record the exact tested versions and
   results. Resolve blocking failures before alpha publication; document the
   experimental limits and the remaining Step 34 checks explicitly.

### Acceptance

- The prepared alpha artifact set supports a fresh, independent local project
  from generation through published HTML and media without the engine checkout.
- The generator, runtime packages, admin bundle, and container images agree on
  their release versions and documented installation procedure.
- Draft isolation, essential authorization, secret exclusion, persistence, and
  local build failure/retry checks pass against the consumer artifacts.
- Existing Cloudflare behavior remains covered locally; a real account, full
  Cloudflare onboarding, and stable-MVP release acceptance are not claimed.
- Artifacts are ready for an explicit alpha publication and subsequent personal
  testing; registry publication is not performed as a side effect of acceptance.

**Session boundary:** L; use 25A, 25B, and 25C as separate OpenSpec changes.

## Step 26 — Reliable local setup and CLI diagnostics

**Outcome:** a fresh generated project can prepare its environment and migrate
its database without manual directory creation, and operator failures explain
how to recover.

**Basis:** onboarding feedback §1, §2, and §8. Depends on completed Steps 23–25.

### Session 26A — Fresh SQLite migration

1. Create missing parent directories recursively before opening a file-backed
   SQLite database for explicit migration. Preserve existing directories/data;
   do not create directories for `:memory:` or add automatic API migrations.
2. Cover a fresh nested path, repeated migration, existing data, and directory
   creation failure through both the packaged CLI and runtime migration entry.
3. Replace the documented `mkdir -p` workaround with the verified normal flow.

### Session 26B — Actionable operational errors

Completed on 2026-10-02. Operational and upgrade failures include sanitized
`operation`, `reason` and `nextAction` fields with matching human guidance.
Known filesystem, schema, config, sync, completed-bootstrap and D1 failures are
classified without exposing secrets; upgrade reports and recovery state are
preserved. Existing symbolic/exit codes and successful token output remain
unchanged. Environment preparation remains session 26C.

1. Review migration, sync, bootstrap, and upgrade failures. Map known failures
   to a sanitized operation, concrete reason, and applicable recovery step;
   retain a safe fallback for unknown failures.
2. Preserve existing process exit codes, symbolic codes, and one-object JSON
   output. Define any additive diagnostic fields in the proposal; do not dump
   environment values, arbitrary subprocess output, passwords, or tokens.
3. Verify permission errors, missing/outdated schema, invalid target/config,
   blocked sync, completed bootstrap, and upgrade conflicts in human and JSON
   modes. Successful bootstrap retains its single intentional token reveal.

### Session 26C — Environment preparation

Completed on 2026-10-02. `lace env prepare [--json]` and generated
`pnpm env:prepare` work before `.env` exists. Preparation preserves template
settings, generates independent auth/MinIO/builder credentials, leaves the
build token empty, and publishes a complete owner-only file without overwriting
existing or concurrently created destinations. Sanitized recovery diagnostics,
write/publication failures, real process races and protected staging after
termination are covered. An isolated consumer installed from 12 packed Lace
packages passed preparation, repeat preservation and both migrations. CLI and
generator tests, root typecheck, Oxlint, Oxfmt and strict OpenSpec validation
passed. Existing alpha coordinates are unchanged; the next artifact refresh
remains Step 32B.

1. Add an explicit local preparation command; settle its name and generated
   script in the proposal. It must work before `.env` exists.
2. Copy `.env.example` settings and generate cryptographically random
   `LACE_AUTH_SECRET`, `LACE_MINIO_ROOT_ACCESS_KEY`, `LACE_MINIO_ROOT_SECRET`,
   and `LACE_BUILDER_SECRET`. Leave `LACE_BUILD_TOKEN` empty until Settings
   issues it; use credential formats accepted by the corresponding services.
3. Refuse to overwrite an existing `.env`, including concurrent creation;
   protect the resulting file, print no secrets, and verify preservation of
   non-secret template settings and absence of partially written output.
4. Document preparation in the generated operations guide and test it with
   packed packages, without a source-workspace dependency.

### Acceptance

- First `pnpm db:migrate` succeeds for the generated nested database path.
- Existing `.env` and database contents survive repeat commands unchanged.
- A failed command identifies the operation, known cause, and next action;
  automation retains parseable output and stable exit behavior.

**Session boundary:** L; use 26A, 26B, and 26C.

## Step 27 — Environment checks and generated-project quickstart

**Outcome:** consumers can find the setup sequence in their project's README
and diagnose prerequisites without changing their installation.

**Basis:** onboarding feedback §3, §4, and §9. Depends on Step 26.

### Session 27A — Read-only environment doctor

1. Add a diagnostic command (working name `lace doctor`; finalize syntax in
   the proposal) with explicit target and installation-stage selection.
2. Check the project's declared Node/pnpm compatibility, required settings,
   migration state, and API readiness. Check Compose/daemon availability only
   for modes that use Docker; use the selected Cloudflare prerequisites for
   Cloudflare targets and never fall back to a remote target.
3. Distinguish a failed prerequisite from an expected not-yet-started API or
   not-yet-created build token. Report each check with a safe explanation and
   recovery action, deterministic JSON, and documented exit semantics.
4. Make checks bounded and read-only: no migrations, sync, bootstrap, secret
   creation, service startup, or configuration writes. Test offline services,
   missing prerequisites, initial setup, and a ready installation.

### Session 27B — README and concise setup example

1. Generate a root `README.md` with prerequisites, installation, environment
   preparation, migrate/sync, start/stop, first admin, publication, and SDK/Astro
   integration. Explain `lace.config.ts`, models, routes, renderers, layouts,
   and the link to `docs/lace-operations.md`; a CMS in `cms/` gets this README
   in `cms/`.
2. Add a short placeholder-only `curl` example for `POST /api/v1/setup/admin`
   with `token`, `email`, and `password`, alongside the existing private-input
   script. Explain bootstrap, the 12-character password minimum, the configured
   public API origin, and shell-history exposure from inline credentials.
3. Define README ownership and manifest/snapshot updates. Preserve an existing
   allowed README byte-for-byte during `init .`; give an explicit way to access
   or incorporate Lace instructions instead of silently replacing user text.
4. Keep the quickstart consistent with delivered commands. Reconcile its setup,
   site-selection, and Cloudflare sections as Steps 28–31 land; verify a fresh
   generation and an init target with an existing README.

### Acceptance

- A consumer starts from the generated README without undisclosed setup steps.
- Doctor distinguishes initial setup from a broken running installation and
  leaves files, credentials, database, and services unchanged.
- Existing README content is preserved and Lace instructions remain reachable.

**Session boundary:** M; use 27A and 27B.

## Step 28 — First-admin setup and guided admin introduction

**Outcome:** an unconfigured installation explains how to create its first
administrator, and authenticated users can learn their available workflows.

**Basis:** onboarding feedback §5 and §6. Depends on Steps 26–27 and reuses
Step 8 security services and the Steps 16–20 admin design/layer conventions.

### Session 28A — Browser setup with the existing one-time token

1. Define a minimal setup-state contract for Node and Worker and an accessible
   pre-authentication setup screen. While setup is incomplete, the admin entry
   presents email, password, and bootstrap-token fields plus instructions for
   obtaining the token. Do not expose users, credentials, or protected state.
2. Submit through the existing guarded setup-admin protocol; preserve token
   expiry, email claim/resume, rate limits, password validation, and final token
   consumption. A setup-state read never grants the right to create an admin.
3. After completion, show normal sign-in or a verified authenticated transition.
   Close the setup form to later visitors; concurrent/stale clients must handle
   the existing completed-setup `404` without reopening registration.
4. Cover fresh setup, expired/invalid token, interruption/retry, concurrent
   completion, completed setup, and keyboard/axe/narrow-screen behavior on both
   runtime contracts. Update the quickstart while retaining the API alternative.

### Session 28B — Permission-aware introductory tour

1. Offer a tour on first authenticated use, derived from current navigation and
   permissions: Pages/Collections and draft/publication, Media, Builds, and
   Users/Settings only where available. Explain build-token creation only to
   users who can perform it; avoid instructions for unavailable actions.
2. Provide forward/back, skip/close, and an accessible replay entry. Decide and
   document the persistence scope for completion/dismissal in the proposal,
   including installation/user separation and behavior when storage is absent.
3. Respect keyboard focus, reduced motion, narrow layouts, loading/empty models,
   and role changes. Do not require tour completion for ordinary editorial work.
4. Test admin/editor/viewer paths and returning users; keep the tour text aligned
   with the verified publication modes from Step 29.

### Acceptance

- A first admin can complete setup in the browser with an operator-issued token.
- Completed setup remains closed; the UI does not weaken server authorization.
- The tour shows only usable routes/actions, can be dismissed and replayed,
  and passes the admin accessibility checks.

**Session boundary:** M; use 28A and 28B as separate security and UI changes.

## Step 29 — Explicit build site and publication-mode guidance

**Outcome:** the operator knows which Astro project a publication will rebuild
and when its content becomes visible in each supported mode.

**Basis:** onboarding feedback §10 and §12. Depends on Steps 26–28 and preserves
Step 21's fixed-command, single-site, and atomic-release contracts.

### Session 29A — Operator-selected Astro source

**Completed:** 2026-10-03. Explicit generated, standalone and workspace source
selection, current-site API/admin identity and ownership-safe template 0.7.0
guidance are implemented. Real local consumer builds, correction/retry, missing
binds, concurrent trigger serialization and the reference `apps/site` mount are
verified. See [29A verification](archive/step-29/step-29a-verification.md) and
[tested artifacts](archive/step-29/step-29a-artifacts.json). Publication visibility
verification remains 29B; these local checks do not claim a remote deployment.

1. Define deployment-time selection of the site source, installation/workspace
   root, lockfile, and static output. Support the generated `site/` default and
   a separately configured existing Astro site alongside a CMS subdirectory.
   Resolve container mount accessibility explicitly; host paths must not be
   assumed to exist inside the builder.
2. Keep one selected site per installation and the image-defined build command.
   The trigger still accepts only build ID/version; no HTTP request may choose
   paths, commands, arguments, or environment values. Validate configured paths
   and retain source filtering, frozen installs, version checks, and safe output.
3. Show a safe site identity in Builds and applicable settings/docs, without
   exposing internal filesystem paths or secrets. Define DTO/spec deltas and
   any required persistence at proposal time rather than adding a second site.
4. Test generated and external-site layouts, workspace and standalone lockfiles,
   inaccessible/invalid mounts, success, failure/retry, and preservation of the
   current release. Prove that the selected real site, rather than the unused
   generated example, is built and served.

### Session 29B — Verify and explain publication visibility

**Completed:** 2026-10-03. A packed-consumer acceptance phase reproduced the four
modes. Generated Astro dev memoized its first export, so publications stayed
invisible until restart; it now revalidates the export with its ETag and reads
posts by slug, so existing routes update on reload while new/renamed slugs still
need a dev restart. Manual static output changes only with a fresh build, and
Compose serves a release after its covering build (pending through the
synchronous build) with `Cache-Control: no-cache`. Template 0.8.0, generated
guides, Builds, the entry editor and the tour explain each mode without deployment
claims. See [29B verification](archive/step-29/step-29b-verification.md).

1. Reproduce publication in generated Astro dev, the independent existing-site
   dev integration, manual static build, and Compose automatic build. Record
   actual refresh/cache behavior before proposing changes; feedback does not
   establish a requirement to restart Astro after every publication.
2. Explain draft save, CMS publication, dev visibility, static build, and deployed
   output separately in README/operations and applicable admin guidance. Show
   the selected site and existing pending/running/succeeded/failed build state
   where known; do not claim dev or manual deployment success from CMS state.
3. If a stale-data defect is reproduced, scope its correction and regression
   coverage in the active proposal. Preserve one consistent published export
   per static build, draft isolation, and server-only build credentials.
4. Test the documented next action for each mode and update the relevant local
   development/onboarding specs where historical refresh guidance differs.

### Acceptance

- An operator can build the intended external Astro site with explicit config
  while preserving the fixed HTTP trigger and user-owned source.
- Publication guidance matches observed behavior; automatic dev updates do not
  gain an unnecessary mandatory restart.
- Failed builds keep the previous successful static release available.

**Session boundary:** M; use 29A and 29B.

## Step 30 — Shared rendering core and block installation

**Outcome:** public sites consume Lace content through packaged,
framework-neutral loading and rendering primitives plus a thin Astro adapter,
while visual block components remain user-owned source that `lace add block`
installs, versions, and updates without overwriting user edits. New projects
choose between the starter, an existing Astro site, or no site.

**Basis:** onboarding feedback §7 and the owner's 2026-10-04 scope decision; §11
remains deferred. Depends on Step 29. The first alpha is published, so this step
may break alpha compatibility deliberately to avoid later rework; existing
generated projects receive explicit migration instructions, never silent
rewrites of user-owned files.

**Decisions already taken (do not reopen in proposals):**

- *Package split.* Everything framework-independent lives in framework-neutral
  packages (`@lacecms/content`, `@lacecms/sdk`, and a framework-neutral render
  core). A framework adapter package contains only code that depends on that
  framework. Astro is the only adapter implemented now and the default framework.
- *Visual components are never npm-distributed.* Block markup is user-owned
  source: the generated starter ships it, and `lace add block` copies it from a
  versioned registry into existing sites. No adapter exports default visual
  blocks.
- *Block registration uses a generated map file* that the CLI maintains with hash
  conflict detection; the CLI never edits arbitrary user source.
- *Public DTO shape is unchanged in this step.* The loader hides that public
  entries reuse the content-entry schema (always-present `published`, mirrored
  `draft`); a dedicated public schema is an open question for Step 34.
- `create-lace init .` still requires an empty target. Adding blocks to an
  existing site is site-side tooling, not in-place CMS installation (§11).
- *Starter and reference site have separate roles.* The `create-lace` starter is
  a minimal product template; `apps/site` is the engine's development and
  integration playground and never ships to users. Both consume the same
  packages and take block sources from the 30D registry, so only their pages and
  layouts differ. The starter is optional at project creation (30E).

**Current-state inventory (input to 30A, verified 2026-10-04).** The generated
`site/` and `apps/site` each carry their own copies of:

- `lib/site-data.ts` — SDK client creation from env, ETag-conditional build-export
  reads, per-build memoization versus dev revalidation with a shared in-flight
  request, `LACE_EXPECTED_PUBLISHED_VERSION` consistency check, actionable
  401/403/transport errors, public media URLs, local export type copies, and a
  starter-specific derivation hard-coding `home` at `/` and `posts` at
  `/blog/<slug>`;
- `lib/rich-text.ts` — a re-implementation of the rich-text allowlist that
  already drifts from `@lacecms/content` (`validateRichTextDocument`,
  `isSafeUrl`): it accepts `https:example.com`, `mailto:` without `@`, and
  invalid nesting such as a paragraph inside a paragraph;
- `lib/rendering.ts` — hand-written field readers duplicating `builtInBlocks`
  definitions, although `validateBlockData`/`BlockDataValues` already exist;
- `BlockRenderer.astro` — a closed `if` chain over five block types;
- `RichText*.astro` — semantic rich-text output without styling;
- five visual blocks carrying the Step 21.5 `data-lace-*` styling hooks.

### Session 30A — Decision record, architecture, and package boundaries

**Completed:** 2026-10-04 (documentation only). [ADR 0006](adr/0006-shared-rendering-core-and-installed-block-source.md)
records the hybrid decision. Architecture §§6, 7, and 13 fix the package names
`@lacecms/render` (`render -> content`; no `contracts` edge — it takes a
structural block input) and `@lacecms/astro` (`astro -> render, sdk`, no
re-exports), the repository `registry/` directory, the site-local
`lace.site.json`, the block map file `src/lace/blocks.ts`, installed components
under `src/components/lace/`, the loader file `src/lib/lace.ts`, and the public
APIs `createPublishedSiteLoader`, `parseBlock`, `defineBlockMap`,
`resolveBlock`, `BlockProps`, `describeRichText`, `LacePublishedSiteError`,
`LaceRenderError`, `createAstroSiteLoader`, `LaceBlocks`, and `RichText`.
Later sessions reuse these names; exact DTO fields and spec wording stay with
their changes.

Planning/documentation only; no production code.

1. Record an ADR under `docs/adr/` with the decision above, the compared options
   (copy-only starter, npm-packaged renderers, source installer, chosen hybrid),
   their tradeoffs, and the drift evidence from the inventory.
2. Update `docs/mvp-architecture.md` before any implementation unit:
   - package list and dependency graph for the render core and framework
     adapters (fixed as `render -> content`, `astro -> render, sdk`,
     `apps/site -> astro, render, sdk, content`); final package names are fixed
     here and reused by 30B–30D;
   - ownership rules for block sources installed by the CLI, the generated block
     map file, and the site-local Lace configuration/lock file (Lace-managed with
     hash conflict detection, inside an otherwise user-owned site tree);
   - the rule that visual block markup is never published as a runtime package;
   - §13 SDK and typical Astro page examples rewritten for the new APIs;
   - the framework-selection model (registry and adapters keyed by framework,
     `astro` default, other frameworks reserved);
   - the starter/reference-site role split and the optional-starter project
     layouts (starter, existing site at a path, no site) from 30E.
3. Specify the public APIs that 30B–30D implement, at the level of names,
   inputs, outputs, error behavior, and server-only constraints, so proposals do
   not redesign them. Keep the exact field-level DTO and spec wording to the
   just-in-time OpenSpec changes.
4. Reconcile onboarding feedback §7 and the Step 31–33 cross-references (already
   updated on 2026-10-04) with any name or boundary fixed in this session.

### Session 30B — Framework-neutral loading and rendering core

**Completed:** 2026-10-04. `@lacecms/sdk` exports `createPublishedSiteLoader`
and `LacePublishedSiteError`; the new `@lacecms/render` package exports
`parseBlock`, `defineBlockMap`, `resolveBlock`, `prepareBlocks`, `BlockProps`,
`describeRichText`, and `LaceRenderError`, and joins the alpha release
allowlist. The boundary check keeps both packages framework-neutral. The sites
still use their local copies until 30C migrates them.

1. **Published-site loader in `@lacecms/sdk`.** Generalize `site-data.ts` into
   `createPublishedSiteLoader` (architecture §13.2) without framework imports:
   - input: explicit environment record or explicit `baseUrl`/`token`/public
     media origin, optional `fetch`, and `revalidate`;
   - static mode reads one build export per loader and resets after failure;
     revalidate mode issues ETag-conditional reads with one shared in-flight
     request, preserving the 29B dev behavior;
   - enforces `LACE_EXPECTED_PUBLISHED_VERSION` when present;
   - returns a typed published-site view: `byPath(path)`, `entries(modelKey)`,
     `bySlug(modelKey, slug)`, `mediaUrl(mediaId)`, and the export version, built
     from contract DTOs instead of local type copies. Entries expose required
     `published` content only; no draft-shaped field is surfaced;
   - rejects duplicate paths and duplicate slugs within a model; it trusts the
     CMS-resolved `path` and does not re-derive route patterns or hard-code
     model keys;
   - errors use `LacePublishedSiteError` codes (`missing_configuration`,
     `rejected_token`, `api_unavailable`, `version_mismatch`, `invalid_export`)
     with actionable but project-neutral text; callers may supply hints (the
     generated project names its commands).
2. **Framework-neutral render core package `@lacecms/render`** (architecture
   §13.3; depends only on `@lacecms/content`):
   - `parseBlock(definition, block, context)` over `validateBlockData` returns
     typed `BlockDataValues`, works for built-in and user `defineBlock`
     definitions, fails on block type or schema-version mismatch, and fails with
     model, entry, block key, and field path (`LaceRenderError`);
   - rich-text helpers reuse `validateRichTextDocument` and `isSafeUrl`
     exclusively; the site-local allowlist copies are deleted when 30C migrates
     both sites onto the adapter. `describeRichText`
     provides a neutral node/mark-to-element description (tag, safe attributes,
     children) so every adapter renders identical semantics and never emits raw
     HTML;
   - `defineBlockMap` keyed by block type plus `resolveBlock`, which fails on
     unknown types with model, entry, and block identifiers (current
     build-failure behavior preserved), the shared `BlockProps` type, and
     `prepareBlocks`, which resolves and parses an entry's blocks in order for
     adapters;
   - no dependency on any UI framework, Node-only API, or the SDK transport.
3. Tests: loader modes, ETag reuse, concurrent revalidation, expected-version
   mismatch, auth/transport failures, duplicate path/slug rejection; `parseBlock`
   for every built-in block, custom block, defaults, and invalid data; rich-text
   parity tests proving the render core accepts and rejects exactly what
   `@lacecms/content` does (including the drift cases above); dependency-direction
   check that the core imports no framework; boundary-script edges for
   `@lacecms/render`; and a type test that the contract block DTO satisfies the
   render core's block input.

### Session 30C — Astro adapter and starter migration

**Completed:** 2026-10-04. `@lacecms/astro` provides `createAstroSiteLoader`,
`LaceBlocks.astro`, and `RichText.astro` (with per-node/mark overrides) and
joins the alpha allowlist. `registry/` holds the five built-in `astro` items;
`lace.site.json` (`schemaVersion` 1: framework, components directory, block map
path and hash, items with revision and per-file hashes) and the generated block
map format are fixed for 30D. The starter (template `0.9.0`) and `apps/site`
use the adapter with byte-identical markup and a user-owned `src/env.d.ts` that
lets `tsc` read `.astro` imports; the site-local loader, rendering, and
rich-text copies are deleted. The reference fixture's invalid rich text
(text directly inside a blockquote, a document-level hard break) was corrected,
because the shared allowlist now rejects it. Parity, existing-site guide
(`docs/lace-astro-site.md` in generated projects), and packed-starter CI checks
(`pnpm acceptance:starter`) are in place.

1. **Astro adapter package `@lacecms/astro`** (architecture §13.4) containing
   only Astro-bound code:
   - `<LaceBlocks entry blocks mediaUrl>` dispatching through the block map and
     passing typed block props (`block`, parsed `data`, `context`, `mediaUrl`);
   - `<RichText document components?>` rendering the neutral element description,
     with optional overrides for individual node/mark components that receive
     validated props only;
   - Astro environment glue: the server-only `createAstroSiteLoader`, which
     receives `import.meta.env`/`process.env` from the site's `src/lib/lace.ts`,
     enables revalidation in `astro dev`, and never exposes `LACE_BUILD_TOKEN`
     to client bundles;
   - shipped as Astro component source with a peer dependency on the supported
     Astro range; no visual block components.
2. **Generated starter and reference site.** Rewrite `create-lace` template
   `site/` and `apps/site` on the adapter: delete `lib/rich-text.ts` and
   `lib/rendering.ts`, replace `site-data.ts` with `src/lib/lace.ts` and pages
   that use the loader view (`byPath("/")`, `entries("posts")`,
   `bySlug("posts", slug)`), replace `BlockRenderer.astro` with `<LaceBlocks>`
   plus the map file `src/lace/blocks.ts`, and rewrite the five visual blocks
   under `src/components/lace/` to consume parsed `BlockProps` data and
   `<RichText>` while keeping every existing `data-lace-*` hook and the generated
   markup. Create the canonical `registry/registry.json` and
   `registry/astro/<item>/` sources for the five blocks (architecture §13.5;
   30D adds the CLI that reads them), commit identical copies in the starter and
   `apps/site`, and record them in each site's `lace.site.json` as installed
   registry items.
3. **Role split between starter and `apps/site`.**
   - The starter in `create-lace` is the single source of what users receive:
     minimal pages (`home`, `posts`), layout, global styles, and registry blocks.
     It contains no tests, fixtures, or engine-development routes.
   - `apps/site` is the development playground and integration fixture: it may
     keep extra routes/models (`about`, `notes`), custom blocks, edge-case
     content, the published-export fixture, and build tests. Nothing from it is
     copied into generated projects.
   - Neither site keeps local copies of loader, parsing, or rich-text logic;
     both import packages and take block sources from the shared registry
     source. A test fails if starter, `apps/site`, and registry block sources
     diverge.
   - CI generates a project from the packed starter and builds it, in addition
     to building `apps/site`, so the shipped template is verified as a product
     rather than through the playground.
4. Bump the template version, update `TEMPLATE_FILES` ownership, generated
   README/operations, and upgrade instructions. Existing alpha projects receive
   explicit manual migration steps for their user-owned `site/**`; `lace upgrade`
   never rewrites them.
5. Write and verify the manual connection guide for an existing Astro site
   (CMS in a subdirectory per Step 29): install packages, configure env, create
   the loader file, render one page and one collection route, add blocks, and
   style through hooks. Verification uses a separate independent Astro fixture.
6. Tests: fixture build output for all five blocks unchanged apart from intended
   differences, safe rich text, unknown-block failure, dev revalidation,
   client-bundle secret scan, generated-project acceptance, block-source parity
   between starter, `apps/site`, and registry, and the existing-site guide
   fixture.

### Session 30D — Block registry and `lace add block`

**Completed:** 2026-10-04. `@lacecms/cli` bundles `registry/` into
`dist/registry/` at build time and provides `lace add block <type...>|--all`
with `--site` (default `site`), `--framework`, `--dry-run`, `--write-new`, and
`--json`. It reproduces the committed starter lock, map, and components byte for
byte, adopts identical untracked files, updates unmodified files to newer
revisions, preserves edits, reports conflicts with diffs (exit 2), prints the
exact block map lines for an edited map, blocks items whose block definition
version differs from `lace.config.ts`, prints the `pnpm --dir <site> add`
command for missing packages, and scaffolds configured custom blocks from the
recorded `definitions` module (`customBlocks` in `lace.site.json`). The upgrade
three-way decision is shared; block installation uses compare-and-swap writes
with `lace.site.json` as the commit record instead of a rollback journal. The
template is `0.10.0`; generated guides use the command.

1. **Registry format and delivery.** A versioned, framework-keyed registry
   bundled with `@lacecms/cli` (no network fetch). Each item declares block type,
   framework, block definition version, required adapter/core package ranges,
   files with their target role, and registry-item dependencies. Only `astro`
   items exist now; the schema and lookup accept other framework keys and return
   an explicit "framework not supported yet" error.
2. **Site-local configuration and lock.** On first use the CLI creates
   `lace.site.json` at the site root recording framework, component directory,
   map-file path, optional custom `definitions` module, and installed items with
   registry version and content hashes (architecture §§7 and 13.5). Framework is taken
   from the file, else `--framework`, else detected from the site's
   `package.json`, defaulting to `astro`. The site root is selected with
   `--site <dir>` (default: the generated `site/`), validated by locating the
   framework config; paths outside the site root are rejected.
3. **Command behavior** (`lace add block <type...>`, `--all`, `--dry-run`,
   `--json`, consistent with existing CLI error codes and output):
   - resolves the dependency closure, writes component files, and updates the
     generated block map file;
   - checks installed adapter/core versions against item ranges and prints the
     exact `pnpm add` command instead of editing `package.json`;
   - checks each built-in block's registry version against the project's
     `lace.config.ts` definition version and reports mismatches;
   - `--all` installs renderers for every block type the config uses and
     reports block types without renderers;
   - for a config-defined custom block absent from the registry, scaffolds a
     component typed with `BlockProps` from its `defineBlock` fields and the
     hook conventions, importing the definition from the recorded
     `definitions` module (never copying it).
4. **Repeated add and updates.** Unchanged installed files (hash match) are
   reported as current or updated to the newer registry version; modified files
   are never overwritten — the command reports a conflict, can show a diff, and
   can write a `.new` sibling on explicit request. The map file follows the same
   rule; on conflict the CLI prints the exact entries to add. Reuse the hash,
   conflict, and journal mechanisms from `lace upgrade` rather than a second
   implementation. Template upgrades and block updates stay separate commands.
5. Tests: fresh add into generated and independent Astro sites, dependency
   closure, `--all` and missing renderer reporting, custom block scaffold,
   idempotent re-add, update of unmodified files, conflict on modified component
   and map file, version-range and block-version mismatch, unsupported framework,
   path escape rejection, and a built site rendering the added blocks.

### Session 30E — Project creation with an optional starter

**Completed:** 2026-10-04. `create-lace` accepts `--starter`,
`--existing-site <path>`, and `--no-site` (mutually exclusive; `--no-site` with
`--cloudflare` is a usage error). Without a flag a terminal prompt defaults to
an existing site at `..` when the parent directory is an Astro project, otherwise
to the starter; without a terminal the starter is generated and the other flags
are named. Existing-site paths are validated (relative grammar, outside the
target, no symbolic links, Astro root) and never written. One template set is
rendered per mode through `lace-site` marker blocks and structured transforms of
the root `package.json` and `pnpm-workspace.yaml`; starter infrastructure bytes
are unchanged. The manifest records `site: { mode, path }` (template `0.11.0`);
`lace upgrade` rejects a template for another mode with the matching flags and
reads legacy manifests as starter; `lace doctor` adds a manifest-driven `site`
check. Snapshots cover default, Cloudflare, existing, existing-Cloudflare, and
no-site projects, and the `existing-site` acceptance phase generates `cms/`
inside the existing-site fixture, adds blocks with `lace add block --all --site
..`, and builds the parent site in CI.

1. **Site modes at creation.** `create-lace` supports three explicit modes
   (flag names fixed in the proposal):
   - *starter* — generates `site/` from the 30C starter (current behavior);
   - *existing site* — generates no `site/` and connects the CMS to an existing
     Astro site at a given relative path, typically the parent of a `cms/`
     subdirectory;
   - *no site* — generates the CMS only, for headless use or a site connected
     later; build dispatch reports that no build site is configured.
2. **Mode selection.** An explicit flag always wins. In an interactive terminal
   without a flag, the generator asks for the mode; if an Astro project
   (`astro.config.*` with an `astro` dependency) is detected near the target,
   the default answer is *existing site* with that path, otherwise *starter*.
   Without a TTY and without a flag, *starter* is used and the output names the
   flags for the other modes. `init .` keeps the empty-target rule in every mode;
   the existing site is never inside the generated target and is never modified
   by the generator.
3. **Parameterized managed files.** `pnpm-workspace.yaml`, root `package.json`
   site scripts (today hard-coded to `--dir site`), Compose
   `LACE_BUILD_SITE_DIR`/site mount, the Cloudflare workflow, README, and
   operations docs are rendered from the selected mode and path, reusing the
   Step 29 build-site configuration instead of a second mechanism. Paths are
   validated as relative, non-escaping where required, and free of secrets.
4. **Manifest, upgrade, and doctor.** `.lace/manifest.json` records the site mode
   (`starter`, `existing`, or `none`, architecture §7) and path. `lace upgrade` renders managed files for that mode, never creates or
   touches `site/` for non-starter projects, and keeps hash conflict detection.
   `lace doctor` checks the configured site (exists, Astro detected,
   `@lacecms/astro` and `@lacecms/render` present, `lace.site.json` and block
   map present) and does not expect `site/` when
   the mode says otherwise.
5. **Next steps.** For *existing site*, the generator output and README point to
   `lace add block --all --site <path>` and the 30C connection guide; for
   *no site*, to the same guide for later connection.
6. Tests: each mode non-interactively, interactive prompt defaults with and
   without a detected Astro project, invalid/escaping paths, managed-file
   snapshots per mode, upgrade from a 0.x starter project and from each mode,
   doctor per mode, and an end-to-end existing-site consumer (generate CMS into
   `cms/`, add blocks, publish, build the parent site).

### Acceptance

- Framework-neutral loading, block parsing, and rich-text safety come from
  packages; rich-text and URL rules have one implementation shared with the CMS.
- The Astro adapter contains only Astro-bound code and no visual block markup.
- The generated starter, `apps/site`, and an independent existing Astro site use
  the same APIs; the documented manual connection is verified.
- `lace add block` installs, registers, and updates block sources without
  silently overwriting user edits, and its registry/config model admits future
  React/Vue/Svelte variants without restructuring.
- The starter ships only what users own; `apps/site` remains an engine
  playground, and shared block sources cannot drift between them.
- A project can be created with the starter, against an existing Astro site, or
  without a site; upgrade and doctor respect the recorded mode.
- In-place CMS installation into nonempty projects remains deferred.

**Session boundary:** L; use 30A (documentation only), 30B, 30C, 30D, and 30E.

## Step 31 — Complete generated Cloudflare consumer onboarding

**Outcome:** the second supported runtime has a consumer installation path for
CMS Worker, D1/R2, admin, and the separate Astro deployment, beyond Pages-only
starter configuration.

**Basis:** the explicit Step 25 deferral and the current `--cloudflare` template,
which configures Pages but does not deliver full CMS Worker onboarding. Depends
on Steps 26–30 and the accepted Step 22 runtime; its generated starter uses the
Step 30 rendering core.

### Session 31A — Packaged Worker deployment and configuration

1. Define the generated consumer's versioned Worker entry/artifacts, statically
   imported project config, D1/R2 bindings, optional no-op/KV policy, admin assets,
   compatibility flags, and scheduled recovery without engine-source checkout.
2. Separate Worker CMS and Astro hosting configuration. Document local state,
   explicit local/remote migration and sync/bootstrap targets, secret provisioning,
   same-origin admin/API, and published build export/media origins.
3. Update template ownership, version, snapshots, and upgrade instructions. Keep
   remote account/resource provisioning and production mutations explicit; do
   not embed credentials or claim that Pages config deploys the CMS.
4. Verify a packed generated consumer bundles and starts its own Worker with
   persistent local D1/R2, admin assets, and project configuration.

### Session 31B — Cloudflare consumer journey and deployment handoff

1. Run setup through the new browser flow, login, content/media editing,
   publication, scheduled dispatch to a controlled deploy hook, and Astro build
   against that generated Worker's published export; prove draft isolation and
   secret exclusion without importing the source-workspace composition root.
2. Verify restart persistence, local doctor diagnostics, expired bootstrap,
   unavailable hook, and documented recovery. Preserve the distinction between
   a provider accepting a deploy hook and a confirmed successful static deploy.
3. Provide a concrete real-account deployment guide and prerequisites for the
   final release gate, including required account permissions, resource IDs,
   deployment secrets, and static-hosting/provider integration. Local tests do
   not count as real Cloudflare deployment acceptance.

Delivered as: `pnpm acceptance:cloudflare` drives the packed consumer through
local doctor, expired-token recovery, browser setup/editing/publication, a
controlled HTTPS deploy hook (unavailable, then accepted as `running`), the
Astro build from the Worker export, draft isolation, restart persistence and
secret exclusion; the generated guide (template `0.13.0`) documents that
journey and its recovery; `docs/cloudflare-deployment-handoff.md` is the
real-account procedure for Session 34C.

### Acceptance

- A generated Cloudflare consumer operates its CMS and builds its Astro site
  from versioned artifacts without the Lace engine checkout.
- Local Node and Worker share setup/security/content contracts; the real-account
  deployment verification remains explicit in Step 34.

**Session boundary:** M; use 31A and 31B.

## Step 32 — Feedback regression acceptance and next alpha preparation

**Outcome:** the onboarding improvements are proven together in independent
consumers and delivered in a coherent, upgrade-safe next alpha artifact set.

**Basis:** completed Step 25 acceptance and feedback §1–§10 and §12, with §7
covered by Step 30. Depends on Steps 26–31.

### Session 32A — Independent consumer regressions

1. Extend the existing generated-project acceptance, reusing its artifact
   isolation and secret scanning. Cover fresh Node setup from README, env prep,
   migration without manual mkdir, doctor, browser bootstrap, tour, publication,
   media, and dev/manual/automatic site visibility.
2. Add a separate existing-Astro consumer with CMS in a subdirectory and explicit
   build-site selection, created in the Step 30E existing-site mode. Follow the
   documented Step 30 connection guide and install blocks with `lace add block`; verify all five blocks, safe rich text,
   styling hooks, public media, and that user edits survive a block update.
3. Include the generated Cloudflare CMS journey from Step 31. Exercise expected
   setup-stage diagnostics, failure/retry, restart persistence, and upgrade from
   alpha template `0.4.0`, including changed managed files and preserved README.
4. Map every feedback item to a test/document or explicit decision/deferral.
   Keep §11 deferred and do not count unresolved defects as acceptance success.

Delivered as: `pnpm acceptance:generated` (phase `all`) is the feedback
regression suite. The Node consumer executes the generated README's setup
commands (drift fails), keeps the prepared credentials, migrates without
`mkdir`, creates the first administrator in the browser, completes and replays
the tour, uploads media and publishes before the Compose release, Pages preview
and dev/manual/automatic visibility journey (observe-only is refused). The
existing-Astro consumer writes its loader and routes from the generated guide,
verifies the Compose build-site mount, safe rich text (an unsafe link fails the
build), styling hooks, public media bytes and operator block edits across a
rerun and a simulated update. The Cloudflare consumer journey follows, then the
packed CLI upgrades the published template `0.4.0` default and Cloudflare
projects (`tests/fixtures/template-0.4.0/`): a modified managed file is refused,
user README/config/site bytes are preserved. `docs/archive/step-32/onboarding-feedback-acceptance.md`
maps §1–§12 to evidence, guarded by a test (§11 deferred, no open defects).

### Session 32B — Coherent artifact refresh and verification

1. Select an unused next alpha package/image version and a new template version
   from one reviewed revision; refresh package, generator, admin, Worker, and
   builder delivery plus upgrade instructions. Do not alter published
   `0.1.0-alpha.1` artifacts or assert an unverified registry version is free.
2. Prepare the matching artifact inventory and run consumer regressions against
   that exact set, including supported API/builder image platforms and generated
   Worker packaging. Verify archive/image contents and secret exclusion.
3. Reconcile README, operations, compatibility, alpha-release docs, and feedback
   statuses with actual completed behavior. Record evidence and remaining real
   deployment/security checks; registry publication is a separate explicit act.

Delivered as: candidate `0.1.0-alpha.2` (package, generator and API/builder
images), ownership template `0.14.0`, channel `next`, from clean revision
`75026e5`. `release/alpha.json` records `publishedVersions`, so preparation
refuses to reuse the published `0.1.0-alpha.1`; `release:check` also requires
the Dockerfile version defaults, versioned guide commands and the block
registry's package requirements to name the candidate (the registry still
required `0.1.0-alpha.1`, which `lace add block` would have reported as missing).
Template `0.14.0` upgrade instructions list the manual `.env` image and site
dependency steps. `pnpm acceptance:release --artifacts` now runs the complete
onboarding feedback suite with only the inventory's generator, archives and
image IDs after the 25C security/recovery/persistence journeys. The first
exact run exposed a defect: a host `lace` database command run while the
Compose API holds the SQLite file (on Docker Desktop/OrbStack, through a VM file
share without shared locks or WAL memory) left the dispatcher blind to later
publications, so no site build ran. The generated guides now require stopping
`api` and `dispatcher` around host database commands, and the acceptance
follows that rule; a product-level guard is later work. The complete
clean inventory (15 packages, API/builder on `linux/amd64` and `linux/arm64`)
passed preparation smokes, and the suite passed on `linux/arm64`; see
`docs/archive/step-32/step-32b-verification.md`. Nothing was published.

### Acceptance

- Fresh generated and independently integrated Astro consumers complete their
  documented flows using the exact compatible candidate artifacts.
- Upgrades preserve user source and detect modified managed infrastructure.
- The next alpha is ready for publication; stable MVP status still depends on
  Step 34, and remote publication/deployment is not a side effect of testing.

**Session boundary:** M; use 32A and 32B.

## Step 33 — Alpha.2 field-trial fixes and next alpha preparation

**Outcome:** the defects found while operating the published `0.1.0-alpha.2` in
an existing Astro project, Docker Compose dev/production, and a real Cloudflare
account are fixed and diagnosable, each supported scenario has its own guide,
and a coherent next alpha candidate carries the fixes.

**Basis:** [`lace-alpha-2-feedback.md`](./archive/step-33/lace-alpha-2-feedback.md) §1–§6 and
its general diagnostics requirement. Depends on Step 32 and the published
`0.1.0-alpha.2`. Preserves the fixed-command builder, single-site, atomic
release, server-only build credential, and protected user-source invariants.

Cross-cutting rule for every session: a known failure reaches the surface the
operator actually uses (CLI, editor, Builds) with a sanitized reason, a next
action, and the request or build ID. Never expose tokens, passwords, `.env`
contents, deploy-hook URLs, raw subprocess output, or full provider responses;
complete subprocess logs in the admin are not required.

### Session 33A — Block order on draft save

Completed 2026-10-05. Save and recovery JSON derive sparse positions from the
displayed order; safe ordering diagnostics preserve unsaved work. See
[`step-33a-block-order-acceptance.md`](./archive/step-33/step-33a-block-order-acceptance.md) for
the SQLite/D1, browser, export and Astro verification. Sessions 33C–33H remain.

1. Guarantee that the saved block list satisfies the domain ordering invariant
   after pointer and keyboard reordering, insertion or duplication in the
   middle, removal, and undo of removal, while keeping stable block `key`s and
   data. Settle in the proposal whether the editor derives positions from the
   current order at save time or maintains sparse gaps per mutation with the
   normalization described in architecture §9.5. The server keeps rejecting
   non-ascending positions; the domain must not silently reorder client input.
2. Make an ordering rejection (`CONTENT_INVALID_STATE`) identify the problem
   safely, such as the offending block index and key without content data, and
   have the editor show the reason and recovery while preserving unsaved work.
3. Cover position derivation with unit tests and the listed operations with
   Playwright through save, reload, and publish; verify the published export and
   Astro output keep the displayed order, plus an API negative test.

### Session 33B — Weak and strong build-export ETags

Completed 2026-10-05. Shared contracts and SDK accept strong and weak numeric
validators, both runtimes compare published versions, and standard loaders
revalidate through compression with default fetch. See
[`step-33b-build-export-etags-acceptance.md`](./archive/step-33/step-33b-build-export-etags-acceptance.md)
for contract, SDK, SQLite/D1 and gzip-proxy verification. Real Pages build
verification with default compression remains in 33H/34C.

1. Accept strong `"N"` and weak `W/"N"` version-derived validators in the shared
   contract and keep rejecting arbitrary or malformed values. Define how the SDK
   stores and returns the validator and how Node and Worker `If-None-Match`
   handling (weak comparison) produce `304` or `200`, including after a new
   publication changes `published_state.version`.
2. Make the standard Astro/published-site loaders work through Cloudflare
   response compression without a custom `fetch` override. Distinguish a
   missing from a malformed ETag in `LaceContractError`, and show a bounded safe
   received value, the expected format, and the next action, never the build
   token or export body.
3. Test strong, weak, missing, and malformed headers in contracts and the SDK,
   conditional reads against both runtime composition roots, `304` followed by a
   post-publication `200`, and dev revalidate mode behind a compressing proxy.
   A real Pages build with default compression is evidence for 33H/34C.

### Session 33C — Builder source policy and failure diagnostics

1. Decide the supported treatment of symbolic links in the selected source tree,
   for example excluding links the Astro build does not need, such as a
   repository-root `CLAUDE.md -> AGENTS.md`, or rejecting them with the named
   relative path. Never follow links outside the source root or copy their
   targets. Update the fixed-command builder ADR/spec when the policy changes.
2. Carry a specific sanitized reason and source-relative path from the builder
   through its authenticated response, the dispatcher, `site_builds.error`, the
   admin build DTO, and the Builds screen. `provider_failed` stays a fallback
   for unknown failures only. Define the closed reason vocabulary and DTO delta
   in the proposal; never expose host or container absolute paths.
3. Test a service link at the workspace root, a link inside the site source, a
   link escaping the root, an unreadable entry, and missing required files.
   Each failure keeps the previous release, gives a concrete correction, and is
   retryable afterwards; verify with a packed Compose production consumer in
   existing-site layout.

Session 33C completed on 2026-10-05 via
`step-33c-builder-source-diagnostics`: exact root service-document exclusions,
closed reason/safe-path diagnostics through builder, dispatch, SQLite/D1, REST
and Builds, plus correction/retry guidance. Packed existing-site Compose
acceptance verified all source fault cases, unchanged releases and successful
browser retries; see [acceptance evidence](./archive/step-33/step-33c-builder-source-diagnostics-acceptance.md).
Sessions 33D–33H remain.

### Session 33D — Truthful site-build outcome model

Decided on 2026-10-05: `site_builds.status` stays one enum with seven values.
`succeeded` requires proof that the site was published.

| Status | Meaning | Terminal |
| --- | --- | :---: |
| `pending` | Queued: debounce, waiting for a retry, not yet claimed | no |
| `running` | Lace is executing the build (VPS builder, hook call) or tracking an accepted provider deployment | no |
| `accepted` | The provider accepted the request; its outcome is not tracked | yes |
| `succeeded` | Publication proven: the VPS release switched, or the Pages deploy stage succeeded | yes |
| `failed` | Proven failure: attempts exhausted, builder failure, Pages build or deploy failure | yes |
| `cancelled` | The provider cancelled or skipped the deployment; the reason says which | yes |
| `unknown` | Tracking stopped without proof: deadline expired, deployment not found, or no read permission | yes |

Transitions: `pending → running` when the dispatcher claims the build, on every
runtime; `running → pending` with a safe error for a retryable failure;
`running → succeeded/failed` for the VPS builder; `running → accepted` for a hook
response without an ID or without configured tracking; `running` stays while
33E tracks a deployment ID, then ends in `succeeded`, `failed`, `cancelled`, or
`unknown`. A successful hook response without an ID never becomes `succeeded`.
Admin retry is allowed from `failed`, `cancelled`, `unknown`, and `accepted`.
The site's current version is the highest `target_version` among `succeeded`
builds. Late provider results do not reopen `unknown`.

1. Update architecture §9.8 and the site-build specs before code with this model.
   Mark VPS builds `running` at claim. A build whose process terminated is reclaimed
   after its lease expires through a guarded `running → running` update, so no row
   stays orphaned. Settle the SQLite/D1 migration, the provider stage and
   last-check fields needed by 33E, and the DTO/admin compatibility in the proposal.
2. Migrate existing rows. In D1, `running` rows and `succeeded` rows without
   `provider_build_id` come from deploy hooks and become `accepted`. In SQLite,
   `succeeded` comes from the builder and stays. Keep coalescing, retries,
   leases, and timeouts unchanged.
3. Next to each build status in Builds and the entry publication details, add an
   info button that opens the existing design-system `Popover` (not a hover-only
   tooltip). It shows what the status means, what it proves about the public
   site, and the next action. Descriptions come from one shared status map and
   stay consistent with the tour and the generated guides. The control has an
   accessible name and works with keyboard, screen readers, touch, and narrow
   layouts; the build-specific safe reason from 33C stays visible beside it.
   Never claim a deployed site from provider acceptance.
4. Cover Node and D1 repository contracts (transitions, guarded reclaim,
   migration), the dispatcher on both runtimes, and the admin with unit,
   Playwright, and axe checks for every status and its popover.

Session 33D completed on 2026-10-06 via `step-33d-truthful-site-build-outcomes`:
the seven-status enum, claim-time `running` with guarded reclaim, deploy-hook
acceptance recorded as `accepted`, retry from every retryable terminal status,
and migration `0003_site_build_outcomes` (tracking fields, D1-only
reclassification of unproven hook outcomes). The application port already
distinguishes a `tracking` trigger result and offers exact, idempotent
`completeTrackedSiteBuild`; 33E adds the Pages adapter and poller on top of
them. Builds, entry publication details, the tour and the generated operations
guide share one status map with keyboard/touch popovers. Sessions 33E–33H remain.

### Session 33E — Cloudflare Pages deployment tracking

1. Add optional Pages tracking to the scheduled Worker. With an account ID,
   project name, and a separate Worker secret limited to Pages read access, poll
   the exact deployment identified by the stored `providerBuildId`. Do not reuse
   the D1 operator token; installations without tracking settings record
   `accepted` from 33D.
2. Report `succeeded` only after the deploy stage succeeds. Map build or deploy
   failure to `failed`, cancellation or skip to `cancelled`, and `401`/`403`,
   a missing deployment, or an expired deadline to `unknown` with the next
   action. Record the stage, last-check time, and a safe deployment reference.
   Keep tracking state in `site_builds`, not in the outbox retry budget. Each
   cron run selects a bounded number of due `running` rows, backs off on
   transient `5xx`/`429`/network errors, and survives Worker restarts. Guarded
   updates (`status = 'running'` and the same `provider_build_id`) make
   checks idempotent and never change another build's record. Settle the
   default deadline in the proposal.
3. Never persist or display the hook URL, API token, or full Pages API response,
   which can contain environment settings. Test against a controlled Pages API
   stub: success, Astro build failure, deploy failure, cancel/skip, transient
   outage, insufficient permission, parallel builds and late results, restart
   recovery, and a hook without an ID. Decide in the proposal whether an
   authenticated CI callback for generic hooks is in scope or deferred.

Session 33E completed on 2026-10-06 via `step-33e-pages-deployment-tracking`:
optional Pages tracking (`LACE_PAGES_ACCOUNT_ID`, `LACE_PAGES_PROJECT_NAME`, the
Pages-Read-only secret `LACE_PAGES_API_TOKEN`) makes identified hook acceptances
`tracking`; the scheduled Worker checks at most five due builds per run through
a 60-second check lease in `site_builds`, maps the exact deployment's latest
stage to `succeeded` (deploy success only), `failed`, `cancelled` or `unknown`
with closed reasons, backs off transient errors from 30 s to 10 min, and ends
every tracked build by an overall deadline (`LACE_PAGES_TRACKING_TIMEOUT_MINUTES`,
default 60, 5–1440) or as `tracking_unconfigured` when tracking is removed.
Builds shows the stage, last check and next action; no migration was needed.
An authenticated CI callback for generic hooks is deferred. Sessions 33F–33H remain.

### Session 33F — Explicit Cloudflare CLI credentials

1. Make the credential choice explicit in generated Cloudflare projects: either
   one API token with documented permissions, or a D1-scoped Lace operator token
   plus Wrangler OAuth for deploy and secret commands. Keep Lace remote-command
   credentials out of files Wrangler loads implicitly (`.env`, `.env.local`),
   for example in a dedicated private env file that Lace commands load
   explicitly; settle its name, loading, ownership, and ignore rules in the
   proposal.
2. Add a read-only preflight, such as an extended Cloudflare `lace doctor`
   target, that reports the active authentication source and selected account
   without printing secrets and explains insufficient permissions with a next
   action before remote migrate/sync/bootstrap or deploy. Remote targets still
   require explicit selection.
3. Explain `LACE_AUTH_SECRET`, the Cloudflare API token, and Wrangler OAuth, and
   which settings are local versus Worker secrets. Test login → D1-only operator
   token → remote migrate/sync → deploy with the token in the shell, `.env`, and
   `.env.local`; documentation must not recommend a workaround that reloads the
   same token. Provide upgrade guidance for alpha.2 projects that already store
   the token in `.env`.

33F delivered 2026-10-06: explicit private credentials, read-only credential
preflight, template `0.15.0`, packed credential/Worker checks and ownership-safe
0.14.0 upgrades. Evidence and the prerequisite contract for 33G are in
`docs/archive/step-33/step-33f-verification.md`. Real-account OAuth/deploy remains
unverified; no artifacts were published.

### Session 33G — Scenario guides and minimum-version policy

1. Replace the mixed generated CMS README with a short entry README
   (requirements, CMS/site layout, links) and separate guides for Docker Compose
   dev, Docker Compose production, and Cloudflare (local, then real account).
   Each guide states the working directory, prerequisites, expected result, next
   step, one-time versus repeat actions, CMS Worker versus static site, and local
   versus remote data. Keep `lace-astro-site.md` and `lace-operations.md` as
   linked references. Describe the behavior delivered in 33A–33F; label any
   remaining workaround as such.
2. Remove the `<25`/`<13` upper bounds from Node and pnpm `engines`
   consistently across generator templates, published package manifests, the
   repository root, compatibility/handoff/generated docs, and doctor checks and
   tests, while enforcing the minimums (`>=24.12.0`, `>=12`). Confirm the actual
   requirements of the engine and published packages first. Separate minimum
   requirements from versions pinned for CI, Docker images, lockfiles, and
   `packageManager`, and describe how newer majors enter the compatibility
   matrix.
3. Bump the template version and update ownership and snapshots. Upgrades keep
   the user-owned README byte-for-byte and explain how to reach the new guides;
   managed operations documentation changes through conflict detection; an
   existing site's root README is never rewritten, only offered links. Verify
   fresh generation, existing-site mode, and upgrade from template `0.14.0`.

33G delivered 2026-10-06: a short generated README index, managed Compose
development/production and Cloudflare scenario guides, minimum-only engines
(Node `>=24.12.0`, pnpm `>=12`) with unchanged reproducibility pins, template
`0.16.0` and ownership-safe 0.14.0 upgrades. Evidence is in
`docs/archive/step-33/step-33g-verification.md`. Real-server and real-account
runs remain unverified; no artifacts were published. Session 33H remains.

### Session 33H — Field-trial regressions and next alpha candidate

1. Record `0.1.0-alpha.2` as published in `release/alpha.json`,
   `compatibility.md`, and `alpha-release.md`, then select the next unused alpha
   version and a new template version from one reviewed revision; refresh
   packages, generator, admin, Worker, builder/API images, and upgrade
   instructions without altering published artifacts.
2. Extend the exact-artifact suite to the field-trial regressions in packed
   consumers: block reorder through publication, builder source diagnostics in
   Compose production with an existing site, weak ETag through a compressing
   proxy, credential separation, Pages tracking against a stub, the new guides'
   command sequences (drift fails), and upgrade from alpha.2 template `0.14.0`.
3. Map every alpha.2 feedback item to tests, documentation, or an explicit
   decision in an acceptance record guarded by a test, like
   `docs/archive/step-32/onboarding-feedback-acceptance.md`. Real-account re-verification of §3–§5
   is input to 34C rather than a local-test claim; registry publication remains
   a separate explicit act.

### Acceptance

- Reordered, inserted, duplicated, and restored blocks save and publish in the
  displayed order; ordering rejections are explained without losing edits.
- The standard Astro loader builds on Cloudflare Pages with strong or weak
  ETags, and conditional reads are correct on both runtimes.
- A failed build shows a safe cause and next action in the admin, and the
  previous static release remains served.
- Builds show neither `succeeded` without deployment proof nor endless
  `running`; tracked Pages deployments reach their correct terminal state, and
  every status explains itself through an accessible info popover.
- The documented Cloudflare onboarding completes without an unexpected
  authentication switch, and remote commands target an explicitly chosen account.
- Each scenario can be followed from its own guide; generated `engines` declare
  minimums only.
- The next alpha candidate passes the exact-artifact suite, and nothing is
  published as a side effect of testing.

**Session boundary:** L; use 33A–33H. Keep 33D (status model and migration) and
33E (runtime adapter and new secret) separate. Implement 33G after 33A–33F so
the guides describe fixed behavior, and 33H last.

## Step 34 — MVP release gate

**Outcome:** both supported deployments satisfy the product flow, security
requirements, and operational recovery promises.

**Basis:** the final candidate from Step 33. The owner's alpha.2 field trial is
early evidence, not a substitute for the checks below.

### Session 34A — Cross-runtime and browser suite

1. Run repository contracts against Node SQLite and local D1.
2. Run API contracts against Node and Worker composition roots using the same
   seeded data and expected response fixtures.
3. Complete Playwright scenarios for admin, editor, viewer, conflict, media,
   publish/build failure, and session expiry.
4. Build the Astro fixture from both runtime exports and compare canonical output
   data, routes, and media references.
5. Decide before the stable contract freeze whether public entries keep reusing
   the content-entry schema (optional `published`, mirrored `draft`) or move to
   a dedicated published-only public schema; Step 30 deliberately hides this
   behind the SDK published-site loader (`createPublishedSiteLoader`). Any change
   updates contracts, SDK, render core (`@lacecms/render`), and
   the public API specs together.

### Session 34B — Security and resilience pass

1. Review auth/session configuration, CSRF/origin behavior, permission checks,
   rate limits, upload parsing, URL/rich-text sanitization, token hashing, secret
   redaction, and arbitrary-command/path resistance.
   Include the Step 32B findings: the Node request rate limiter keys clients on
   the first, client-controlled `X-Forwarded-For` value; Better Auth's sign-in
   limiter falls back to one shared bucket without a trusted client-IP header;
   and host database commands are only documented, not guarded, against a
   running Compose API on VM-backed Docker hosts.
2. Fault-inject DB, object storage, deploy hook, builder, and process termination.
   Confirm retry, lease expiry, previous-release preservation, and admin status.
3. Test D1 query/parameter budgets at maximum block count and build-export size.
4. Audit dependency vulnerabilities and licenses; document accepted risks rather
   than silently suppressing them.

### Session 34C — Operations and release documentation

The generated Cloudflare onboarding from Step 31 and the exact candidate
artifacts from Step 33 are prerequisites. Follow `docs/cloudflare-deployment-handoff.md` for
the Cloudflare deployment and its evidence. Verify real VPS and Cloudflare
installations, including the separate public-site deployment and publish/build
path, and record the tested versions and provider outcomes. Local simulation
alone does not satisfy deployment acceptance; missing account access is an
explicit blocker rather than a passed check.

1. Write local development, generated-project, VPS deployment, Cloudflare
   deployment, backup/restore, migration, key rotation, build recovery, and
   troubleshooting guides.
2. Document health/readiness semantics and structured log fields. Add an
   operator checklist for migration/config hashes, object storage, latest build,
   and engine version.
3. Verify a backup/restore drill for SQLite + MinIO and D1 + R2 metadata/object
   coordination. State the consistency caveat and recommended maintenance window.
4. Produce an MVP traceability checklist mapping every “Included” product scope
   item and security requirement to tests and documentation.

### Final acceptance scenario

From a clean machine/project template:

1. Generate a Lace site with one command.
2. Start either Node/Docker or Cloudflare-local mode.
3. Migrate, sync config, and bootstrap the first admin.
4. Sign in, create/edit structured content, upload/reuse media, and reorder blocks.
5. Confirm an editor cannot publish and an admin can.
6. Confirm the public API and Astro site show the published snapshot only.
7. Edit the draft again and confirm public output is unchanged.
8. Observe a coalesced build, simulate failure, recover it, and serve the last
   successful static release throughout.
9. Run an upgrade dry-run and prove user-owned site source is untouched.
   Update an installed block with `lace add block` and prove an edited block is
   reported as a conflict instead of overwritten.

**Session boundary:** L; use 34A, 34B, and 34C. Do not combine the security pass
with the release-documentation session.

## 7. Recommended first delivery slices

The full roadmap is intentionally larger than a single development session. The
best checkpoints for demonstrating useful progress are:

1. **After step 3:** typed config and block definitions normalize identically in
   Node and a Worker-compatible build.
2. **After step 5:** a complete content lifecycle works against real SQLite
   without HTTP.
3. **After step 8:** the secured Node REST vertical slice supports bootstrap,
   draft, publish, and public read.
4. **After step 10:** the first end-to-end headless CMS path builds a static Astro
   site.
5. **After step 12:** the browser editor works for already synchronized models
   on Node; the clean-checkout content workflow is completed in later steps.
6. **After step 12.5:** both browser applications start locally, but content
   models and live site data still need the next steps.
7. **After step 13:** code-first models can be synchronized and edited in the
   local admin.
8. **After step 14:** published content reaches the local Astro site.
9. **After step 15:** the local editorial workflow covers content, media,
   users, and settings without fixture edits or direct content API calls.
10. **After step 20:** the admin runs on its owned design system and layered
    structure, with a visual media library and a readable block editor.
11. **After step 21:** the self-hosted VPS deployment works with the reference
    site, including recoverable builds and build history in the admin; generated
    projects are verified in Step 23.
12. **After step 21.5:** site owners can style blocks through stable selectors
    in the reference Astro output without editing renderers.
13. **After step 22:** Cloudflare reaches behavioral parity.
14. **After step 23:** generated projects and full operational CLI commands pass
    acceptance on the supported runtimes.
15. **After step 25:** verified alpha artifacts are ready for publication and
    independent local consumer testing; stable-MVP acceptance remains open.
16. **After step 27:** a consumer can prepare and diagnose a fresh installation
    from its generated README.
17. **After step 28:** browser bootstrap and a permission-aware tour complete
    the first-login experience.
18. **After step 29:** the intended Astro site is built and publication guidance
    matches verified dev/manual/automatic behavior.
19. **After step 30:** sites load and render content through the shared core
    and Astro adapter, `lace add block` installs and updates user-owned block
    sources without overwriting edits, and projects can start without the
    starter.
20. **After step 31:** complete generated Cloudflare CMS onboarding passes local
    consumer acceptance and has a real-deployment handoff.
21. **After step 32:** the feedback improvements pass together against the next
    compatible alpha artifact set, ready for explicit publication. Completed
    2026-10-04 with candidate `0.1.0-alpha.2` (template `0.14.0`).
22. **After step 33:** the alpha.2 field-trial defects are fixed, each
    deployment scenario has its own guide, and the next compatible alpha
    candidate is ready for explicit publication.
23. **After step 34:** the MVP is release-ready.

Steps 0–3 should be implemented in order. After step 5, SDK fixture work and
some admin visual-foundation work may proceed in parallel, but persistence,
contracts, and auth remain the authoritative critical path. Cloudflare adapter
work should not start before the Node repository contract suite exists; otherwise
the two runtimes can drift without a shared behavioral oracle.
