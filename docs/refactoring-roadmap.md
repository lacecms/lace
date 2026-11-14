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

1. [architecture](architecture/README.md) owns product scope and
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
- A session that splits or moves test files types the new companions or lists
  them explicitly in `scripts/test-typecheck-baseline.json`; the `@ts-nocheck`
  header is never copied silently (RF4X).

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

### Owner-requested RC2 release checkpoint (2026-11-08)

After RF8B the owner selected `0.1.0-rc2` on `next` with template `0.47.0`. It
includes every commit after published rc1 through the reviewed shipping
source. OpenSpec change `prepare-rc2-release` selects coherent coordinates,
records rc1 in `publishedVersions`, writes the changelog entry and relaxes the
preparation gate to Node 24 or later with exact pnpm `12.3.4`. It also
withdraws `allow-supported-node-release-preparation`. The owner prepares,
accepts and publishes rc2 themselves using `docs/alpha-release.md`. The
remaining sessions (RF6, RF7, RF8C, RF9C–RF9F) keep their order, are not part
of rc2 and end in rc3. rc1 stays the oldest supported release and the upgrade
fixture origin.

**Outcome (RC2):** the owner published rc2 on 2026-11-08: sixteen npm
packages on `next`, both images for linux/amd64 and linux/arm64, and GitHub
prerelease `v0.1.0-rc2` at merge commit `e82670cc`. `prepare-rc2-release` is
archived with its specifications synchronized. `0.1.0-rc2` joins
`publishedVersions` when rc3 is selected.

### Owner-inserted feature changes after RF6 (2026-11-10)

After RF6 the owner inserted four just-in-time changes outside the RF steps,
delivered in this order before RF7:

1. `rc2-oldest-supported`: rc2 (template `0.47.0`) becomes the oldest
   supported release and the upgrade fixture origin; everything that exists
   only for rc1 (fixtures, upgrade sections, rc1-named scenarios) is removed.
2. Gallery per-item placement and sizing (backlog).
3. Configurable default collection sort (backlog).
4. Route-less collections (backlog).

Later changes migrate only from rc2: a built-in block change still bumps the
definition version and migrates rc2 data, but no compatibility with rc1 or
earlier is kept. Gallery decisions: `placement` (`auto`, `full`, `start`,
`end`) is a reusable list-layout item field that acts in `grid` mode only
(`start` = first column, `end` = last column, `full` = all columns, for every
preset) and is retained without effect in flex modes; `featured-first` is
removed and migrated to `columns-2` with a `full` first item; image `size`
`natural` keeps intrinsic width capped to the cell with preserved proportions
and no horizontal overflow; gallery video items default to `ambient` playback,
`videoEmbed` keeps `player`. No release is selected: the owner decides when
rc3 is prepared. RF7, RF8C and RF9C–RF9F keep their order after these changes.

On 2026-11-10 the owner also inserted `admin-editor-ui-polish` from an admin
UI review, delivered before route-less collections: the Site navigation group
becomes Globals, a block-less model shows its fields in the main column, the
block highlight clears outside the list, blocks gain Collapse all, and
smaller editor fixes. Per-model navigation icons went to the backlog.

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
| Size | `packages/content/src/index.ts` | 3,691 lines, eight responsibilities → RF4A: 178-line re-export entry; 23 modules in five domain directories, largest 736 lines |
| Size | oversized production files | 19 → RF4A: 18 → RF4B: 15 → RF4C: 14 → RF4D: 13 → RF4E: 11 → RF4F: 4 → RF5B: 2 (admin only), enforced by a shrinking size baseline |
| Size | `packages/contracts/src/index.ts` | 2,994 → RF4C: 144 lines (largest module: 226) |
| Size | `packages/server/src/app.ts` (`createLaceApp`) | 2,948 lines (73 routes in one function) → RF4D: 218-line factory, largest production module 492 lines |
| Size | `packages/platform-cloudflare/src/d1-content-repository.ts` | 2,696 lines → RF5B: `repository/` (ten modules, largest `entries.ts` 646) |
| Size | `packages/platform-node/src/content-repository.ts` | 2,291 lines → RF5B: `repository/` (eight modules, largest `entries.ts` 481) |
| Size | `packages/db/src/sql-content.ts` | 2,229 lines → RF4E: domain modules; largest db module 862 lines |
| Size | `packages/config/src/index.ts` | 1,229 lines → RF4E: entry and domain modules |
| Size | `packages/application/src/configuration-sync.ts` | 1,836 lines → RF4B: five planning, decision, support, report and apply modules; no module cycles |
| Size | `apps/admin/src/entities/content/FieldRenderer/FieldRenderer.tsx` | 1,508 lines (`ListNode` alone ≈ 580) → RF6A: moved to `entities/field-editor`, 1,502 lines → RF6C: 1,478 → RF6D: 416; split files remain below 1,000 lines and the baseline entry is removed |
| Type safety | admin source `as never` occurrences (including app test support) | RF6C: 40 → 22, all remaining in `app/testing`; counted with `rg -o` over non-test source |
| Size | `apps/admin/src/shared/api/admin-client.ts` | 1,043 lines, 59 methods, 53 literal paths, no route drift test → RF6B: 132-line facade; largest domain module 198 lines, OpenAPI drift guard |
| Duplication | copies of the "list-queryable field types" set | 1 authoritative content table; 0 consumer copies (RF3A); 1 admin support table → RF3E: admin grouped and counted subsets and filter controls derive from it |
| Duplication | filter value checks | 2 (application, admin) → RF3E: 1 portable `fieldFilterValueFailure`, pinned by a shared parity table |
| Duplication | `*Source` interfaces in contracts mirroring application types | 11 → RF3B: 11 kept (the boundary forbids the import), each checked by a `satisfies` mirror test in test-utils → RF3E: 12 (`BuildExportSource` was unchecked), enumerated from the contracts entry, compared both ways with optionality and nested `seo`/`seoDefaults`/`usage[]` |
| Duplication | copies of shared grammars and limits outside their owner | RF4X audit: field key 13, block type 3, media-tag grammar 3, title length 7, page size 7, draft media references 3, link-resolve batch 3, display name 2, video providers 4 → RF3E: 0, detected by literal in `tests/shared-vocabulary.test.mjs` |
| Duplication | slug/route canonicalization | once in content; config/domain preserve their public wrappers (RF3B) |
| Duplication | conditional-visibility evaluators | 1 in content; application and admin delegate (RF3C) |
| Duplication | error conventions | 1 shared base in content and classifier in contracts (RF3D); MCP maps application errors through the shared classifier |
| Duplication | Node vs D1 content repository | 54 identical public methods; read side ≈ 25% verbatim → RF5B: every identical read in `db` `SqlContentReader` (472 lines); repositories delegate; remaining runtime-specific reads: `list`, configuration-sync scans and Node's synchronous in-transaction entry loader → RF5C: every remaining write-path difference aligned or listed in architecture §16 "Runtime deltas", pinned by three new contract cases |
| Duplication | security row mappers and SQL constants | verbatim in `platform-node/security.ts` and `platform-cloudflare/d1-security.ts` → RF5A: one owner each (`db` `security/rows.ts`; rate-limit policies and setup TTL in application); adapters split by port, largest module 629 lines (`d1-security.ts` 984 → 215) |
| Duplication | runtime composition roots | `createNodeRuntime` (621 lines) and `createCloudflareRuntime` (484) each build the use cases, request rate limiter, model resolver, MCP wiring and the 27-field app input → RF5C: one `composeLaceServices` in server; roots build adapters only (561 and 421 lines); one feature-flag parser; routes see actor resolution and capabilities, not the app input |
| Duplication | argv parsers in `packages/cli` | 6 (+1 in `scripts/cloudflare-lib.mjs`) |
| Admin | one-line `index.ts` barrels | 176 of 196 → before RF6A: 163 → RF6A: 147 of 182 |
| Admin | components under 60 lines occupying a three-file folder | 40 |
| CLI | runtime dependencies on the `--target node` path | `miniflare` + `workerd` loaded statically through `commands.ts` |
| Scripts | `scripts/*.mjs` | 52 files, 13.7k lines; 31 of 55 root scripts undocumented |
| Scripts | alpha-numbered or roadmap-step-numbered entrypoints | three release-named journey modules, one step-named security module and three step-named verification commands → RF7D: remaining release-named journey removed; 44 test titles, one temporary prefix and five pinned contract names renamed; test-title guard added |
| Docs | architecture document (now `docs/architecture/`) | 3,696 lines; change codes (CE/SM/LIST/MCP) in headings and prose → RF8A (4,086 lines at the start): a README and twelve domain files, 2,492 prose lines; codes only in `history.md`; guarded by `tests/architecture-document.test.mjs` |
| Test loop | test files with `@ts-nocheck` | RF2C: 88 → RF4E: 143 (copied by splits) → RF4X: 141 → RF4F: 139 → RF4G: 137 → RF4I: 136 → RF4H: 132, listed in a shrinking baseline; test-support always typed |
| Layout | intra-package module cycles | RF4X: 5 legacy components baselined (admin `entities/content`, `auth`, `cli`, `domain`, `platform-node`); six split packages declared in `scripts/source-layout.json` → RF4F: seven → RF4G: 3 components (`domain` and `auth` cycles broken), nine packages declared → RF5B: 2 components (`platform-node` broken); both platform packages declared |
| Docs | Obsolete step verification records | Audit: 48 files, 952 KB → RF1B: 0 retained |
| Docs | verification documents | 5 → RF1B: 1 (`docs/verification.md`) |
| Docs | indexed Markdown files | RF1B: 45 documents + 2 indexes; 18 ADRs |
| Specs | `openspec/specs` | 84 capabilities, 22.7k lines, no index; `admin-draft-editor` 2,154 lines (RF8B: 89 capabilities with a domain index; editor core 289 lines) |
| Migrations | checked-in Drizzle migrations; compatibility paths for pre-rc1 data | 16 migrations; built-in block identity migrations, legacy structure hash, legacy public-identity proofs, export format 1, manifests without site record, alpha.7/alpha.8 upgrade fixtures → RF8X: 1 baseline migration, none of the paths; rc1 fixture; template 0.47.0 |
| Specs | stale unapplied change | `openspec/changes/video-a-media-upload-delivery` (0 of 20 tasks; fails `spec:validate` strict) |

