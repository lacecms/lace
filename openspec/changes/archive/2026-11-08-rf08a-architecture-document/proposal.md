## Why

Roadmap Step RF8 (documentation), Session RF8A of `docs/refactoring-roadmap.md`:
the architecture document. `docs/mvp-architecture.md` has grown to 4,086 lines
in one file. Its prose carries 43 roadmap change codes (`CE7D`, `SM5`, `LIST1`,
`CQ1`, `MCP2`, `RF5B`…) and release history, §24 restates decisions that mostly
have no ADR, and there is no picture of the backend components or of the 36
database tables. RF4 and RF5 have finished changing the ports, adapters and
composition the document describes, so it can now be rewritten once against
the current code.

The owner decided (2026-11-08, while planning this change) to turn the single
file into a directory split by domain instead of squeezing it under one line
ceiling; the roadmap's two Mermaid diagrams would otherwise consume a tenth of
the 2,500-line budget.

## What Changes

- **Architecture becomes `docs/architecture/`.** `docs/mvp-architecture.md` is
  replaced by a `README.md` (purpose, goals, scope, principles, the decision
  pointer and a section map) and twelve domain files. Section numbers §1–§26 are
  kept as stable identifiers inside the files, so "architecture §6" in specs,
  `AGENTS.md` and ADRs still names the same rules; the section map says which
  file holds each section. §26 external references move to the files that use
  them.
- **Current behavior only.** Change codes, step numbers and release history
  leave headings and prose. A `history.md` file maps every removed code to its
  archived change and absorbs §23 (implementation sequence) and the release
  history now in §25.
- **§24 moves into ADRs.** Decisions without an ADR get new ADRs 0021–0028
  (single-site static architecture, REST and schema stack, admin SPA stack,
  one SQLite dialect with capability adapters, authentication and roles,
  content storage model, outbox-driven rebuilds, delivery workflow and
  toolchain); §24 becomes a pointer to `docs/adr/README.md`.
- **Reviewed sections.** §15 is checked against `packages/application/src/ports`
  and the RF5C composition; §16 keeps the RF5C runtime-deltas table; §6 states
  the module layout rules without RF session status.
- **Two Mermaid diagrams.** A backend component diagram (§15) shows the §6
  packages, application ports, their Node and D1 adapters (shared `db` reader
  and rows, repository areas, security, storage, build triggers, outbox
  dispatch) and `composeLaceServices`. A table diagram (`erDiagram`, new §9.10)
  shows every Drizzle table in `packages/db/src/schema/` with primary keys,
  foreign keys and relations.
- **Drift guards.** A root test fails when a schema table, primary key or
  foreign key is missing from (or stale in) the table diagram, when a roadmap
  change code appears outside `history.md`, when the section map disagrees with
  the files, or when the size ceilings are exceeded: under 2,500 lines across the
  directory excluding Mermaid blocks, and under 600 lines per file.
- **No invariant lost.** The change carries an invariant checklist listing every
  normative statement of the old document and where it now lives (architecture
  file, ADR, or the accepted spec that already states it).
- **Every link updated.** `AGENTS.md`, `openspec/config.yaml`, `docs/README.md`,
  ADRs, roadmaps (including `docs/archive/`), `docs/*.md` and
  `tests/docs-publication.test.mjs` point at the new files.

Non-goals: no product, API, schema or runtime behavior change; no edits to
`openspec/specs/**` beyond this change's governance delta (spec reorganization
is RF8B); no public documentation changes (RF8C); archived OpenSpec changes are
not rewritten.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: adds a requirement for the architecture directory —
  a section map, change codes confined to the history file, size ceilings, and
  a table diagram kept in step with the Drizzle schema by a repository test.

## Impact

- Documents: `docs/mvp-architecture.md` (removed), `docs/architecture/**` (new),
  `docs/adr/0021`–`0028` (new), `docs/adr/README.md`, every ADR's governing link,
  `docs/README.md`, `docs/refactoring-roadmap.md`, `docs/archive/*.md`,
  `docs/verification.md`, `docs/personal-site-guide.md`, `AGENTS.md`,
  `openspec/config.yaml`.
- Tests: new `tests/architecture-document.test.mjs` (reads `@lacecms/db` table
  objects through `drizzle-orm`, both already root dev dependencies);
  `tests/docs-publication.test.mjs` input path.
- Depends on RF4B and RF5C (done) for §15/§16 content and RF1B for the index.
  RF6 and RF7 are not prerequisites; their sessions update the files they
  change.
