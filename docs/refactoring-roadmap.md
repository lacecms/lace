# Lace Refactoring Roadmap

> Selected 2026-11-01 after the site migration roadmap was merged
> ([lacecms/lace#63](https://github.com/lacecms/lace/pull/63)). Motivated by
> an architecture and maintainability audit of the whole workspace. Every
> step preserves product behavior; the goal is a codebase that stays cheap to
> change before the first non-alpha release.

Future work outside this roadmap stays in the root [backlog](../backlog.md).

## 1. Purpose and source of truth

This roadmap records the owner's selection, the delivery order, the session
boundaries and a compact description of what each step changes and how.
Detailed tasks are written later, one just-in-time OpenSpec change per
session.

Authority follows `AGENTS.md`:

1. [`mvp-architecture.md`](mvp-architecture.md) owns product scope and
   invariants.
2. [`openspec/specs/**`](../openspec/specs) owns accepted capability behavior.
3. The selected active OpenSpec change owns the proposed delta.
4. This document owns delivery order, session boundaries and recorded
   decisions for this roadmap.

Steps that change an architecture invariant list the sections to update. The
architecture is updated in the same OpenSpec change, before code, with a short
ADR under [`docs/adr/`](adr).

## 2. How to use this roadmap

The conventions of the archived
[site migration roadmap](archive/site-migration-roadmap.md) apply, with the
additions below:

- A **session unit** is one cohesive change set that can be implemented,
  reviewed and verified independently. It maps to one OpenSpec change.
- Size labels: **S** one session, **M** two sessions, **L** three or more.
- OpenSpec change names use the prefix `rf<step><session>-`, for example
  `rf02a-source-tests-pure-packages` or `rf04d-server-route-modules`.
- **Behavior-preserving changes** (pure moves, splits, deduplication) create
  an OpenSpec change with `proposal.md`, `design.md` and `tasks.md` but no
  delta specs. Their verification gate is: the existing test files pass with
  only import paths changed, public package exports are byte-identical
  (`pnpm build` then compare `dist/index.d.ts` export lists), and
  `pnpm spec:validate` stays green.
- **Behavior-touching changes** (RF3 and the parts of RF5 that align runtime
  semantics) carry delta specs like any product change and follow the
  completion rules unchanged: runtime validation, types and negative tests;
  Node SQLite and D1 parity with repository contract tests; the narrowest
  relevant tests, then root typecheck, Oxlint, Oxfmt check and strict
  OpenSpec validation; documentation in the same change.
- Each session ends by moving a row of the baseline table in §3 to its new
  value in the progress log, so the effect of the work is measurable.
- "Open questions" in a step are settled with the owner while writing that
  step's specification, not before.

Status values: `planned`, `proposed`, `in progress`, `done` (archived).

### Owner-requested RC1 release checkpoint (2026-11-01)

The owner selected `0.1.0-rc1` on `next`, including every committed change after
published alpha.8 through the reviewed shipping source. OpenSpec change
`prepare-rc1-release` covers coherent coordinates, fresh acceptance and a handoff for owner-operated
npm/GHCR/GitHub publication. The owner clarified that they will publish themselves;
obsolete alpha.7 upgrade fixtures stay until a separate verified post-release
follow-up.
This release follows completed SM1–SM5 and RF1A/RF1B. Pending RF2–RF8 sessions
retain their order and are neither included nor prerequisites for rc1. Publication
and real deployment verification remain distinct; RC naming is not stable-release
approval. Post-release test cleanup uses a commit after the artifact source.

## 3. Baseline (commit `1494b039`, audit of 2026-11-01)

What is healthy and is not touched:

- Package boundaries are enforced, not assumed: `scripts/check-boundaries.mjs`
  checks dependency direction, admin layer order, cross-slice imports and
  folder completeness. No upward import exists in non-test admin code.
- REST error mapping is in one place (`app.onError` → `classifyError`), the
  status set is closed, validation is uniform.
- Admin server state is TanStack Query only; no raw `fetch` outside
  `shared/api`; `errorDescription` is used for every error; no `any`, no
  lint-disable comments, no `@ts-ignore`; 185 of 204 admin modules have a
  same-name test.
- `sdk` / `render` / `astro` are small, single-purpose and drift-guarded by
  `tests/block-sources.test.mjs`.
- Composition is a single `createNodeRuntime` and a single
  `createCloudflareRuntime`.

What the roadmap changes, with the numbers to beat:

| Area | Measure | Baseline |
| --- | --- | --- |
| Test loop | package test files importing `../dist/` | 112 of 119 `.test.mjs` → RF2C: 0 source tests; built checks are explicit `*.packaged.test.mjs` |
| Test loop | `turbo.json` `test.dependsOn` | `["build", "^build"]` → RF2C: `[]` for all 22 source tasks |
| Test loop | workspace members with a `test:watch` script | 0 → RF2C: 20 |
| Size | shared repository contract layout | 9,400-line monolith → RF2C: eight area modules + shared helpers, 33-line index; all 105 measured registrations pinned in order |
| Size | server route test layout | 3,966-line `app.test.mjs` → RF2B: route companions and shared harness; `app.test.ts` is 153 lines |
| Size | `packages/content/src/index.ts` | 3,691 lines, eight responsibilities |
| Size | `packages/contracts/src/index.ts` | 3,014 lines |
| Size | `packages/server/src/app.ts` (`createLaceApp`) | 2,948 lines (73 routes in one function) |
| Size | `packages/platform-cloudflare/src/d1-content-repository.ts` | 2,696 lines |
| Size | `packages/platform-node/src/content-repository.ts` | 2,291 lines |
| Size | `packages/db/src/sql-content.ts` | 2,229 lines |
| Size | `packages/application/src/configuration-sync.ts` | 1,836 lines; five-file cluster of 3,733 lines with type-only cycles |
| Size | `apps/admin/src/entities/content/FieldRenderer/FieldRenderer.tsx` | 1,508 lines (`ListNode` alone ≈ 580) |
| Size | `apps/admin/src/shared/api/admin-client.ts` | 1,043 lines, 59 methods, 53 literal paths, no route drift test |
| Duplication | copies of the "list-queryable field types" set | 5 (config, contracts ×2, application, db) plus 5 admin switches |
| Duplication | `*Source` interfaces in contracts mirroring application types | 11 |
| Duplication | slug/route canonicalization | twice (config and domain) |
| Duplication | conditional-visibility evaluators | 3 (content, application, admin) |
| Duplication | error conventions | 4 (content, domain, config, application); MCP maps application errors to 500 |
| Duplication | Node vs D1 content repository | 54 identical public methods; read side ≈ 25% verbatim |
| Duplication | security row mappers and SQL constants | verbatim in `platform-node/security.ts` and `platform-cloudflare/d1-security.ts` |
| Duplication | argv parsers in `packages/cli` | 6 (+1 in `scripts/cloudflare-lib.mjs`) |
| Admin | one-line `index.ts` barrels | 176 of 196 |
| Admin | components under 60 lines occupying a three-file folder | 40 |
| CLI | runtime dependencies on the `--target node` path | `miniflare` + `workerd` loaded statically through `commands.ts` |
| Scripts | `scripts/*.mjs` | 52 files, 13.7k lines; 31 of 55 root scripts undocumented |
| Scripts | alpha-numbered or roadmap-step-numbered entrypoints | three release-named journey modules, one step-named security module and three step-named verification commands |
| Docs | `docs/mvp-architecture.md` | 3,696 lines; change codes (CE/SM/LIST/MCP) in headings and prose |
| Docs | Obsolete step verification records | Audit: 48 files, 952 KB → RF1B: 0 retained |
| Docs | verification documents | 5 → RF1B: 1 (`docs/verification.md`) |
| Docs | indexed Markdown files | RF1B: 45 documents + 2 indexes; 18 ADRs |
| Specs | `openspec/specs` | 84 capabilities, 22.7k lines, no index; `admin-draft-editor` 2,154 lines |
| Specs | stale unapplied change | `openspec/changes/video-a-media-upload-delivery` (0 of 20 tasks; fails `spec:validate` strict) |

## 4. Delivery overview

| Step | Topic | Size | Sessions | Status |
| --- | --- | :---: | --- | --- |
| RF1 | Workspace hygiene | M | RF1A → RF1B | done |
| RF2 | Tests against source | L | RF2A → RF2B → RF2C | done |
| RF3 | Shared vocabulary: types, constants, rules | L | RF3A → RF3B → RF3C → RF3D | planned |
| RF4 | Module splits | L | RF4A → RF4B → RF4C → RF4D → RF4E | planned |
| RF5 | Runtime deduplication | L | RF5A → RF5B → RF5C | planned |
| RF6 | Admin editor structure | L | RF6A → RF6B → RF6C → RF6D | planned |
| RF7 | CLI and developer scripts | M | RF7A → RF7B | planned |
| RF8 | Documentation | L | RF8A → RF8B → RF8C | planned |

**Order rationale:** RF1 first because deleting obsolete scripts and tests
shrinks everything that follows (fewer `.test.mjs` files to convert, fewer
docs to re-index). RF2 second because every later step is a sequence of small
moves verified by tests, and today each test run rebuilds the dependency chain.
RF3 precedes RF4 so that the file splits move one definition, not five copies.
RF5 follows RF4 because the shared reader lands in a `db` package that has
already been split by resource. RF6 and RF7 touch disjoint files from RF3–RF5
and may run in parallel sessions with them. RF8 is last because §15 and §16 of
the architecture describe ports and runtime deltas that RF4 and RF5 change.

**Deferred, stays in the backlog:** write-path convergence between Node
transactions and D1 batches beyond statement builders; a generated admin API
client; a `LaceVideo` shared primitive; pruning `openspec/changes/archive`
(archives stay complete).

## 5. Owner decisions (2026-11-01)

1. Remove duplicated code, and above all duplicated types and constants, so
   that each rule has one definition that every layer imports.
2. Split every source file above roughly 2,000 lines into modules or services
   with one responsibility each; public package exports do not change.
3. Put both the technical documentation (`docs/`, `openspec/`) and the user
   documentation (`apps/docs`) in order.
4. The application has one user and no non-alpha release yet. Files and
   scripts that only served earlier alpha versions are deleted, not kept
   "just in case". Git history is the record. What stays: the OpenSpec spec
   and change archive, archived roadmaps and ADRs.
5. Behavior-preserving work needs no delta specs (§2); behavior-touching work
   keeps the full OpenSpec gate.

Proposed, to confirm when writing the first specification:

6. Tests move to source (RF2) before the large splits, even though the owner's
   first concern was file size.
7. Decided 2026-11-01 while writing RF1A: only the latest published
   template's fixtures (`0.35.0`) are kept as the upgrade origin.

## Step RF1 — Workspace hygiene

**Size:** M (two sessions). **Prerequisite:** none.

**What:** the repository contains only files that serve the current product
or its history. Scripts have current names and one catalog.

### Session RF1A — Scripts, root tests and stale change

- Delete the milestone-1 placeholder integration command and its script,
  which only prints an unavailable-feature message and fails.
- Release-named journey modules are renamed by what they verify, not
  deleted: `scripts/alpha-six-acceptance.mjs`, `alpha-seven-acceptance.mjs`,
  `alpha-eight-acceptance.mjs` and `consumer-34b-security.mjs` are the
  current exact-artifact acceptance journeys that the accepted specs require
  by behavior (contracts and media, GIF/proxy caching, list settings/MCP/TLS,
  security probes); they move to `scripts/journeys/` and their stage names,
  receipt labels and log prefixes lose alpha and step numbers.
- Feedback traceability maps are retired: `tests/feedback-map.mjs`,
  `tests/onboarding-feedback-acceptance.test.mjs` and
  `tests/alpha-2-feedback-acceptance.test.mjs` are deleted with their two
  requirements; `tests/field-trial-acceptance.test.mjs` (helper unit tests)
  is renamed `acceptance-helpers.test.mjs`.
- Rename roadmap-step-numbered entrypoints to what they verify:
  `verify:cross-runtime`, `verify:security` and `verify:operations`;
  verification environment variables use `LACE_VERIFY_*` and result directories
  use `.lace-acceptance/verify-*`. The five root
  `vitest.<name>.config.mjs` files collapse into one
  `vitest.verification.config.mjs` with named `projects` (not a root
  `vitest.config.mjs`, which `pnpm test` would pick up).
- Template upgrade fixtures: only `tests/fixtures/template-0.35.0` (the
  latest published template, alpha.7) stays, with a generic fixture-integrity
  test; `0.4.0`, `0.14.0`, `0.30.0` and their tests are deleted and the
  acceptance specs' alpha.1/alpha.2 upgrade proofs are withdrawn (owner
  decision, 2026-11-01).
- Move `openspec/changes/video-a-media-upload-delivery` (0 of 20 tasks,
  superseded by the embed-first decision, fails strict validation) to
  `openspec/changes/archive/2026-11-01-video-a-media-upload-delivery-superseded`
  with a one-paragraph note; `pnpm spec:validate` passes again.
- Add `packages/platform-node/lace.sqlite` (local database) to `.gitignore`.
- `DEVELOPMENT.md` gains a "Script catalog" table: every root script, its
  group (dev, verification, acceptance, release, docs), when to run it and the
  file it runs. `scripts/make-api-runtime.mjs` stays (used by
  `apps/api/Dockerfile`) and is listed.

**Acceptance:** `pnpm lint`, `pnpm test`, `pnpm spec:validate` pass;
`pnpm acceptance:starter` passes with the merged journey; no root script
points at a deleted file (a root test asserts every `package.json` script
target exists).

**Open questions:** whether `scripts/fixtures/oauth-mcp` compatibility
tests stay a root script or move into `packages/auth` (not decided in
RF1A; they stay).

### Session RF1B — Documentation pruning and index

- Obsolete per-step verification reports and JSON inventories are removed;
  `docs/archive/` retains the three completed roadmaps and implementation
  roadmap summary. Their former records remain accessible through Git history
  identified in the internal documentation index.
- [Verification](verification.md) consolidates the five former verification
  documents into commands and prerequisites, limits, §3/§14 coverage, recorded
  D1 budgets, and real-infrastructure owner checks with dated status. Individual
  run results stay in their result directories; release readiness stays in
  archived changes. Links from maintained and archived documents point at the
  consolidation or the relevant archived change. The root link guard covers
  relative Markdown links, reference links, document status rows and ADR rows.
- Add `docs/README.md`: one line per file with its status (authoritative,
  internal note, historical) and owner section of the architecture it
  details. Add `docs/adr/README.md` listing ADRs by number and status.
- Update `AGENTS.md` "Sources of truth" and `README.md` links accordingly.

**Acceptance:** no dangling relative link in `docs/**` and root Markdown (a
root test walks Markdown links); `DEVELOPMENT.md` and `docs/README.md` list
every remaining file.

## Step RF2 — Tests against source

**Size:** L (three sessions). **Depends on:** RF1A (fewer files to convert).

**What:** package tests import TypeScript source and run without a build.
Packaged-output coverage stays, as one explicit smoke test per package.

**How (shared by all three sessions):**

- A root `vitest.shared.mjs` exports the workspace aliases (every
  `@lacecms/*` package specifier and subpath export to its `src/`) and two
  config builders: `sharedTestConfig` (source tests, `src/**/*.test.ts`)
  and `packagedTestConfig` (`src/**/*.packaged.test.mjs`, no aliases, so
  packaged tests resolve like a consumer). Each package's
  `vitest.config.mjs` and `vitest.packaged.config.mjs` use them.
- `*.test.mjs` files that import `../dist/*.js` become `*.test.ts` importing
  `./index.js` (or the module under test); a per-package
  `tsconfig.test.json` type-checks them under `pnpm typecheck`.
- Each package keeps one `packaged-exports.packaged.test.mjs` that imports
  `dist/` and asserts the literal public export list; tests that need built
  output (spawning `dist/bin.js`, Wrangler bundles, the copied admin
  bundle, fixture builds) are renamed `*.packaged.test.mjs`.
- `turbo.json`: `test` depends on nothing; a new `test:packaged` task depends
  on `build` and `^build`; root `pnpm test` runs both. Every package gains
  `test:watch`.
- `scripts/check-boundaries.mjs` excludes `*.test.ts`, `*.test.tsx` and
  `src/test-support/**` from import/re-export checks and the runtime cycle
  graph. Production import rules and admin source-structure checks remain
  unchanged; TypeScript, Oxlint and Vitest still check tests (owner decision
  recorded in RF2A).
- Packages not yet converted carry an interim `pnpm run build &&` prefix in
  their `test` script until their session removes it; RF2C removes the
  last ones, including the pre-existing prefixes of `packages/create-lace`
  and `apps/api`.

### Session RF2A — Pure packages

`content`, `config`, `domain`, `contracts`, `render`, `sdk`, `astro`
(`packages/astro/vitest.config.mjs` currently aliases `@lacecms/render` to
`../render/dist/index.js`). These have no copy steps and no native
dependencies, so they prove the pattern.

**Acceptance:** `pnpm --filter @lacecms/content test` runs in seconds on a
clean checkout without `dist/`; test counts are unchanged.

### Session RF2B — Application and server packages

`application`, `db`, `auth`, `server`, `mcp`. In the same session split the
two test monoliths along the module seams RF4 will use:
`packages/application/src/index.test.mjs` (1,565 lines, no `describe`) by
use case; `packages/server/src/app.test.mjs` (3,966 lines) by route group
(setup/session/account, users/invitations/tokens, builds, media, content,
public, docs).

### Session RF2C — Platforms, CLI, generator, apps and test-utils

- `packages/test-utils/src/repository-contract.ts` splits along its existing
  seams into `repository-contract/{shared,builds,lifecycle,sync,media,globals-seo,envelope,export,conditional}.ts`,
  each exporting its cases; `repository-contract/index.ts` concatenates them
  in the original order and a test pins the 103 case names. The Node and D1
  harnesses do not change. `security-contract.ts` stays.
- `packages/test-utils/src/index.ts` (1,785 lines) splits by concern into
  `assertions.ts`, `adapters.ts`, `in-memory-content-store.ts` and a
  re-exporting `index.ts`.
- `platform-node`, `platform-cloudflare`, `cli`, `create-lace`, `apps/api`,
  `apps/builder` and `apps/site` tests move to source; the eleven CLI
  tests that spawn `dist/bin.js`, the three generator tests that install
  the packed CLI, the Worker bundle/smoke tests, the admin-asset cases of
  the Cloudflare worker test and the site fixture build stay on built
  output under `test:packaged`.

**Acceptance:** `pnpm test` total case count equals the baseline count;
`pnpm --filter @lacecms/platform-node test` runs the contract suite from
source.

## Step RF3 — Shared vocabulary: types, constants, rules

**Size:** L (four sessions). **Depends on:** RF2A (fast tests in `content`,
`config`, `contracts`).

**What:** every rule that today exists in several copies gets one definition
in the lowest package allowed to own it, and the copies become imports or
derivations. `@lacecms/content` is the package every other package may
import, so it owns the shared vocabulary.

### Session RF3A — Field type capabilities

- `packages/content` exports a `fieldTypeCapabilities` table keyed by
  `FieldDefinition["type"]`: `listQueryable`, `seoText`, `placeholder`,
  `valueKind`, `sortableAs`, `filterKind`.
- Derive from it and delete: `LIST_FIELD_TYPES` and `SEO_TEXT_FIELD_TYPES`
  (`packages/config/src/index.ts:36-53`), `hasValidListFields`'s inline list
  (`packages/contracts/src/index.ts:378-399`), `scalarTypes`, the placeholder
  list and the default-value kinds in `packages/contracts/src/field-openapi.ts`,
  `CollectionQueryFieldType` (`packages/application/src/collection-queries.ts`)
  and the `strings` set with `datetime` special cases in
  `packages/db/src/collection-list.ts`.
- Admin: one `fieldTypeSupport: Record<FieldDefinition["type"], {problem, listCell, filter, summary, guidance}>`
  in `apps/admin/src/entities/content/field-types.ts`, consumed by
  `editor-form.ts`, `widgets/collection-entries/list-columns.ts`,
  `CollectionFilters.tsx`, `item-summary.ts`, `composite-values.ts` and
  `field-guidance.ts`, so a new field type fails to compile until every
  surface declares support.
- A contracts test asserts that `contentMetadataOpenApi` accepts exactly the
  descriptors `normalizeFieldDefinition` accepts.

**Architecture and specs:** §8 *Initial field types* gains the capability
table; `field-descriptors` (capabilities declared once),
`collection-query-options`.

**Acceptance:** adding a dummy field type in a test fixture touches `content`
and `apps/admin/src/entities/content/field-types.ts` only; generated
`apps/api/openapi/api-v1.json` is byte-identical.

### Session RF3B — Shared identifiers and limits

- Move to `packages/content`: slug and route canonicalization
  (`packages/config/src/index.ts:508-568` and
  `packages/domain/src/index.ts:466-530` are twins), `SLUG_PATTERN`,
  `ContentModelKind`, and the transport limits that application and contracts
  each declare (`MAX_MEDIA_SEARCH_LENGTH`, `MAX_MEDIA_USAGE_ENTRIES`,
  `MAX_BUILD_EXPORT_PAGE_SIZE`, entry search length). `config`, `domain`,
  `application` and `contracts` re-export them.
- The eleven `*Source` interfaces in contracts that mirror application types
  stay (the boundary forbids the import), but each gains a compile-time
  `satisfies` check in `packages/test-utils` (which may import both), and
  `toContentModelDto` is built from one key list so a new optional property
  cannot silently drop out of the DTO.
- Deduplicate the private helpers `deepFreeze`, `isPlainObject`, `isRecord`
  and `fail` (content, config, domain) through a `@lacecms/content` export.

**Architecture and specs:** §6 *Repository structure* rules (content owns
shared vocabulary); `content-domain-rules`.

**Acceptance:** `grep` finds one definition of each moved symbol; the
contracts and config test suites are unchanged.

### Session RF3C — One conditional-visibility evaluator

- `packages/content` gains `effectiveVisibilityValues(fields, visibility, values)`
  that applies controller defaults, and `isFieldVisible` is documented as
  taking effective values.
- `visibleUnder` (`packages/application/src/configuration-fields.ts`) and
  admin `effectiveFormValues` (`apps/admin/src/entities/content/visibility.ts`)
  delegate to it. `publishedFieldValues` in content uses the same helper.

**Architecture and specs:** `conditional-fields` gains one requirement: the
server, synchronization and the admin evaluate rules through one shared
function with identical default handling.

**Acceptance:** a parity test feeds the same model, rules and values to the
three call sites and expects equal visible sets, on Node and D1 for the
published projection.

### Session RF3D — One error model and one mapper

- `packages/domain` exports `LaceError { code: string }` as the base of
  `DomainError`; `AccountError`, `RateLimitExceededError` (gains a code),
  `ConfigurationError` and the content error classes extend it.
- `classifyError` in contracts becomes table-driven over codes; the inline
  `AccountError` and `RateLimitExceededError` branches in
  `packages/server/src/app.ts` are removed; `packages/mcp` uses the same
  mapper so application errors stop surfacing as `INTERNAL_ERROR`.
- Raw `throw new Error` sites in content and application become typed errors.

**Architecture and specs:** §12 *Contract rules* (error envelope);
`rest-contracts`, `mcp-content-server`. ADR: error model.

**Acceptance:** a contract test enumerates every error class and asserts the
HTTP status matrix equals the baseline matrix; MCP returns the mapped code for
an `AccountError`.

## Step RF4 — Module splits

**Size:** L (five sessions). **Depends on:** RF2 (tests on source) and RF3
(so splits move one definition).

**What:** no source file above roughly 1,000 lines; each module has one
responsibility and one owner section in the architecture. Every session is a
pure move: `index.ts` re-exports, public API unchanged, existing tests pass
with import paths only.

### Session RF4A — `@lacecms/content`

`packages/content/src/index.ts` (3,691 lines) becomes `json.ts` (JSON types
and helpers), `fields.ts` (descriptor normalization and `field` builders),
`rich-text.ts`, `validation.ts` (value validation, `compileFieldSchema`,
published projection), `references.ts` (media and internal-link collection),
`blocks.ts` (registry, `defineBlock`, migrations; `publishedBlockData` moves
here to remove the only forward reference), `built-in-blocks.ts` and
`entry.ts` (aggregate validation, canonical JSON, hashing).
`index.type-test.ts` is split alongside.

### Session RF4B — `@lacecms/application`

- `packages/application/src/index.ts` (1,210 lines) becomes `ports/` by
  capability (`content.ts`, `media.ts`, `security.ts`, `builds.ts`,
  `infrastructure.ts` for clock, ids, cache, logger), `brands.ts`,
  `limits.ts` and a thin `index.ts`. `SecurityService` (28 methods) is split
  into `AccountSecurityPort`, `SessionSecurityPort` and `TokenSecurityPort`;
  runtimes keep implementing the intersection.
- The `configuration-*` cluster: first `configuration-sync-types.ts` holding
  ports, plan, change and evidence types (breaks every type-only cycle), then
  `configuration-sync.ts` into `configuration-plan.ts`,
  `configuration-report.ts` and `configuration-apply.ts`; `decideEvolution`
  (362 lines) becomes a table keyed by `StructuralChange.kind`.

RF2B test companions are already separated: `index.test.ts` covers the
ports/brands helpers; `configuration-sync.test.ts`,
`configuration-evolution.test.ts`, `configuration-migration.test.ts` and
`configuration-visibility.test.ts` accompany the configuration cluster. The
use-case companions are `accounts.test.ts`, `content-authority.test.ts`,
`draft-normalization.test.ts`, `conditional-publication.test.ts`,
`site-build.test.ts`, `media-use-cases.test.ts`, `collection-queries.test.ts`,
`build-export.test.ts`, `internal-links.test.ts`, `import-tokens.test.ts`,
`email.test.ts` and `image-container.test.ts`.

**Architecture:** §15 *Infrastructure ports* is rewritten from the real
interfaces (today it shows a `Cache.get<T>` port that does not exist).

### Session RF4C — `@lacecms/contracts`

`packages/contracts/src/index.ts` (3,014 lines) becomes `content.ts`,
`media.ts`, `accounts.ts`, `builds.ts`, `settings.ts`, `errors.ts` and
`openapi.ts`, mirroring the REST resource groups. `hasMatchingBlockDefinitions`
loses its ordering dependency (match by type, not index). Its test file splits
the same way.

### Session RF4D — `@lacecms/server`

`createLaceApp` keeps `onError`, the five global middlewares and app
construction. Routes move to `routes/{setup-session,accounts,admin-users,builds,media,content,public,docs}.ts`,
each exporting `register<Area>Routes(app, context)` over a `RouteContext`
(`actor`, `usersActor`, `settingsActor`, `response`, `errorResponse`,
`noStore`, `deferTask`, DTO mappers). The two handlers that inline domain
work (media multipart and tag parsing, build export paging) move their
parsing into `media-upload.ts` and `build-export.ts`. The MCP and OAuth
special cases become one `protocolErrorResponse` helper.

RF2B route test companions map to the future modules: `setup-session` uses
`routes-session-settings.test.ts`; `accounts` uses `routes-accounts.test.ts`;
`admin-users` uses `routes-users-invitations.test.ts`; `builds`, `media` and
`content` use their corresponding `routes-*.test.ts`; `public` uses
`routes-public-export.test.ts`; `docs` and global middleware remain in
`app.test.ts`. MCP/OAuth and import protocol coverage live in
`routes-mcp.test.ts` and `routes-import.test.ts`. Shared fixtures are in
`src/test-support/app-harness.ts`; `build-site.test.ts` and `email.test.ts`
remain alongside their existing modules.

### Session RF4E — `@lacecms/db` and remaining monoliths

- `packages/db/src/sql-content.ts` (2,229 lines) becomes `sql/{entries,snapshots,blocks,media,builds,cursors}.ts`
  and `write-errors.ts`; the `*_COLUMNS_SQL` constants gain a test that
  migrates an in-memory database and asserts every column they name exists in
  `pragma table_info` (closes the schema-versus-SQL drift gap). `drizzle-kit
  check` joins `pnpm lint`.
- `packages/db/src/schema.ts` (862 lines) splits by table group only if the
  Drizzle snapshot stays identical; otherwise it stays.

**Acceptance (all RF4 sessions):** `pnpm build` export lists are identical to
the baseline; `pnpm test` case counts are unchanged; `check-boundaries`
passes; no source file in the session's package exceeds 1,000 lines.

## Step RF5 — Runtime deduplication

**Size:** L (three sessions). **Depends on:** RF4E (split `db`), RF2C (split
contract suite).

**What:** Node and D1 share every read path and every row mapper; the write
paths stay runtime-specific but their known semantic differences are either
aligned or recorded.

### Session RF5A — Shared security rows

Move the verbatim row mappers (`role`, `user`, `profile`, `invitation`,
`session`, `buildToken`), `normalizedEmail`, `isUniqueViolation`,
`INVITATION_COLUMNS_SQL` and `ACTIVE_INVITATION_SQL` from
`packages/platform-node/src/security.ts` and
`packages/platform-cloudflare/src/d1-security.ts` into
`packages/db/src/security-rows.ts`, following the existing
`packages/db/src/api-tokens.ts` pattern. `digest`, `tokenSecret` and
`randomHex` stay platform-local. `security-contract` (22 cases) guards both.

### Session RF5B — Shared content reader

`packages/db` gains `SqlContentReader`, constructed like
`SqlContentLinkReader` with `{ all }` and a `bindChunk` (200 on Node, 100 on
D1). Read methods move one at a time, each followed by the repository contract
on both runtimes: `listMedia`, `loadSnapshots`, `publicMedia`,
`describeActors`, `listPublic`, `loadMediaUsage`, `listMediaTags`,
`exportBuildContentPage`, then the thin delegations (`load`, `loadDraft`,
`loadPublished`, `linkReader`). Both repository classes delegate, as
`resolveLinkTargets` already does.

**Acceptance:** the two repository files lose their read bodies and import
blocks shrink; `repository-contract` passes on SQLite (file and memory) and
D1.

### Session RF5C — Runtime deltas and composition

- Align or record the three known write-path differences:
  `claimSiteBuilds` (D1 caps the limit and guards `payload_json`, Node does
  neither) — Node adopts both; revision-conflict detection (Node
  `changes !== 1`, D1 pre-check plus post-batch disambiguation) — one contract
  case pins the observable result; publication return path (D1 returns the
  in-memory `publishedEntry()` prediction, Node reloads) — a contract case
  asserts equality between the returned entry and a subsequent `load`.
- `mutation_guards` use on Node (sync path) is documented or removed.
- `packages/server` gains `composeLaceServices({ repository, security, storage, clock, ids, listQueryLimits, logger })`
  returning the use cases and the `createLaceApp` input; `createNodeRuntime`
  and `createCloudflareRuntime` supply adapters only. `LACE_API_DOCS_ENABLED`
  and `LACE_MCP_ENABLED` are validated once.

**Architecture and specs:** §16 gains a "runtime deltas" table; ADR 0002 is
amended; `content-repository-contracts` gains the two contract cases.

## Step RF6 — Admin editor structure

**Size:** L (four sessions). **Depends on:** RF3A (field type support
table). Independent of RF4–RF5 and may run in parallel.

**What:** the draft editor has one state owner, the content slice no longer
pulls Tiptap and dnd-kit into every importer, and the API client cannot
drift from the OpenAPI document unnoticed.

### Session RF6A — Slice split and folder rule

- Split `entities/content` into `entities/content` (models, validation,
  helpers), `entities/rich-text` (`RichTextEditor*`, `LinkPopover`,
  `RichTextBubbleMenu`, `RichTextToolbar`, extensions) and
  `entities/field-editor` (`FieldRenderer`, `FieldControls`, `FieldLayout`,
  `field-types.ts`). The 27 importers of the old barrel are re-pointed; no
  boundary rule changes.
- `scripts/check-boundaries.mjs`: a PascalCase leaf component that is not
  exported from its slice may live as a sibling file without a folder.
  Merge `RevokeBuildTokenDialog` and `RevokeImportTokenDialog` into one
  `RevokeTokenDialog`.

**Acceptance:** a unit test of `SidebarNav` no longer loads `@tiptap/*`
(asserted through `vi.mock` call counts); barrel count drops below 150.

### Session RF6B — API client

- A test in `apps/admin/src/shared/api` loads `apps/api/openapi/api-v1.json`
  and asserts that every literal path and method in the client exists in it
  (and, for query parameters built by hand, that the names exist).
- Split `admin-client.ts` into `admin-client/{content,media,accounts,settings,builds}.ts`
  behind the unchanged `AdminClient` interface and `adminQueryKeys`.

### Session RF6C — Draft editor state

- `useDraftEditor(entryId, model)` in `entities/field-editor` owns `useForm`,
  the transient issue map, `editorEpoch`, `applyServerIssues` and slug
  suggestion; transient issues move into react-hook-form through
  `form.setError(name, { type: "transient" })`, so dirty and blocking state
  have one source.
- `useEntryMutations` owns save, publish, reload-server-draft and conflict
  state. `EntryPage` passes one `editor` object to `FieldRendererProvider`
  instead of 16 props.
- A typed `FieldPath` template-literal type replaces the `as never` casts in
  `FieldRenderer.tsx` and `EntryPage.tsx`.

**Acceptance:** `apps/admin/e2e/editor.e2e.ts`, `entry-actions.e2e.ts` and
`composites.e2e.ts` pass unchanged; `as never` count in non-test admin code
drops below 25.

### Session RF6D — List field and block card

- `ListNode`, `ItemRow`, `ItemSummaryLine` and `rowFocusTarget` move from
  `FieldRenderer.tsx` to `entities/field-editor/ListField/`; `FieldRenderer`
  becomes the dispatcher (target: under 500 lines).
- `BlockCard` extracts `BlockCardMenu` and `BlockCardTabs`; `BlockEditor`
  passes one `actions: BlockActions` object created once instead of 18
  callbacks per card.

## Step RF7 — CLI and developer scripts

**Size:** M (two sessions). **Depends on:** RF1A. Independent of RF3–RF6.

### Session RF7A — Lazy Cloudflare path

- `packages/cli/src/commands.ts` imports `@lacecms/platform-cloudflare` and
  `./d1-transport.js` (hence `miniflare`) only inside the `cloudflare-*`
  branches through `await import()`, as `doctor-probes.ts` and
  `doctor-settings.ts` already do.
- `miniflare` becomes an optional peer dependency of `@lacecms/cli` with a
  clear error when a Cloudflare target is used without it.
- Open question for the specification: whether `@lacecms/platform-cloudflare`
  should stop shipping its `admin/` asset bundle to CLI consumers (a separate
  package or a `files` change), since the CLI never serves it.

**Acceptance:** a packaged test runs `lace db migrate --target node` with a
module hook that throws on `miniflare` and expects success; `lace doctor`
output is unchanged.

### Session RF7B — One command table

- `parseFlags(argv, spec)` with the shared `--json`, `--help` and
  duplicate-flag rules replaces the six parsers (`index.ts`,
  `doctor-report.ts`, `preflight-options.ts`, `upgrade-command.ts`,
  `blocks-command.ts`, `import-command.ts`); `bin.ts` iterates a
  `defineCommand({ name, usage, parse, run })` table. `doctor` and
  `preflight` convert first.
- `scripts/cloudflare.mjs migrate` and `scripts/dev-stack.mjs sync` shell
  out to `packages/cli/dist/bin.js` instead of re-implementing the commands;
  `scripts/cloudflare-lib.mjs` loses its own argv parser.
- `tsconfig.library.json` and `tsconfig.node.json` (byte-identical) become
  one; `packages/cli/tsconfig.json` drops `DOM` and `ES2023` overrides;
  `auth`, `mcp` and `server` extend a renamed `tsconfig.web.json` with a
  comment stating the "fetch types only" intent.

**Acceptance:** every CLI command's `--help` text is unchanged (snapshot
test); `pnpm dev:node` and `pnpm content:sync` still work.