## 4. Delivery overview

| Step | Topic | Size | Sessions | Status |
| --- | --- | :---: | --- | --- |
| RF1 | Workspace hygiene | M | RF1A → RF1B | done |
| RF2 | Tests against source | L | RF2A → RF2B → RF2C | done |
| RF3 | Shared vocabulary: types, constants, rules | L | RF3A → RF3B → RF3C → RF3D → RF3E → RF3F → RF3G | done |
| RF4 | Module splits | L | RF4A → RF4B → RF4C → RF4D → RF4E → RF4X → RF4F → RF4G → RF4H → RF4I → RF4J | done |
| RF5 | Runtime deduplication | L | RF5A → RF5B → RF5C | done |
| RF6 | Admin editor structure | L | RF6A → RF6B → RF6C → RF6D | done |
| RF7 | CLI and developer scripts | L | RF7A → RF7B → RF7C → RF7D | done |
| RF8 | Documentation | L | RF8A → RF8X → RF8Y → RF8B → RF8C | done |
| RF9 | Test foundation | L | RF9A → RF9B → RF9C → RF9D → RF9E → RF9F | planned |

**Order rationale:** RF1 first because deleting obsolete scripts and tests
shrinks everything that follows (fewer `.test.mjs` files to convert, fewer
docs to re-index). RF2 second because every later step is a sequence of small
moves verified by tests, and today each test run rebuilds the dependency chain.
RF3 precedes RF4 so that the file splits move one definition, not five copies.
RF5 follows RF4 because the shared reader lands in a `db` package that has
already been split by resource. RF6 and RF7 touch disjoint files from RF3–RF5
and may run in parallel sessions with them. RF8 is last because §15 and §16 of
the architecture describe ports and runtime deltas that RF4 and RF5 change.

**RF4X insertion (2026-11-04):** an owner-requested audit of RF1–RF4E found
that the layout and test-typing rules were enforced only by convention and that
RF2 had left the `verify:*` runners pointing at removed tests. RF4X adds the
guards before RF4F and RF5 split more modules.

**Second audit follow-up (2026-11-05):** after RF4G the owner asked to plan
every remaining audit finding. RF3E–RF3F finish the shared vocabulary and
error model, RF4H–RF4J split files near the ceiling and adopt the layout in the
remaining flat packages, RF5 and RF6C/RF7 gain the scope listed in their
sessions, and the new RF9 owns test infrastructure. Order: RF3E → RF3F →
RF9A → RF9B before RF5, because RF5 rewrites security errors and ports under
tests that must already be typed and source-resolved; RF4H–RF4J may run in
parallel with RF3E–RF3F; RF9D–RF9F type platform and CLI tests only after
RF5 and RF7C move them. Owner checks without a session are listed in §5.

**RF8X/RF8Y insertion (2026-11-08):** while RF8B was being specified the
owner decided that rc1 is the oldest supported state (owner decision 11).
RF8X removes the runtime support for older data and schemas, RF8Y removes
release history from specifications and documentation; RF8B then reorganizes
specifications that describe only the current product.

**RF3G insertion (2026-11-07):** RF3E left the contracts and content JSON
validators with two differing array cases. The owner chose the content rule,
and RF3G applies it before RF9A.

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
   template's fixtures (`0.35.0`) are kept as the upgrade origin. Amended
   2026-11-08 by decision 11: the origin is rc1 (template `0.46.0`).

Decided 2026-11-08 while specifying RF8B:

11. Only the owner uses Lace, so `0.1.0-rc1` is the oldest supported state.
    Support for older block versions, configuration hashes, export formats,
    database migrations, templates and releases is removed, not kept for
    compatibility (RF8X code, RF8Y specifications and documentation). Block
    definition and export format version numbers stay as they are, and the
    migration mechanisms stay for future versions. The 16 Drizzle migrations
    are squashed into one baseline; the owner recreates the rc1 database.

Pending owner checks from the second audit (2026-11-05), not sessions:

8. Run `pnpm verify:security`, `pnpm verify:cross-runtime --baseline …` and
   `pnpm verify:operations` once after the RF4X runner repair.
9. Resolved 2026-11-08 by the rc2 changelog entry (`prepare-rc2-release`).
   Decide the CHANGELOG entries for unreleased public changes since rc1:
   RF3D (MCP account and rate-limit codes, `RATE_LIMITED`), RF4C
   (`hasMatchingBlockDefinitions` matches by type in any order) and RF4B
   (`AccountSecurityPort` reshaped; `SessionSecurityPort`, `TokenSecurityPort`),
   RF3E (OpenAPI describes the admin entry-list and media-list `limit` as
   1–100, the range the server already enforced; a public collection slug
   over 100 characters returns `422` at `/slug`; four contracts `…Source`
   inputs became required), RF3F (an unexpected failure during setup
   returns `500` instead of `404`), RF3G (the exported contracts
   `jsonValueSchema` and `jsonObjectSchema` refuse an array with a named
   property and accept a non-enumerable array element) and RF9B (the
   published `@lacecms/platform-node` no longer exports `./test`).
