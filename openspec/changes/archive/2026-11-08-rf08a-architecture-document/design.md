## Context

See proposal.md for motivation. Current state that shapes the approach:

- `docs/mvp-architecture.md` is 4,086 lines in 26 numbered sections. The largest
  are §8 content configuration (686), §9 data model (500), §13 rendering (455),
  §12 REST API (379), §17 admin (288) and §14 authentication (266). Much of their
  detail repeats accepted capability specs written by the same changes.
- References to it: 26 files under `docs/` (every ADR's "Governing architecture"
  line, both indexes, the active and archived roadmaps, `verification.md`,
  `personal-site-guide.md`), `AGENTS.md`, `openspec/config.yaml` and
  `tests/docs-publication.test.mjs`. Anchors in use are section slugs such as
  `#97-media`, `#12-rest-api`, `#source-layout`, `#contract-rules`. Specs and
  `AGENTS.md` cite "architecture section 6" / "§6" by number.
- `tests/docs-links.test.mjs` checks that every relative link under `docs/` and
  the root documents resolves to a file (not the anchor), that every `docs/`
  Markdown file has an index row, and that every ADR has an ADR-index row.
  Oxfmt ignores `docs/` and `openspec/`.
- §15 and §16 were already updated by RF5C (ports, `composeLaceServices`,
  runtime-deltas table). §6 already states the source-layout rules but also
  RF4–RF7 adoption status.
- `@lacecms/db` exports 36 Drizzle `sqliteTable` objects from
  `src/schema/*.ts`; root `package.json` already lists `@lacecms/db` and
  `drizzle-orm` as dev dependencies. Root tests run with plain `vitest run tests`
  after the Turborepo build, so they import the built package.
- §24 lists 32 decisions; ADRs 0006, 0007, 0009–0012 and 0018 cover eight of
  them. `docs/adr/README.md` still says "all eighteen decisions" with twenty ADRs.

## Goals / Non-Goals

**Goals:**

- A reader finds a domain's architecture in one file of a few hundred lines,
  with the invariants and a pointer to the owning spec for detail.
- Every invariant of the old document survives, verifiably.
- Section numbers stay valid everywhere they are cited today.
- The table diagram cannot drift from the schema silently.

**Non-Goals:**

- No rewording of ADRs 0001–0020 beyond their governing links and the ADR index
  count (their RF amendments are history and stay).