## Step RF8 — Documentation

**Size:** L (three sessions). **Depends on:** RF4B and RF5C for the
architecture sections they change; RF1B for the index.

### Session RF8A — Architecture document

- Remove change codes (`CE7D`, `SM5`, `LIST1`, `MCP2`…) from headings and
  prose of `docs/mvp-architecture.md`; a "History" appendix maps each code to
  its archived change. The body states current behavior only.
- §24 *Decisions captured by this document* moves into ADRs (new ADRs only
  where none exists); the section becomes a pointer to `docs/adr/README.md`.
- §15 is rewritten from the real ports after RF4B; §16 gains the runtime
  deltas table from RF5C; §6 lists the new module layout rules (file size
  ceiling, one responsibility per module).
- Target size: under 2,500 lines without loss of invariants (a review
  checklist in the change lists every invariant and where it now lives).

### Session RF8B — OpenSpec specifications

- `openspec/specs/README.md` groups the 84 capabilities by domain with one
  ownership rule per group (for example: descriptor shape →
  `field-descriptors`; value validation → `content-validation`; lifecycle →
  `content-domain-rules`; visibility → `conditional-fields`).
- Move the gallery-specific requirements that `block-registry`,
  `block-source-registry` and `block-installation-cli` each carry into the
  owning capability, through `openspec-sync-specs` with explicit MODIFIED
  requirements.