10. Resolved 2026-11-08: `allow-supported-node-release-preparation` is
    withdrawn; `prepare-rc2-release` accepts Node 24 or later for preparation
    and keeps pnpm pinned to `12.3.4`.

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
  `valueKind`, `sortableAs`, `filterKind`, `searchable`, `itemLabel`.
  `FIELD_FILTER_OPERATIONS` owns the per-filter-kind operators.
- Derive from it and delete: `LIST_FIELD_TYPES` and `SEO_TEXT_FIELD_TYPES`
  (`packages/config/src/index.ts:36-53`), `hasValidListFields`'s inline list
  (`packages/contracts/src/index.ts:378-399`), `scalarTypes`, the placeholder
  list and the default-value kinds in `packages/contracts/src/field-openapi.ts`,
  `CollectionQueryFieldType` (`packages/application/src/collection-queries.ts`)
  and the `strings` set with `datetime` special cases in
  `packages/db/src/collection-list.ts`.
- Admin: one `fieldTypeSupport: Record<FieldDefinition["type"], {problem, listCell, filter, summary, guidance, draftValue}>`
  in `apps/admin/src/entities/content/field-types.ts`, consumed by
  `editor-form.ts`, `widgets/collection-entries/list-columns.ts`,
  `CollectionFilters.tsx`, `item-summary.ts`, `composite-values.ts` and
  `field-guidance.ts` and `widgets/block-editor/block-presentation.ts`, so a new field type fails to compile until every
  surface declares support.
- A contracts test asserts that `contentMetadataOpenApi` accepts exactly the
  descriptors `normalizeFieldDefinition` accepts.

**Architecture and specs:** §8 *Initial field types* gains the capability
table; `field-descriptors` (capabilities declared once),
`collection-query-options`, `rest-contracts`.

**Acceptance:** adding a dummy scalar field type reports errors only in
`content`, the admin support table and built-in control declarations. Owner
decision (2026-11-02): correct existing OpenAPI drift (`embedProviders`, group
and block `layout`, block `settingsLayout`) with one `FormLayout` schema.
`apps/api/openapi/api-v1.json` changes only in descriptor schemas; parity has
no known-gap exceptions.

### Session RF3B — Shared identifiers and limits

- Move to `packages/content`: slug and route canonicalization
  (`packages/config/src/index.ts:508-568` and
  `packages/domain/src/index.ts:466-530` are twins), `SLUG_PATTERN`,
  `ContentModelKind`, and the transport limits that application and contracts
  each declare (`MAX_MEDIA_SEARCH_LENGTH`, `MAX_MEDIA_USAGE_ENTRIES`,
  `MAX_BUILD_EXPORT_PAGE_SIZE`, entry search length). `config`, `domain`,
  `application` and `contracts` keep existing public names through imports or
  re-exports; contracts additionally re-exports `SLUG_PATTERN` for server.
- The eleven `*Source` interfaces in contracts that mirror application types
  stay (the boundary forbids the import), but each gains a compile-time
  `satisfies` check in `packages/test-utils` (which may import both), and
  `toContentModelDto` is built from a total projection table so a new optional
  property cannot silently drop out of the DTO. All eleven pairs are checked,
  including each media-usage discriminant; only public media has an explicit
  private-property omission list. Serialized key order stays unchanged.
- Deduplicate `deepFreeze`, `isPlainObject` and `isRecord` through
  `@lacecms/content` exports (`isRecord` already had only one definition).
  Keep `fail` local until RF3D: these helpers throw four different error
  classes, so sharing them now would add an unnecessary error factory.

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

### Session RF3E — Identifier grammars, limits and mirror checks

Behavior-touching: corrects two contract drifts.

- `@lacecms/content` exports the remaining shared grammars and limits and
  every copy imports them: field key (`FIELD_KEY_PATTERN`, today 13 copies
  outside its owner in six packages, including the sort grammar and OpenAPI
  strings), block type (`BLOCK_TYPE_PATTERN`; config's same-named
  `BLOCK_KEY_PATTERN` copy is replaced), model key (`MODEL_KEY_PATTERN`; the
  admin router accepts a leading digit config refuses), title length
  (`MAX_TITLE_LENGTH`, seven bare `maxLength(200)` in contracts), page size
  (`MAX_PAGE_SIZE`, `DEFAULT_PAGE_SIZE`), draft media references and the
  link-resolve batch (200) and `VIDEO_EMBED_PROVIDERS`.
- `@lacecms/domain` owns the media-tag rules (pattern, 40-character length,
  200 code points per raw tag before normalization, 20 tags per item, 5
  filter tags) and the display-name rule (120 characters, no control
  characters), beside their existing normalizers; contracts re-exports them
  for the admin.
- Drift fixes: the entry-list and media-list `limit` contracts and OpenAPI
  agree with the server's 1–100, default 50 (owner decision 2026-11-05: the
  server's current range is canonical); the public collection route applies
  the full slug rule, so an over-long slug returns `422`. Correction found
  while writing the specification: the media upload tag `maxLength: 200` is
  the specified bound before normalization, not drift, and stays as the named
  constant `MAX_MEDIA_TAG_INPUT_LENGTH`.
- Admin field-type subsets (`groupedFieldTypes`, counted text types) and the
  filter control become `fieldTypeSupport` columns; presence operators get
  one declaration (`FIELD_PRESENCE_OPERATIONS`); one portable
  `fieldFilterValueFailure` replaces the application and admin value checks;
  config's three display-only key lists become one.
- Renamed predicate `isRecord` copies (application, admin,
  platform-cloudflare) import the content helper; contracts `isJsonValue`
  delegates to content if a parity test shows identical accepted sets. The
  CLI copies and the exhaustive CLI block scaffold switch move to RF7C,
  because the CLI may not import content.
- `*Source` mirror checks become total: every contracts export ending in
  `Source` is enumerated, keys are compared both ways including optionality,
  and nested objects (`seo`, `seoDefaults`, `usage[]`) are compared.
- `tests/shared-vocabulary.test.mjs` matches grammars and numeric limits by
  pattern, not only declaration names, and exempts lines by symbol, not by
  exact text.

**Specs:** `field-descriptors`, `rest-contracts`, `collection-query-options`,
`media-use-cases`, `content-domain-rules`.

### Session RF3F — Error codes follow-up

Behavior-touching where noted.

- A stale synchronization plan carries its own code
  (`CONFIGURATION_SYNC_STALE`) instead of `CONTENT_INVALID_STATE` plus a
  message search; `platform-node/src/content-sync.ts` and the CLI check the
  code. No transport applies a plan, so the code is internal (500 if it ever
  reached HTTP), not 409 as first planned.
- Setup and user-lookup failures in both security adapters become
  `AccountError("NOT_FOUND")`, the documented 404 with the envelope the setup
  route already returns, so setup outcomes keep one uniform 404 (owner
  decision 2026-11-05); the route's catch-all goes, and an infrastructure
  failure during setup becomes `500` instead of a misleading 404.
- Pass-through checks in `db/shared/*` and `platform-node/image-inspector.ts`
  test `instanceof LaceError`, so `InvariantError` and `AccountError` are not
  rewritten to `CONTENT_INVALID_STATE`.
- Contracts header and precondition parsers throw `ContractValidationError`;
  the server's bare `catch {}` around them is removed.
- Server composition and capability failures throw `InvariantError`; the
  server-local `AuthorizationError` is distinguished by code, not class; the
  rate-limit middleware throws `RateLimitExceededError` so 429 comes only from
  the classifier.
- Node and Cloudflare object-storage and environment errors share bases that
  extend `LaceError` (`STORAGE_UNAVAILABLE`, environment configuration).
