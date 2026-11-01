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
| Test loop | package test files importing `../dist/` | 112 of 119 `.test.mjs` |
| Test loop | `turbo.json` `test.dependsOn` | `["build", "^build"]` |
| Test loop | packages with a `test:watch` script | 0 |
| Size | `packages/test-utils/src/repository-contract.ts` | 9,400 lines, 103 cases in one array |
| Size | `packages/server/src/app.test.mjs` | 3,966 lines |
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
| Scripts | alpha-numbered or roadmap-step-numbered entrypoints | `alpha-six/seven/eight-acceptance.mjs`, `consumer-34b-security.mjs`, `verify:34a/b/c` |
| Docs | `docs/mvp-architecture.md` | 3,696 lines; change codes (CE/SM/LIST/MCP) in headings and prose |
| Docs | `docs/archive/step-*` verification records | 48 files, 952 KB |
| Docs | verification documents | 5 (`mvp-traceability`, `verification/ce10-*`, `real-application-`, `local-operations-`, `local-security-verification`) |
| Specs | `openspec/specs` | 84 capabilities, 22.7k lines, no index; `admin-draft-editor` 2,154 lines |
| Specs | stale unapplied change | `openspec/changes/video-a-media-upload-delivery` (0 of 20 tasks; fails `spec:validate` strict) |

## 4. Delivery overview

| Step | Topic | Size | Sessions | Status |
| --- | --- | :---: | --- | --- |
| RF1 | Workspace hygiene | M | RF1A → RF1B | planned |
| RF2 | Tests against source | L | RF2A → RF2B → RF2C | planned |
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
7. The oldest template version kept as an upgrade fixture is decided in RF1A
   (open question there).

## Step RF1 — Workspace hygiene

**Size:** M (two sessions). **Prerequisite:** none.

**What:** the repository contains only files that serve the current product
or its history. Scripts have current names and one catalog.

### Session RF1A — Scripts, root tests and stale change

- Delete `scripts/not-implemented.mjs` and the root `test:integration`
  script, which only prints "not implemented" and fails.
- Alpha-era regression journeys become one current journey:
  `scripts/alpha-six-acceptance.mjs`, `alpha-seven-acceptance.mjs`,
  `alpha-eight-acceptance.mjs` (called from `generated-project-acceptance.mjs`
  and `cloudflare-consumer-acceptance.mjs`) and the root
  `tests/alpha-2-feedback-acceptance.test.mjs`,
  `onboarding-feedback-acceptance.test.mjs`, `field-trial-acceptance.test.mjs`
  and `feedback-map.mjs`. Assertions that still describe current behavior
  move into `scripts/release-acceptance.mjs` keyed only to
  `release/alpha.json`; the per-alpha files are deleted. Historical findings
  remain in the archived changes.
- Rename roadmap-step-numbered entrypoints to what they verify:
  `verify:34a` → `verify:cross-runtime`, `verify:34b` → `verify:security`,
  `verify:34c` → `verify:operations`; `scripts/consumer-34b-security.mjs` →
  `scripts/consumer-security-static.mjs`. Vitest configs
  `vitest.cross-runtime|d1-budgets|operations|resilience|security-static.config.mjs`
  collapse into one root `vitest.config.mjs` with named `projects`, each
  selectable from the verification scripts.
- Template upgrade fixtures: `tests/fixtures/template-0.4.0`, `0.14.0`,
  `0.30.0`, `0.35.0` and their root tests keep only the oldest supported
  upgrade origin plus the previous release's template; the rest are deleted
  and `template-upgrade-acceptance.mjs` is adjusted.
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

**Open questions:** the oldest template version that upgrades must still
support (decides which fixtures stay); whether `scripts/fixtures/oauth-mcp`
compatibility tests stay a root script or move into `packages/auth`.

### Session RF1B — Documentation pruning and index

- Delete `docs/archive/step-25`, `step-27`, `step-29`, `step-32`, `step-33`,
  `step-34` (verification records and JSON artifacts of completed roadmap
  steps). `docs/archive/` keeps the three roadmaps and the implementation
  roadmap summary.
- Merge `docs/mvp-traceability.md`, `docs/verification/ce10-internal-url-links.md`,
  `docs/real-application-verification.md`,
  `docs/local-operations-verification.md` and
  `docs/local-security-verification.md` into one `docs/verification.md`: the
  suites that exist today, what each proves, how to run it, and where its
  evidence is written. Step-era identities and dates are dropped.
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

- A root `vitest.shared.mjs` exports a config that aliases every
  `@lacecms/*` workspace package to its `src/index.ts` and transpiles with
  Vitest. Each package's `vitest.config.mjs` extends it.
- `*.test.mjs` files that import `../dist/*.js` become `*.test.ts` importing
  `./index.js` (or the module under test), gaining type-checking.
- Each package keeps one `packaged-exports.test.mjs` that imports `dist/` and
  asserts the public export list, so packaging regressions still fail.
- `turbo.json`: `test` depends on nothing; a new `test:packaged` task depends
  on `build` and `^build`; root `pnpm test` runs both. Every package gains
  `test:watch`.
- Remove the inner `pnpm run build &&` from the `test` scripts of
  `packages/create-lace` and `apps/api`.

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

### Session RF2C — Platforms, CLI and test-utils

- `packages/test-utils/src/repository-contract.ts` splits along its existing
  seams into `repository-contract/{builds,lifecycle,sync,media,globals-seo,envelope,export,conditional}.ts`,
  each exporting `cases`; `repository-contract/index.ts` concatenates them.
  The Node and D1 harnesses do not change. `security-contract.ts` stays.
- `packages/test-utils/src/index.ts` (1,785 lines) splits into
  `factories.ts`, `fixtures.ts`, `stores.ts` and `harness.ts`.
- `platform-node`, `platform-cloudflare` and `cli` unit tests move to source;
  tests that exercise the packaged CLI binary or Worker bundle stay on `dist`
  under `test:packaged`.

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
