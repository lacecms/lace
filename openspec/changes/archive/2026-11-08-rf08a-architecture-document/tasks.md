## 1. Baseline and invariant inventory

- [x] 1.1 Record the comparison point: line count per `##` section of `docs/mvp-architecture.md`, the list of change codes it contains with line numbers (design D5 pattern), every file outside `openspec/changes/` that references `mvp-architecture` with its anchors, and the 36 table names exported by `@lacecms/db`. Verify `pnpm exec vitest run tests/docs-links.test.mjs tests/docs-publication.test.mjs` is green before any edit.
- [x] 1.2 Write `invariants.md` in this change from the unmodified document (design D3): one row per normative statement with old section, short paraphrase and a provisional class (1 invariant, 2 spec detail, 3 decision, 4 history). Verify every `##`/`###` section of the old file has at least one row.

## 2. Split into `docs/architecture/`

- [x] 2.1 Create `docs/architecture/` with `README.md` and the twelve domain files of design D1, moving each section verbatim to its file with its number and title, `README.md` holding §1–§4, §24, §26 and the section map; delete `docs/mvp-architecture.md`. Verify the concatenated section bodies equal the old document apart from the file headers and section map (diff of sorted lines empty except those).
- [x] 2.2 Update every reference found in task 1.1 to the new file and anchor: `AGENTS.md`, `openspec/config.yaml`, `docs/README.md` (a `docs/architecture/` table with one row per file and its sections; `mvp-architecture.md` row removed), every ADR's governing link, `docs/adr/README.md`, `docs/refactoring-roadmap.md`, `docs/archive/*.md`, `docs/verification.md`, `docs/personal-site-guide.md` and the `tests/docs-publication.test.mjs` input path. Verify `rg -n "mvp-architecture" --glob '!openspec/changes/**'` finds nothing and `tests/docs-links.test.mjs` and `tests/docs-publication.test.mjs` pass.

## 3. ADRs and decision pointer

- [x] 3.1 Add ADRs 0021–0028 (design D4), each in the 0020 format with status Accepted, the apply date, a governing-architecture link, the note that it records an MVP baseline decision retroactively, and context/decision/consequences drawn from the old §4 and §24 text. Add their rows to `docs/adr/README.md` and `docs/README.md` and correct the index count sentence. Verify `tests/docs-links.test.mjs` passes and every §24 bullet maps to an ADR in `invariants.md`.
- [x] 3.2 Replace §24 in `README.md` with the pointer to `docs/adr/README.md` (design D4). Verify each removed bullet's `invariants.md` row names its ADR.

## 4. Current behavior only

- [x] 4.1 Create `history.md` (design D5): the change-code map (each code once, linking its archived change directory), the old §23 sequence as §23, the release history moved from §25 and a note that `docs/mvp-architecture.md` became this directory. Remove every change code, step number and release narrative from the other files, keeping §25 to current defaults, open release decisions and a pointer to `release/alpha.json`; reword `workspace.md` §6 so it states the layout rules without RF4–RF7 adoption status. Verify the design D5 pattern finds no match outside `history.md` with `rg`.

## 5. Compaction per domain file

- [x] 5.1 Rewrite `content-configuration.md` (§8) and `data-model.md` (§9) to their design D1 budgets, applying the D3 classes and completing the `invariants.md` destinations for their rows; for each class-2 row, confirm the linked spec states the detail before removing it. Verify each file's prose line count and that its rows all have destinations.
- [x] 5.2 Rewrite `api.md` (§12), `publication.md` (§10) and `rendering.md` (§11, §13) the same way. Verify as in 5.1.
- [x] 5.3 Rewrite `security.md` (§14), `admin.md` (§17) and `distribution.md` (§7, §22, §25) the same way. Verify as in 5.1.
- [x] 5.4 Rewrite `README.md` (§1–§4, §26), `deployment.md` (§5, §18, §21) and `workspace.md` (§6, §19, §20) the same way, and review `runtimes.md` §15 against `packages/application/src/ports/*.ts` and `composeLaceServices` and §16 against the RF5C runtime-deltas table, correcting any statement the code contradicts. Verify as in 5.1, and that the directory total outside Mermaid blocks is under 2,500 lines; if it is not reachable without dropping an invariant, stop and revise this change (design Risks).

## 6. Diagrams

- [x] 6.1 Add the component `flowchart` to `runtimes.md` §15 (design D7), checked against `packages/application/src/ports/*.ts`, `packages/server/src/composition/services.ts` and the `runtime/`, `repository/`, `security/`, `media/`, `builds`/`deploy` and dispatch modules of both platforms and `apps/api`. Verify it renders with the Mermaid version the docs app uses (or `@mermaid-js/mermaid-cli` via `pnpm dlx`, output discarded) and names only existing packages, ports and functions.
- [x] 6.2 Add §9.10 with the `erDiagram` to `data-model.md` (design D6): every table, PK and FK column with SQL types, child-to-parent relations labelled by FK columns, grouped by schema file. Verify it renders as in 6.1 and `data-model.md` stays under 600 lines.

## 7. Guard test

- [x] 7.1 Add `tests/architecture-document.test.mjs` (spec requirement "Architecture documentation is a guarded domain directory", design D6): table/PK/FK/relation set comparison in both directions against `@lacecms/db`, change-code pattern outside `history.md`, section map against `## N.` headings, and both ceilings, each failure naming the item. Verify it passes, then confirm it fails with a precise message for: a removed diagram entity, an extra relation, a `CE7D` inserted in `api.md`, a section map row pointing at the wrong file and a padded file — restoring each edit afterwards.

## 8. Review and verification

- [x] 8.1 Run an independent review (fresh subagent given `git show HEAD:docs/mvp-architecture.md`, `invariants.md` and `docs/architecture/`, not this change's conclusions) for statements without a destination, class-2 rows whose spec does not state the detail, and anchors that no longer resolve; fix every confirmed gap and record the result in `invariants.md`.
- [x] 8.2 Record the RF8A outcome in `docs/refactoring-roadmap.md` (RF8A section, §4 status, progress log; note for RF8B to update architecture spec links when it splits capabilities). Verify `tests/docs-links.test.mjs` passes.
- [x] 8.3 Run `pnpm build` (for the root test's `@lacecms/db` import), root `vitest run tests` for `architecture-document`, `docs-links` and `docs-publication`, then `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate` and `pnpm exec openspec validate rf08a-architecture-document --type change --strict`; resolve failures before completion.