- Split `admin-draft-editor` (2,154 lines) by sub-surface:
  `admin-draft-editor-fields`, `-blocks`, `-publication`, `-media-lists`.
- The change archive stays complete (owner decision 4).

**Acceptance:** `pnpm spec:validate` strict; no requirement text is lost
(diff of concatenated requirement titles before and after).

### Session RF8C — User documentation

- Audit the 18 pages of `apps/docs` against the implemented product: every
  CLI command, `lace.config.ts` option, environment variable, REST resource
  and MCP tool is reachable from `reference/`; features delivered by the two
  completed roadmaps (import, media tags, conditional fields, MCP publishing,
  collection queries, internal links, video embeds) have a page or a
  section.
- Each internal note in `docs/*.md` is either promoted to a public page or
  marked "internal" in `docs/README.md`; nothing is described in both places.
- Page template: purpose, prerequisites, steps, reference, "verified against
  version" footer sourced from `release/alpha.json`.
- Open questions: whether the versioned route (`en/latest`) gains a pinned
  version at the first non-alpha release; whether the generated project's
  guides (`consumer-guides.mjs`) are published or stay generated.

**Acceptance:** `pnpm docs:check` passes; a root test asserts that every
public CLI command name and every REST path in `api-v1.json` appears in the
reference pages.