- Carried from RF3E, not part of `rf03f-error-codes-follow-up`: contracts
  `isJsonValue` and content `normalizeJsonValue` accept different sets. An
  array with a named property is accepted by contracts only; an array with a
  non-enumerable element is accepted by content only
  (`tests/json-validator-parity.test.mjs`). Resolved by RF3G.

**Specs:** `rest-contracts`, `configuration-synchronization`,
`browser-first-admin-setup`, `authentication-and-actor-boundary`.

### Session RF3G — One portable-JSON rule

Behavior-touching: contracts accepts exactly the content set.

- Owner decision 2026-11-07: the content portable-JSON rule is canonical,
  because it matches `JSON.stringify`. An array with a named property loses
  that property when serialized, so it is refused; a non-enumerable array
  element is serialized by index, so it is accepted.
- `@lacecms/content` exports one non-throwing check beside
  `normalizeJsonValue`, and both use one walk. Contracts `jsonValueSchema`
  and `jsonObjectSchema` call it, and the contracts `isJsonValue` copy goes.
- The walk is iterative. Today content normalization throws `RangeError` on
  values nested about 10,000 levels deep, while contracts accepts any depth
  that `JSON.parse` produces. Adopting the recursive rule unchanged would
  turn a deep request body into a stack overflow.
- `tests/json-validator-parity.test.mjs` expects no difference.

**Specs:** `rest-contracts`, `field-descriptors`.

## Step RF4 — Module splits

**Size:** L (eight sessions). **Depends on:** RF2 (tests on source) and RF3
(so splits move one definition).

**What:** no source file above roughly 1,000 lines; each module has one
responsibility and one owner section in the architecture. Every session is a
pure move: `index.ts` re-exports, public API unchanged, existing tests pass
with import paths only. Follow architecture §6 *Source layout*: domain directories,
no subdirectory barrels, one-way dependencies including type imports, and tests
beside modules. RF4B–RF4F map their modules into domain directories and delete
their split files from `scripts/oversized-source-baseline.json`; RF5/RF6 do the
same for their files. The guard permits legacy files to shrink but never grow.

### Session RF4A — `@lacecms/content`

`packages/content/src/index.ts` (3,881 lines after RF3) becomes an explicit
re-export entry over `shared/` (JSON, errors, identifiers, objects), `fields/`
(capabilities, definitions, builders, layout, visibility, validation, rich text,
video embeds, link tokens, schema paths), `references/` (media, internal links,
field paths), `blocks/` (definition, list layout, built-ins), and `entries/`
(aggregate, canonical JSON, list-query policy). Dependencies run one way:
`shared ← fields ← references, blocks ← entries`; no module cycle, including
types, is permitted. `publishedBlockData` belongs to the block definition;
`BlockDataValues` and `FieldVisibilityTargets` belong to field definitions,
where group value inference needs them (owner-confirmed apply refinement).
The 1,000-line ceiling applies to every module; existing leaf modules move
with their history. The monolithic runtime test splits into twelve companions,
and type tests into six, gated by the ordinary package `typecheck`.

### Session RF4B — `@lacecms/application`

The package entry re-exports concrete modules from `shared/`, six capability
port modules, and the content, media, accounts, builds, outbox and configuration
directories. The three oversized application files leave the size baseline:
`index.ts`, `content-use-cases.ts`, and `configuration-sync.ts`. Content use
cases split into inputs, draft normalization and commands; configuration types
and limits break the former type cycles, and the synchronization implementation
splits into support, decisions, plan, report and apply modules.

`SecurityService` combines `UserProfileReader` with three disjoint ports:
account owns setup completion, bootstrap, users, invitations, resets and profile
and password changes; session owns session listing and deletion; token owns setup,
build and import credentials. Account use cases require the profile, account and
session ports. The configuration decision table preserves the breaking-change
precedence before dispatching by structural change kind.

The existing test companions move beside their modules without changing case
titles. Architecture §15 records the actual infrastructure interfaces.

### Session RF4C — `@lacecms/contracts`

`packages/contracts/src/index.ts` becomes the entry for 36 concrete modules in
`shared/`, `errors/`, `openapi/`, `content/`, `media/`, `delivery/`, `builds/`,
`accounts/` and `settings/`. The directory layout corrects the original seven
flat-file plan to follow §6 and give delivery and shared primitives an owner.
Imports follow the one-way direction recorded at the entry and are acyclic.
`hasMatchingBlockDefinitions` matches exactly one definition per allowed type
in any order; duplicate allowed types with definitions are rejected. Tests move
beside their modules while preserving existing case names.

### Session RF4D — `@lacecms/server`

`index.ts` is the only production module at the source root. The server is
organized as `shared/`, `runtime/`, `security/`, `composition/`, `routes/`
and `app/`, with dependencies directed from shared helpers through runtime
and security, composition and routes to the app factory. `createLaceApp`
keeps construction, `onError`, the five middlewares and route registration.

The route registrations live in `routes/{protocol,health,setup-session,accounts,admin-users,credentials,builds,media,content,public,docs}.ts`.
The protocol and health modules own the MCP/OAuth pass-throughs and probes;
credentials owns build and import tokens and the import credential. The
`RouteContext` holds closures over the app input, including the session summary
shared by account and session routes; pure response helpers and DTO mappers
are module imports. The multipart and build-export parsers live beside their
routes as `routes/media-upload.ts` and `routes/build-export.ts`, and media
binary helpers live in `routes/media-binary.ts`. One protocol error helper
preserves the existing path predicates and response headers.

The RF2B route companions now live beside their modules, with middleware tests
in `app/`, import coverage in `security/` and build-site and email tests in
`runtime/`. The shared fixture stays in `src/test-support/`.

### Session RF4E — `@lacecms/db` and `@lacecms/config`

`db` uses `shared/`, `schema/`, `security/`, `links/`, `content/`, `media/`,
`delivery/`, `builds/`, `publication/` and `sync/` directories; `config` uses
`shared/`, `models/`, `structure/` and `configuration/`. Their root entries
retain the public exports. Test companions follow the `db` modules and the
Worker-safety test scans the whole production tree.

The original flat SQL split omitted synchronization, public delivery, outbox
and build export; domain directories provide owners. Drizzle's `check` alone
only validates migration snapshots, so `pnpm db:check` also detects pending
schema changes using a disposable copy and runs during lint. The owner chose to
include the oversized `config` entry here and schedule the remaining seven
`test-utils` files as RF4F. Splitting the Drizzle schema changed DDL ordering;
the specified fallback retains the unchanged tables in `schema/tables.ts`,
with byte-identical export and no pending migration. The config entry explicitly
exports its public types so its internal `CommonModelInput` stays private.

### Session RF4X — Workspace guards

Inserted after the RF1–RF4E audit. The boundary checker gains a shrinking
`@ts-nocheck` baseline for test files (test-support modules may not disable
type checking), a per-member module-cycle check with a strongly connected
component baseline, and `scripts/source-layout.json` directory rules, barrel
and root-module checks for the six split packages. The `verify:*` runners run
package suites through package configurations and name only existing tests,
guarded by a root path scan; `verify:cross-runtime` requires `--baseline`.
`config` and `domain` type tests join `typecheck`, Turbo test inputs cover
files read outside packages, and lint denies warnings. Admin source-test
resolution, typing the legacy tests and RF3 vocabulary duplicates are separate
follow-ups.

### Session RF4F — `@lacecms/test-utils`

Split the repository contract, in-memory store and security contract by domain,
removing the seven remaining `test-utils` files from the oversized baseline.
Preserve registration order, public exports and both runtime contract suites; add
one security case-name pin. Split
the test-utils and config monolithic tests into typed companions, remove their
two typecheck exceptions, remove the repository contract barrel and declare the
test-utils directory dependencies in `scripts/source-layout.json`.