- No new requirements in capability specs other than the governance delta; if a
  removed architecture detail is found in no spec, it stays in the architecture
  (moving it into a spec is RF8B's job).
- No drift test for the component diagram; it is reviewed by hand.

## Decisions

### D1. Directory layout keeps section numbers

`docs/architecture/` holds `README.md` plus twelve domain files. Each file holds
whole numbered sections; section headings keep their current numbers and titles
(minus change codes), so heading slugs, "§N" citations and spec text stay
correct. `README.md` carries a section map (§ → file) that the guard test checks.

| File | Sections | Old lines | Budget (excl. Mermaid) |
| --- | --- | ---: | ---: |
| `README.md` | §1 purpose, §2 goals, §3 scope, §4 principles, §24 decisions pointer, §26 external references, section map | 218 | 150 |
| `deployment.md` | §5 system context, §18 development modes, §21 observability and operations | 194 | 120 |
| `workspace.md` | §6 repository structure and source layout, §19 dependency policy, §20 testing strategy | 389 | 230 |
| `distribution.md` | §7 generated user project, §22 migration and compatibility, §25 planning defaults and release decisions | 278 | 150 |
| `content-configuration.md` | §8 | 686 | 360 |
| `data-model.md` | §9 (with new §9.10 table diagram) | 500 | 280 |
| `publication.md` | §10 | 111 | 75 |
| `api.md` | §12 | 379 | 200 |
| `rendering.md` | §11 block registry and rich text, §13 site rendering and block installation | 567 | 300 |
| `security.md` | §14 | 266 | 160 |
| `runtimes.md` | §15 infrastructure ports (with component diagram), §16 database portability and runtime deltas | 190 | 180 |
| `admin.md` | §17 | 288 | 165 |
| `history.md` | §23 implementation sequence, change-code map, release history | 18 | 80 |
| **Total** | | **4,086** | **2,450** |

Files with non-contiguous numbers (`deployment.md`: §5, §18, §21) are accepted:
the number identifies the rule, the file identifies the domain.

Alternatives considered:
- *One file under 2,500 lines* (the roadmap's wording) — rejected by the owner;
  the two diagrams alone take ~280 lines of the budget.
- *One file per section* — 26 files, several under 20 lines; the domain grouping
  is what makes the split readable.
- *Renumber per file* (e.g. `content-configuration §3`) — breaks "architecture
  section 6" in `workspace-governance`, `AGENTS.md`, ADRs and 192 archived
  changes.
- *Keep `docs/mvp-architecture.md` as a redirect stub* — the
  `public-documentation` spec requires links to be updated when a document is
  consolidated, and a stub would be a second entry point to keep current.
  The directory drops the `mvp-` prefix: the product is past MVP (rc1).

### D2. Ceilings and how they are counted

Under 2,500 lines across the directory excluding fenced ```` ```mermaid ```` blocks,
and under 600 lines per file including diagrams. The total keeps the roadmap's
readability target for prose; the per-file ceiling keeps each domain file
reviewable (the largest, `data-model.md`, is ~280 prose + ~220 diagram lines).
The budgets in D1 are the plan, not separate limits; a file may exceed its
budget if the total holds.

### D3. What leaves a section, and where it goes

Each normative statement is classified before any text is removed:

1. **Invariant, not stated elsewhere** → stays, rewritten without change codes.
2. **Detail already stated by an accepted spec** → replaced by one sentence of
   invariant plus a link to `openspec/specs/<capability>/spec.md`. The
   implementer checks the spec actually states it; if not, case 1 applies.
3. **Decision with rationale** → the ADR that records it (existing or D4).
4. **History** (which session introduced it, release versions, superseded
   behavior) → `history.md` or dropped when the archived change already has it.

The record is `openspec/changes/rf08a-architecture-document/invariants.md`: one
row per statement with old section, short paraphrase, class (1–4) and
destination (file §, ADR number or capability + requirement title). It is
written from the unmodified document first, then completed while rewriting.
An independent reviewer (a fresh subagent given the old file via
`git show HEAD:docs/mvp-architecture.md`, the checklist and the new directory,
not the implementer's conclusions) reports statements that have no destination.

### D4. ADRs for §24

§24 decisions without an ADR are grouped by the question they answer, one ADR
each, dated at apply, each stating that the decision dates from the MVP baseline
and is recorded retroactively:

| ADR | Decisions |
| --- | --- |
| 0021 Single-site installation with a static Astro site | one installation per site; Astro static output; generator onboarding for new projects; optional starter or existing site; user site never overwritten on upgrade |
| 0022 Hono REST API with Valibot schemas | versioned Hono REST API; Valibot as canonical runtime schema; Standard Schema validation; OpenAPI derived through Valibot JSON Schema |
| 0023 Admin single-page application stack | React/Vite SPA; TanStack Router and Query (component source and layers stay in ADR 0005) |
| 0024 One SQLite dialect with capability adapters | Drizzle SQLite dialect on D1 and Node SQLite; MinIO vs R2; narrow capability adapters (transactions stay in ADR 0002) |
| 0025 Better Auth with role-mapped permissions | Better Auth; admin/editor/viewer roles mapped to permissions; only admin holds `content:publish` by default |
| 0026 Code-defined models with draft and published snapshots | models in code projected into the database; pages, collections and globals share `content_entries`; draft and published snapshots only; blocks as relational rows with JSON payloads, flat and sparsely ordered; Tiptap for rich-text fields and blocks only |
| 0027 Publication through an outbox-triggered rebuild | publishing writes an outbox event that triggers a static rebuild (builder specifics stay in ADR 0004) |
| 0028 Spec-driven delivery and workspace toolchain | OpenSpec workflow; pnpm workspaces with Turborepo; Oxlint and Oxfmt |

§24 becomes two sentences pointing to `docs/adr/README.md`. The ADR index and
`docs/README.md` gain rows; the index's count sentence is corrected to the real
number.

Alternative: one "MVP baseline decisions" ADR — rejected: an ADR that bundles
unrelated decisions cannot be superseded one decision at a time.

### D5. Change codes and history

The guard pattern is the roadmap code families — `CE`, `SM`, `LIST`, `CQ`,
`MCP`, `RF` followed by a number and optional session letter, `Step N`, and the
MVP roadmap's two-digit session form (`33A`) — matched case-sensitively in
headings and prose, ignoring link targets (archive directory names are lower
case anyway). `D1`, `R2`, `S3` and similar product names do not match.
`history.md` lists each code once with the archived change directory it maps to,
plus the old §23 sequence and the release history now in §25 (published alpha
versions move there; §25 keeps the current defaults and the open release
decisions and points to `release/alpha.json` for versions).

### D6. Table diagram and its drift test

`data-model.md` §9.10 has one `erDiagram`. Each entity lists only key columns:
`PK` for primary-key columns (single or composite), `FK` for foreign-key columns,
with their SQL types; relations are drawn child-to-parent with the foreign-key
column(s) as the label. Tables are grouped in the source by schema file
(content, publication, media, links, outbox, builds, operations, security, auth,
Better Auth, OAuth) with comments.

`tests/architecture-document.test.mjs`:
- collects tables by iterating the exports of `@lacecms/db` and keeping values
  for which drizzle-orm's `is(value, SQLiteTable)` holds, reading names, primary
  keys and foreign keys through `getTableConfig`;
- parses the `erDiagram` block (entity blocks and relation lines) and compares
  tables, PK columns, FK columns and relations as sets in both directions;
- checks the change-code pattern, the section map against `## N.` headings, and
  both ceilings;
- reports each mismatch by name so the failure says what to add or remove.

Reading the built package (rather than parsing TypeScript source) uses the same
table objects migrations are generated from; TypeScript 7 in this workspace has
no JS compiler API to parse with. Alternative — parsing the latest Drizzle
snapshot JSON — would test migrations, which `pnpm db:check` already covers.

### D7. Component diagram

`runtimes.md` §15 gains one `flowchart` drawn from the code, not from §6 prose:
`apps/api` and the Worker entry → `createNodeRuntime` / `createCloudflareRuntime`
→ `composeLaceServices` (server) → application use cases → ports; adapters per
runtime implement the ports (`db` shared reader and rows, Node and D1 repository
areas, security, object storage MinIO/R2, build triggers builder/deploy hook,
outbox dispatch timer/scheduled Worker, email). Package nodes use the §6 names;
it is checked by hand against `packages/application/src/ports/*.ts` and the
platform `runtime/` directories during apply.

## Risks / Trade-offs

- [The 2,450-line budget cannot be reached without dropping an invariant] →
  invariants win: stop, report the measured total, and revise this change
  (ceiling or budgets) with the owner before finishing.
- [A link points at an anchor that changed] → headings keep numbers and titles;
  only titles with change codes change slug, and none of those is linked today.
  The apply greps every `mvp-architecture` reference and every `#` anchor it
  rewrites; `docs-links` checks files, the review checks anchors.
- [Pointers to specs go stale when RF8B splits `admin-draft-editor`] → RF8B
  updates architecture links in the same change it moves requirements (noted in
  the roadmap for RF8B).
- [Component diagram drifts] → no automated guard; RF6/RF7 sessions update
  `runtimes.md` when they change composition, as they do today with §15.
- [Retroactive ADRs read as new decisions] → each says it records an existing
  MVP decision and links the governing section.

## Migration Plan

Documentation-only. One commit; rollback is reverting it. Archived OpenSpec
changes keep their old `docs/mvp-architecture.md` links (they are history and
not link-checked); `history.md` notes the rename so readers of the archive can
find the new location.