## 6. Progress log

| Date | Session | Change | Notes |
| --- | --- | --- | --- |
| 2026-11-01 | — | — | Roadmap selected from the workspace audit. Site migration roadmap archived. No OpenSpec change created. |
| 2026-11-01 | RF1A | `rf01a-workspace-scripts-hygiene` | Proposed. Corrections to the roadmap text: the alpha-named journey modules are current spec-required acceptance journeys and are renamed, not merged; `field-trial-acceptance.test.mjs` is a helper unit test and is renamed; `make-api-runtime.mjs` stays (Dockerfile). Owner decision: keep only the `0.35.0` upgrade fixtures. Delta specs: `generated-project-acceptance` (2 modified, 2 removed), `prepublication-consumer-security` (2 modified), `workspace-governance` (1 added, 1 removed). 21 tasks, not applied. |
| 2026-11-01 | RF1B | `rf01b-docs-pruning-index` | Proposed. One `docs/verification.md` (commands, limits, coverage, D1 measurements, owner checks), `docs/README.md` and `docs/adr/README.md` indexes, deletion of `docs/archive/step-*`, link repair in ten documents, root link-guard test. Delta specs: `local-operations-verification`, `local-security-resilience-verification`, `cross-runtime-product-verification`, `public-documentation` (1 modified each), `workspace-governance` (1 added). 15 tasks, not applied; depends on RF1A. |
| 2026-11-01 | RF1A | `rf01a-workspace-scripts-hygiene` | Archived at [`2026-11-01-rf01a-workspace-scripts-hygiene`](../openspec/changes/archive/2026-11-01-rf01a-workspace-scripts-hygiene/); 21/21 tasks complete and all three capability deltas synchronized. Journey modules now have behavior names; five Vitest configs became one named-project config; latest-template fixtures retained; placeholder and feedback maps removed; superseded video planning archived without syncing deltas. Script files: 52 → 47 top-level + 4 journeys; documented commands: 24/55 → 54/54; root test files: 34 → 32, cases unchanged at 225. Catalog covers all 54 root commands; script guard includes workspace build scripts reached through Turbo. |
| 2026-11-01 | RF1B | `rf01b-docs-pruning-index` | Archived at [`2026-11-01-rf01b-docs-pruning-index`](../openspec/changes/archive/2026-11-01-rf01b-docs-pruning-index/); 15/15 tasks complete, all five capability deltas synchronized. Consolidated five verification documents, removed 35 tracked obsolete step records (the audit counted 48 files), indexed 45 documents and 18 ADRs, repaired links including archived roadmaps and the current about route. New root link guard exercises missing links and unindexed documents/ADRs in a scratch copy. Public documentation build inputs unchanged. Typecheck, lint, formatting, full tests (44 Turbo tasks; 33 root files / 228 tests), docs checks and strict validation passed; local Worker/root tests ran outside the sandbox with pinned Node 24.12.0 and pnpm 12.3.4. |
| 2026-11-01 | RF2A | `rf02a-source-tests-pure-packages` | Proposed. Shared `vitest.shared.mjs` (aliases, source and packaged config builders), `.test.ts` + `tsconfig.test.json`, `*.packaged.test.mjs` under `test:packaged`, build-free `test` task, boundary exemption for test files; converts `content`, `config`, `domain`, `contracts`, `render`, `sdk`, `astro` (baseline 446 cases). Delta spec: `workspace-governance` (1 added, 1 modified). 18 tasks, not applied. |
| 2026-11-01 | RF2B | `rf02b-source-tests-application-server` | Proposed. Converts `application`, `db`, `auth`, `server`, `mcp` (baseline 250 cases); splits `application/src/index.test.mjs` into eight use-case files and `server/src/app.test.mjs` into ten route-group files plus `src/test-support/app-harness.ts`, matching the RF4B/RF4D module layout. `skip_specs`. 13 tasks, not applied; depends on RF2A. |
| 2026-11-01 | RF2C | `rf02c-source-tests-delivery-and-test-utils` | Proposed. Splits `test-utils` (`repository-contract/` by area with pinned case order; `assertions`/`adapters`/`in-memory-content-store`); converts platforms, CLI, generator and apps with packaged cases separated by file; removes every interim build prefix. `skip_specs`. 15 tasks, not applied; depends on RF2B. |
| 2026-11-02 | RF2A | `rf02a-source-tests-pure-packages` | Archived at [`2026-11-02-rf02a-source-tests-pure-packages`](../openspec/changes/archive/2026-11-02-rf02a-source-tests-pure-packages/); 18/18 tasks complete and the `workspace-governance` delta synchronized. Shared source aliases and configs, seven packages converted (446 listed titles / 768 expanded cases preserved), seven packaged export checks, build-free source-test task and watch scripts. Test/test-support imports excluded from boundaries and cycle graph; production and admin structure checks preserved. All seven source suites pass without any package dist; content 0.47 s. Nine legacy files use the explicit TODO(rf2) typechecking escape hatch, listed in the change verification note; eight files are strictly checked. Root typecheck, lint, build, tests (51 Turbo tasks; 33 root files / 250 cases), formatting and strict specification gates pass. Root test wall time 328.49 s without cache; earlier cached baseline failed its toolchain gate, so no controlled root speed comparison is claimed. |
| 2026-11-02 | RF2B | `rf02b-source-tests-application-server` | Archived at [`2026-11-02-rf02b-source-tests-application-server`](../openspec/changes/archive/2026-11-02-rf02b-source-tests-application-server/); 13/13 tasks complete, no delta specs. Five packages converted to source tests; application split into eight use-case files, server into ten route-group files with a typed shared harness. All 250 listed titles preserved (277 expanded source cases); five packaged export checks added. RF2A source aliases, build-free tests and boundary exclusions reused. 24 legacy test files retain explicit TODO(rf2) typechecking exceptions (RF2A: nine); nine test files and the harness are strictly checked. Root typecheck, lint, build, tests (56 Turbo tasks; 33 root files / 250 cases), formatting and strict specification gates pass. All five source suites pass with every package dist temporarily absent. |
| 2026-11-02 | RF2C | `rf02c-source-tests-delivery-and-test-utils` | Archived at [`2026-11-02-rf02c-source-tests-delivery-and-test-utils`](../openspec/changes/archive/2026-11-02-rf02c-source-tests-delivery-and-test-utils/); 15/15 tasks complete, no delta specs. Test-utils split into area contracts and assertions/adapters/store modules with unchanged public exports; all 105 measured contract registrations pinned in order (proposal baseline 103 was stale). Eight members now use source/packaged separation; source tests pass without any dist or copied admin bundle. All original titles preserved. Owner confirmed process/Astro/registry/schema cases as packaged, with Worker asset routing kept source-based. All 22 source tasks have no build dependencies; 20 members have watch scripts. RF2 retains 88 explicit legacy typing exceptions (33 earlier, 55 RF2C including the Worker helper), inventoried in the change verification note. Root build, typecheck, lint, tests (64 Turbo tasks; 33 root files / 250 cases), formatting and strict validation pass. Root test wall time 255.47 s with 25 cached tasks versus RF2A 328.49 s without cache; no controlled speed comparison is claimed. |