### Session RF4G — `@lacecms/domain` and `@lacecms/auth`

Added after the RF4X audit. Both packages keep `index.ts` as their only root
production module. `domain` moves its 882-line entry into `shared/` (brands,
errors, internal failure helpers), `access/` (actors, permissions, account and
rate-limit errors), `media/`, `builds/` and `content/` (routes, blocks,
collection queries, SEO, entries); `seo.ts` takes `Brand` from
`shared/brands.ts`, which breaks the `index ↔ seo` cycle. `auth` moves into
`shared/`, `session/` (the Better Auth boundary), `import/` and `mcp/`; a
type-only `mcp/provider.ts` breaks the `consent ↔ boundary` cycle. Both
packages join `scripts/source-layout.json`, their cycle components leave the
baseline (5 → 3) and their monolithic tests become typed companions (typecheck
exceptions 139 → 137). Runtime keys, declaration names and test titles are
unchanged. The audit's platform-node `client-address.ts` "duplicate" does not
exist: that module imports `normalizeClientAddress` from `@lacecms/auth` and
adds only the Node trusted-proxy policy, so nothing is removed.

**Acceptance (all RF4 sessions):** `pnpm build` export lists are identical to
the baseline; `pnpm test` case counts are unchanged; `check-boundaries`
passes; no source file in the session's package exceeds 1,000 lines.

### Session RF4H — Modules near the ceiling

Split the near-ceiling application and content modules without changing their
public exports or behavior. Configuration owns `structure-diff`,
`structure-hints`, `evidence`, model state, diagnostics, snapshot counts and
plan results; dispatcher lease contracts move to `ports/outbox.ts`. Content use
cases delegate draft validation and publication projection while retaining the
per-instance visibility cache. Media separates types, upload, metadata, limits
and projection from orchestration. Field scalar builders are independent of
composite normalization, with metadata in its own module; blocks separate
field normalization, settings, registry, migration, types and grammar. The
vocabulary guards follow the new canonical settings and grammar owners.

Typed configuration and media fixtures support the split tests; the four former
`@ts-nocheck` test files leave the baseline (136 → 132). Existing titles and
export names are unchanged. During typing, projection-only sync assertions
were corrected to inspect `plan.isValid` and writes for actual operations;
select-card field validation now passes its mode in the proper argument slot.
The largest production file in the touched packages is below 1,000 lines.

### Session RF4I — Drizzle schema by domain

`db/src/schema/tables.ts` (862 lines, the RF4E fallback) splits by domain.
The invariant becomes "`pnpm db:check` reports no pending migration and the
snapshot is unchanged" instead of byte-identical `drizzle-kit export` text;
if Drizzle still reorders output, the domain modules are listed in
`drizzle.config.ts` in the original table order. Also gives the outbox rows an
`outbox/` owner and drops the re-export-only `shared/literal-like.ts`.
Outcome (2026-11-07): ten table modules plus `columns.ts` and
`better-auth.ts`; `pnpm db:check` passes with `drizzle/` unchanged, and the
export differs only in statement order. The check script now generates
through a copied configuration, because Drizzle Kit's CLI accepts one
`--schema` path.

### Session RF4J — Remaining flat packages

Adopts §6 in `sdk` (client vs published-site), `render`, `create-lace`,
`apps/api` and `apps/builder` where a package has a second concern, and
records an explicit single-concern exemption otherwise. Small leftovers ride
along: contracts module tests import their module instead of the package
entry, the `config` packaged test pins declaration names, `apps/api` drops its
stale `fileParallelism: false`, and `apps/docs` records its JavaScript test
exception.
Outcome (2026-11-08): `sdk` (`client/`, `site/`), `create-lace` (`site/`,
`template/`, `generator/`, `cli/`), `apps/api` (`config/`, `dispatch/`,
`server/`) and `apps/builder` (`runner/`, `server/`) join
`scripts/source-layout.json`; `render` is recorded in the new
`scripts/source-layout-exemptions.json` as the single-concern render core.
Directly started app modules stay at `src/` root through the new
`scripts/source-root-entries.json`, so operator command paths and the
generated project are unchanged. The checker now rejects unlisted
non-packaged JavaScript tests. Runtime keys, declaration names and test
titles are unchanged; the typecheck baseline keeps 132 entries (moved paths
renamed). The `config` declaration pin parses the emitted entry text,
because TypeScript 7 ships no JavaScript compiler API.

## Step RF5 — Runtime deduplication

**Size:** L (three sessions). **Depends on:** RF4E (split `db`), RF2C (split
contract suite), RF9A–RF9B (tests resolve from source and share typed
fixtures).

**What:** Node and D1 share every read path and every row mapper; the write
paths stay runtime-specific but their known semantic differences are either
aligned or recorded.

### Session RF5A — Shared security rows

Move the verbatim row mappers (`role`, `user`, `profile`, `invitation`,
`session`, `buildToken`), `normalizedEmail`, `isUniqueViolation`,
`INVITATION_COLUMNS_SQL` and `ACTIVE_INVITATION_SQL` from
`packages/platform-node/src/security.ts` and
`packages/platform-cloudflare/src/d1-security.ts` into
`packages/db/src/security/rows.ts`, following the existing
`packages/db/src/security/api-tokens.ts` pattern. `digest`, `tokenSecret` and
`randomHex` stay platform-local. `security-contract` (17 cases per runtime;
the audit's 22 was an overcount) guards both.

Added by the second audit: the verbatim rate-limit policy table and
`setupExpiryMs` become one `Record<SensitiveRateLimitOperation, Policy>` in
application; each security adapter splits by port
(`security/{account,session,token}.ts`), which keeps `d1-security.ts` (978
lines) under the ceiling; server credential routes take `TokenSecurityPort`.

**Outcome (RF5A):** `packages/db/src/security/rows.ts` owns the mappers under
value names (`securityRole`, `managedUser`, `userProfile`,
`invitationRecord`, `sessionRecord`, `buildTokenMetadata`) plus
`normalizedEmail`, `isUniqueViolation` and the two invitation fragments;
application owns `SENSITIVE_RATE_LIMIT_POLICIES` (beside the operation type)
and `SETUP_TOKEN_TTL_MS` (beside the other account TTLs; the setup lifetime is
not a rate-limit policy). Each platform has `src/security/{account,session,token,secrets}.ts`
(D1 also `statements.ts`); `NodeSecurityService` (202 lines) and
`D1SecurityService` (215) stay in their files and delegate, so platform
exports and `dist/d1-security.js` are unchanged. The shared `managedUser`
uses D1's `Number(row.disabled) === 1`.

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

Added by the second audit: both platform packages adopt the §6 layout and
join `scripts/source-layout.json`; the three `platform-node` cycles
(`index`, `runtime`, `content-repository`) and the two oversized repository
entries leave their baselines.

**Outcome (RF5B):** `packages/db/src/reads/content-reader.ts` (472 lines)
owns every read that was identical on both runtimes — media, delivery,
entry hydration, actors, site-build reads, the link reads (through
`SqlContentLinkReader`) and the build export. A runtime supplies
`ContentReadSql` (`all`, `bindChunk`, `readGroups`); `readGroups` runs the
export's two read groups in one SQLite transaction on Node and as two
`batch()` calls on D1, so Node issues one extra in-transaction version read
(the `index.test.ts` statement bound is 8). Each repository is a delegating
composite over a reader and area classes (`configuration-sync`, `entries`,
`media`, `dispatch`, `site-builds`, D1 also `collection-list`) that extend a
base holding the shared write helpers; bodies moved verbatim. Remaining
runtime-specific reads: `list`, the configuration-sync scans and Node's
synchronous entry loader for reloads inside publication transactions (for
RF5C's return-path alignment). Layout: `platform-node` `database`,
`security`, `media`, `builds`, `repository`, `runtime` (root `migrate.ts`
listed as a started entry); `platform-cloudflare` `d1`, `security`,
`media`, `deploy`, `repository`, `runtime`. `security.ts`/`d1-security.ts`
are now `security/service.ts`, `release-version.ts` is generated into
`src/runtime/`. Platform export keys and declaration names are unchanged.

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
- Added by the second audit: `composeLaceServices` builds `AccountUseCases`
  instead of the lazy `RouteContext.accounts()`; `RouteContext` splits into
  actor resolution and capabilities and stops exposing the raw app input to
  route modules; server consumers depend on the narrow security ports.

**Architecture and specs:** §16 gains a "runtime deltas" table; ADR 0002 is
amended; `content-repository-contracts` gains the two contract cases.

**Outcome (RF5C):** Node adopts the D1 claim statements (payload-guarded
site-build lease) and both runtimes cap claims through shared application
constants: `MAX_DISPATCHER_CLAIMS_PER_CALL` (20) and
`MAX_SITE_BUILD_CLAIMS_PER_CALL` (10). The new contract case found that D1
capped site builds at 20 although each claim adds four batch statements, so
more than ten recoverable events exceeded the 40-statement budget. Node checks
a stale revision before link targets (D1 order). The D1 publication
prediction omitted the draft's `seo`, so D1 publish results and their stored
replays lacked it; fixed and pinned by "returns publication and unpublication
results equal to a later load". `mutation_guards` stays on Node as the
in-transaction dirty token of the shared sync link statements. Architecture
§16 lists every remaining delta; ADR 0002 has an RF5C amendment.
`packages/server` `composeLaceServices` builds the use cases (accounts eagerly
on the composed clock) and the complete `createLaceApp` input;
`SensitiveRequestRateLimiter`, `contentModelResolver` and
`parseRuntimeFeatureFlags` replace the runtime copies. `RouteContext` is
`{ actors, capabilities }`; routes no longer read the app input and reach
security through `accountSecurity()`, `tokenSecurity()` or `profiles()`; the
import-actor resolver takes `TokenSecurityPort`. Platform export keys are
unchanged; delta specs: `content-repository-contracts` (1 added),
`node-content-repositories`, `d1-content-repositories` (1 modified each) and
`hono-app-factory` (1 added).

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
  renderer-specific types). Content field support stays in `content`; shared
  type contracts live in `shared/editor-contract`. The entry page composes
  content operations and the rich-text control into the editor; same-layer
  imports remain forbidden. Existing tests keep their behavior assertions and
  add the explicit provider required by composition, as well as updating
  imports; this refines §2's import-only test-move gate for this session.
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

Added by the second audit: the session first makes the RF3A pointer-drag case
in `composites.e2e.ts` pass at the default 1280×720 viewport (it currently
needs an enlarged viewport), because the acceptance above requires it
unchanged. Whether admin `test:e2e` joins CI is settled while writing the
specification.

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

### Session RF7C — CLI source layout

`packages/cli/src` (48 root production modules, the `index ↔ diagnostics`
cycle) adopts §6 after RF7B's command table gives commands one shape: command
modules by area, shared flag parsing, doctor/preflight, blocks, import,
upgrade and database transports. Untyped root `.mjs` test helpers
(`import-api`, `import-fixtures`, `upgrade-fixtures`) move to
`src/test-support/` as TypeScript. `cli` joins `source-layout.json` and leaves
the cycle baseline. The CLI's renamed `isRecord` copies get one CLI-local
helper and the block scaffold switch becomes exhaustive (moved from RF3E,
because the CLI may not import content).

### Session RF7D — Naming hygiene

Finishes RF1A's naming rule: `scripts/journeys/rc1-media-selection.mjs` and
release- or step-numbered log and stage strings (`Alpha.6`, `Alpha.2 field-trial
§1 (33A)`) are renamed by behavior; roadmap change codes (`CE9A`, `LIST1`,
`SM1`…) leave test titles, temp prefixes and the pinned contract case names
(updating both pins). The template fixtures are settled by RF8X (rc1 is the
only upgrade origin). The root naming guard extends to test titles.

## Step RF8 — Documentation

**Size:** L (five sessions). **Depends on:** RF4B and RF5C for the
architecture sections they change; RF1B for the index.

### Session RF8A — Architecture document

- Remove change codes (`CE7D`, `SM5`, `LIST1`, `MCP2`…) from headings and
  prose of the architecture document; a "History" appendix maps each code to
  its archived change. The body states current behavior only.
- §24 *Decisions captured by this document* moves into ADRs (new ADRs only
  where none exists); the section becomes a pointer to `docs/adr/README.md`.
- §15 is reviewed against the ports RF4B already recorded and RF5 changes; §16 gains the runtime
  deltas table from RF5C; §6 lists the new module layout rules (file size
  ceiling, one responsibility per module).
- Target size: under 2,500 lines without loss of invariants (a review
  checklist in the change lists every invariant and where it now lives).
- Added by owner request (2026-11-08): two Mermaid diagrams in the
  architecture document. A backend component diagram shows the packages of
  the §6 dependency rules, the application ports and their Node and D1
  adapters (shared `db` reader and rows, per-runtime repository areas,
  security, storage, build triggers, outbox dispatch) and the RF5C
  composition (`composeLaceServices`). A table diagram (`erDiagram`) shows
  every Drizzle table in `packages/db/src/schema/` with its keys and
  foreign-key relations. A root test fails when a schema table is missing
  from the table diagram, so the diagram cannot drift silently.

**Outcome (RF8A):** by owner decision the architecture became the directory
`docs/architecture/`: a `README.md` (§1–§4, §24, §26 and a section map) and
twelve domain files, keeping section numbers §1–§26. Prose outside Mermaid
blocks fell from 4,086 to 2,492 lines (ceiling 2,500, files under 600). The
invariant checklist of `rf08a-architecture-document` maps 1,181 statements:
576 kept, 522 replaced by pointers to named spec requirements, 51 in ADRs and
32 history. §24 became ADRs 0021–0028. `history.md` maps each former change
code to its archived change. The table diagram (§9.10) covers all 36 Drizzle
tables and the component diagram sits in §15.

### Session RF8X — rc1 baseline

Owner decision 11, code side. Behavior-touching; delta specs.

- The 16 Drizzle migrations become one baseline migration generated from the
  declared schema, identical on Node SQLite and D1. A database migrated by an
  earlier engine is refused with a diagnostic that tells the operator to
  recreate it, instead of a failed `CREATE TABLE`; `lace doctor` reports it.
  Per-migration upgrade tests go; the schema requirements describe tables,
  not migration steps.
- Built-in block identity migrations (`image` 2–4, `gallery` 2–5,
  `videoEmbed` 2) are removed; definition versions stay. A stored built-in
  block below its version fails with the existing `missing_step` diagnostic.
  The block migration mechanism stays for custom blocks.
- `legacyStructureHash` and the legacy public-identity hash proofs leave
  configuration synchronization; a model without a trusted public identity
  takes the conservative path.
- The build export requires `globals` and `seo` in the assembled schema; the
  tolerant variant no longer accepts format 1.
- The upgrade planner requires the manifest site record.
- Template upgrade fixtures: `template-0.35.0` and `template-0.39.0` are
  replaced by `template-0.46.0` (rc1), generated by the rc1 generator.
- Internal documents that name a removed migration describe the baseline.

**Acceptance:** `pnpm db:check` passes on the baseline; fresh Node and D1
databases pass the repository contracts; a pre-baseline database is refused
on both runtimes; the template upgrade acceptance passes from rc1.

**Outcome (RF8X):** `0000_baseline.sql` replaces the 16 migrations; a
`sqlite_master`/pragma/row comparison found three hand-written security indexes
and the `content_link_state` seed row outside the declared schema, which are
appended to the generated SQL. Pre-baseline ledgers are refused by
`lace db migrate` (`SCHEMA_UNSUPPORTED`, exit 5, before Wrangler runs), doctor and
readiness. By owner decision during apply the template advanced to `0.47.0`:
its upgrade instructions keep only the rc1 step (recreate the database), and
upgrade tests from pre-rc1 templates were removed. ADR 0029 records the
decision.

### Session RF8Y — Release history out of specifications and documents

Owner decision 11, specification and document side. Release- and
template-numbered requirements (`alpha-release-artifacts`,
`project-generator` "Template 0.2x delivers …", `public-documentation`,
`prepublication-consumer-security`, `generated-project-acceptance`) are
removed when they only described a past release, or renamed and rewritten as
current behavior. `docs/compatibility.md`, `docs/alpha-release.md` and the
public upgrade guidance keep only rc1 and later. Moved here from RF8B.

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
- Architecture pointers name capabilities and requirement titles (RF8A
  checklist); a capability split or requirement move updates the links in
  `docs/architecture/` in the same change.
- RF8A found spec text that disagrees with code or with itself; fix it here:
  `block-source-registry` gives `image` revision 6 and `hero` revision 4 (code
  7 and 5) and a seven-block registry (nine items), `rest-contracts` both
  rejects and tolerates a first export page without `globals`/`seo`, and spec
  text still carries roadmap codes (`CE10`); release-scoped wording is
  handled by RF8Y.
- Decided 2026-11-08: gallery requirements move to a new `gallery-block`
  capability; `admin-draft-editor` keeps a thin core (layout, read-only
  viewers, validation summary, global editor, unsaved drafts and saving) beside
  the four sub-surface capabilities.

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

**Outcome (RF8C):** `en/latest` grew from 20 to 26 pages: new
`reference/configuration`, `reference/mcp`, `operations/mcp`,
`content-modeling/links` and `astro-integration/styling`; every existing route
kept. `tests/docs-reference.test.mjs` derives CLI commands and flags, `LACE_*`
settings, configuration options, field builders, the 58 REST paths and MCP
tools/scopes from shipped artifacts and passes. Every page declares `kind` and
`verifiedAgainst` (`0.1.0-rc2`); `check.mjs` enforces the guide template and
the footer. Eight notes were promoted and deleted (`composite-fields`,
`field-guidance`, `form-organization`, `mcp`, `media-tags`,
`rich-text-authoring`, `site-styling`, and the owner's superseded
`personal-site-guide`); seven were trimmed to engineering content, two only
re-pointed, and every remaining note names its public owner in `docs/README.md`. Owner decisions (2026-11-12): delete
the personal site guide, write the REST reference by hand, footers reject
alpha versions. Settled questions: no pinned version route during
prereleases; generated consumer guides stay unpublished template assets.
During apply the permanent compatibility guide stopped repeating the upgrade
steps (modified upgrade-guidance requirement), and build-export paging moved
to the API reference.

## Step RF9 — Test foundation

**Size:** L (six sessions). **Depends on:** RF4X guards. RF9A–RF9B precede RF5;
RF9D–RF9F follow the sessions that move the tests they type.

**What:** every test resolves workspace packages from source, shares one typed
fixture layer, stays under a size ceiling and is type-checked; the
`@ts-nocheck` baseline (137 files after RF4G) reaches zero.

### Session RF9A — Source resolution for admin and typecheck

`apps/admin` unit tests (198 files) and every package `tsconfig.test.json`
resolve `@lacecms/*` to source instead of `dist/`, so `pnpm --filter
@lacecms/app-admin test` passes on a clean checkout and test typecheck no
longer needs a build. Owner decision 2026-11-05: a `source` export condition
(with `customConditions` and Vitest `resolve.conditions`) replaces the alias
table. Settled by the specification (2026-11-07): release preparation strips
the condition, so packed export maps stay exactly as today, and the boundary
checker requires the condition on every `dist/` export. Owner decision
2026-11-07 during apply: the condition is named `@lacecms/source`, because
`eventsource` and `eventsource-parser` already declare a bare `source`
condition that TypeScript and Vitest's forwarded Node `--conditions` would
follow. Vitest applies it through a shared plugin for workspace specifiers
only, and the admin adds that plugin in test mode only.

### Session RF9B — Typed fixture layer and helper consolidation

One typed fixture layer in `@lacecms/test-utils`: actor and role builders
(today redefined in application, server, contracts and test-utils), branded
id fixtures and partial port fakes. Untyped `.mjs` helpers under `src/`
(`d1-test-harness.mjs`, `apps/api/src/worker-bundle-harness.mjs`) become typed
`test-support` modules; the repeated Node runtime setup in platform-node and
`apps/api` product tests becomes one `test-support/node-runtime-harness.ts`;
`createTestActorResolver` moves out of the production `@lacecms/platform-node/test`
subpath if no consumer needs it published. Turbo test inputs narrow once
resolution follows dependency edges.

Corrections from the 2026-11-07 inventory:

- No test casts to a branded type; tests already call the domain
  constructors. No id helper is added.
- `content`, `domain`, `config`, `application` and `contracts` sit below
  test-utils in the dependency graph. They keep package-local typed
  test-support, and the shared layer serves the packages above test-utils.
- Only repository tests use the test subpath. It becomes a source-only
  export of the Node runtime harness and leaves the packed manifest.
- The three CLI fixture `.mjs` modules move in RF7C.

### Session RF9C — Test size ceiling

The boundary checker applies a 1,000-line ceiling with a shrinking baseline
to test files. Tests above it split beside their modules: `platform-node`
`index.test.ts` (1,600), `test-utils` `store/entries.test.ts` (1,328) and
`store/media.test.ts` (1,166), `platform-cloudflare` `worker.test.ts` (1,183), `server`
`routes/content.test.ts` (1,153), admin `admin-client.test.ts` (1,122) and
`EntryPage.test.tsx` (1,082), `sdk` `published-site.test.ts` (1,096).

### Session RF9D — Type core package tests

Removes `@ts-nocheck` from the remaining tests of `contracts` (27), `db` (18),
`content` (10), `application` (10), `server` (9), `sdk` (2) and `astro`,
`mcp`, `render` (1 each), using the RF9B fixture layer.

### Session RF9E — Type platform tests

After RF5: `platform-node` (12) and `platform-cloudflare` (12).

### Session RF9F — Type CLI, generator and app tests

After RF7C: `cli` (21), `create-lace` (2), `apps/api` (4) and `apps/builder`
(2). The three CLI fixture helpers were moved to typed test-support in RF7C.
The typecheck baseline file is deleted when it is empty.

## 6. Progress log

One row per change; detailed decisions, verification and synchronized deltas are
preserved in the linked archives. Dates refer to the final recorded event.

| Date | Session | Change | Status |
| --- | --- | --- | --- |
| 2026-11-01 | RF1A | [rf01a-workspace-scripts-hygiene](../openspec/changes/archive/2026-11-01-rf01a-workspace-scripts-hygiene/) | Archived |
| 2026-11-01 | RF1B | [rf01b-docs-pruning-index](../openspec/changes/archive/2026-11-01-rf01b-docs-pruning-index/) | Archived |
| 2026-11-02 | RF2A | [rf02a-source-tests-pure-packages](../openspec/changes/archive/2026-11-02-rf02a-source-tests-pure-packages/) | Archived |
| 2026-11-02 | RF2B | [rf02b-source-tests-application-server](../openspec/changes/archive/2026-11-02-rf02b-source-tests-application-server/) | Archived |
| 2026-11-02 | RF2C | [rf02c-source-tests-delivery-and-test-utils](../openspec/changes/archive/2026-11-02-rf02c-source-tests-delivery-and-test-utils/) | Archived |
| 2026-11-02 | RF3A | [rf03a-field-type-capabilities](../openspec/changes/archive/2026-11-02-rf03a-field-type-capabilities/) | Archived |
| 2026-11-02 | RF3B | [rf03b-shared-identifiers-limits](../openspec/changes/archive/2026-11-02-rf03b-shared-identifiers-limits/) | Archived |
| 2026-11-02 | RF3C | [rf03c-conditional-visibility-evaluator](../openspec/changes/archive/2026-11-02-rf03c-conditional-visibility-evaluator/) | Archived |
| 2026-11-03 | RF3D | [rf03d-error-model-mapper](../openspec/changes/archive/2026-11-03-rf03d-error-model-mapper/) | Archived |
| 2026-11-03 | RF4A | [rf04a-content-module-split](../openspec/changes/archive/2026-11-03-rf04a-content-module-split/) | Archived |
| 2026-11-03 | RF4B | [rf04b-application-module-split](../openspec/changes/archive/2026-11-03-rf04b-application-module-split/) | Archived |
| 2026-11-03 | RF4C | [rf04c-contracts-module-split](../openspec/changes/archive/2026-11-03-rf04c-contracts-module-split/) | Archived |
| 2026-11-04 | RF4D | [rf04d-server-module-split](../openspec/changes/archive/2026-11-04-rf04d-server-module-split/) | Archived |
| 2026-11-04 | RF4E | [rf04e-db-config-module-split](../openspec/changes/archive/2026-11-04-rf04e-db-config-module-split/) | Archived |
| 2026-11-04 | RF4X | [rf04x-workspace-guards](../openspec/changes/archive/2026-11-04-rf04x-workspace-guards/) | Archived |
| 2026-11-04 | RF4F | [rf04f-test-utils-split](../openspec/changes/archive/2026-11-04-rf04f-test-utils-split/) | Archived |
| 2026-11-05 | RF4G | [rf04g-domain-auth-layout](../openspec/changes/archive/2026-11-05-rf04g-domain-auth-layout/) | Archived |
| 2026-11-05 | RF3E | [rf03e-shared-grammars-limits](../openspec/changes/archive/2026-11-05-rf03e-shared-grammars-limits/) | Archived |
| 2026-11-05 | RF3F | [rf03f-error-codes-follow-up](../openspec/changes/archive/2026-11-05-rf03f-error-codes-follow-up/) | Archived |
| 2026-11-07 | RF3G | [rf03g-json-validator-parity](../openspec/changes/archive/2026-11-07-rf03g-json-validator-parity/) | Archived |
| 2026-11-07 | RF9A | [rf09a-source-export-condition](../openspec/changes/archive/2026-11-07-rf09a-source-export-condition/) | Archived |
| 2026-11-07 | RF9B | [rf09b-typed-test-fixtures](../openspec/changes/archive/2026-11-07-rf09b-typed-test-fixtures/) | Archived |
| 2026-11-08 | RF4I | [rf04i-drizzle-schema-by-domain](../openspec/changes/archive/2026-11-08-rf04i-drizzle-schema-by-domain/) | Archived |
| 2026-11-08 | RF4H | [rf04h-near-ceiling-module-splits](../openspec/changes/archive/2026-11-08-rf04h-near-ceiling-module-splits/) | Archived |
| 2026-11-08 | RF4J | [rf04j-remaining-flat-packages](../openspec/changes/archive/2026-11-08-rf04j-remaining-flat-packages/) | Archived |
| 2026-11-08 | RF5A | [rf05a-shared-security-rows](../openspec/changes/archive/2026-11-08-rf05a-shared-security-rows/) | Archived |
| 2026-11-08 | RF5B | [rf05b-shared-content-reader](../openspec/changes/archive/2026-11-08-rf05b-shared-content-reader/) | Archived |
| 2026-11-08 | RF5C | [rf05c-runtime-deltas-composition](../openspec/changes/archive/2026-11-08-rf05c-runtime-deltas-composition/) | Archived |
| 2026-11-08 | RF8A | [rf08a-architecture-document](../openspec/changes/archive/2026-11-08-rf08a-architecture-document/) | Archived |
| 2026-11-08 | RF8X | [rf08x-rc1-baseline](../openspec/changes/archive/2026-11-08-rf08x-rc1-baseline/) | Archived |
| 2026-11-08 | — | [prepare-rc1-release](../openspec/changes/archive/2026-11-08-prepare-rc1-release/) | Archived |
| 2026-11-08 | RF8Y | [rf08y-release-history-out-of-specs](../openspec/changes/archive/2026-11-08-rf08y-release-history-out-of-specs/) | Archived |
| 2026-11-08 | RF8B | [rf08b-specification-ownership](../openspec/changes/archive/2026-11-08-rf08b-specification-ownership/) | Archived |
| 2026-11-09 | — | [fix-remote-d1-fresh-migrate](../openspec/changes/archive/2026-11-09-fix-remote-d1-fresh-migrate/) | Archived |
| 2026-11-09 | — | [prepare-rc2-release](../openspec/changes/archive/2026-11-09-prepare-rc2-release/) | Archived |
| 2026-11-10 | RF6A | [rf06a-admin-slice-split](../openspec/changes/archive/2026-11-10-rf06a-admin-slice-split/) | Archived |
| 2026-11-10 | RF6B | [rf06b-admin-api-client](../openspec/changes/archive/2026-11-10-rf06b-admin-api-client/) | Archived |
| 2026-11-10 | RF6C | [rf06c-draft-editor-state](../openspec/changes/archive/2026-11-10-rf06c-draft-editor-state/) | Archived |
| 2026-11-10 | RF6D | [rf06d-list-field-block-card](../openspec/changes/archive/2026-11-10-rf06d-list-field-block-card/) | Archived |
| 2026-11-10 | — | [rc2-oldest-supported](../openspec/changes/archive/2026-11-10-rc2-oldest-supported/) | Archived |
| 2026-11-10 | — | [gallery-item-placement-size](../openspec/changes/archive/2026-11-10-gallery-item-placement-size/) | Archived |
| 2026-11-10 | — | [collection-default-sort](../openspec/changes/archive/2026-11-10-collection-default-sort/) | Archived |
| 2026-11-10 | — | [admin-editor-ui-polish](../openspec/changes/archive/2026-11-10-admin-editor-ui-polish/) | Archived |
| 2026-11-10 | — | [admin-editor-left-aligned](../openspec/changes/archive/2026-11-10-admin-editor-left-aligned/) | Archived |
| 2026-11-11 | — | [route-less-collections](../openspec/changes/archive/2026-11-11-route-less-collections/) | Archived |
| 2026-11-11 | RF7A | [rf07a-lazy-cloudflare-path](../openspec/changes/archive/2026-11-11-rf07a-lazy-cloudflare-path/) | Archived |
| 2026-11-11 | RF7B | [rf07b-one-command-table](../openspec/changes/archive/2026-11-11-rf07b-one-command-table/) | Archived |
| 2026-11-12 | RF7C | [rf07c-cli-source-layout](../openspec/changes/archive/2026-11-12-rf07c-cli-source-layout/) | Archived |
| 2026-11-12 | RF8C | [rf08c-user-documentation](../openspec/changes/archive/2026-11-12-rf08c-user-documentation/) | Archived |
| 2026-11-14 | RF7D | [rf07d-naming-hygiene](../openspec/changes/archive/2026-11-14-rf07d-naming-hygiene/) | Archived; 113 D1 contract cases, 227 Node contract tests and 19 affected browser tests passed; build, export comparison and root quality gates passed. Specs synchronized. |
