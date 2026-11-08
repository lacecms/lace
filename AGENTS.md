# Lace Agent Instructions

## Sources of truth

Read these before planning or implementing product work:

1. `docs/mvp-architecture.md` — product scope and architecture invariants;
   [`docs/README.md`](docs/README.md) indexes internal documents and their status.
2. `openspec/specs/**` — accepted detailed capability behavior.
3. The selected active OpenSpec change — the proposed implementation delta.
4. `docs/refactoring-roadmap.md` — the active roadmap: delivery order, session
   boundaries and recorded decisions. `backlog.md` — future work.
   `docs/archive/site-migration-roadmap.md`,
   `docs/archive/content-editor-roadmap.md` and
   `docs/archive/mvp-implementation-roadmap.md` preserve completed delivery
   order and session boundaries.

Never resolve a conflict by silently choosing the lower-authority document.

## Mandatory OpenSpec workflow

All roadmap implementation uses the repository-local OpenSpec `spec-driven`
workflow. One roadmap session unit is normally one just-in-time OpenSpec change.

1. For planning, use `openspec-propose`. Create all required artifacts and stop;
   do not edit production code in the proposal turn.
2. Implement only after the user explicitly requests apply. Use
   `openspec-apply-change`, read every CLI-reported context file, complete tasks in
   order, verify them, and update task checkboxes immediately.
3. If implementation exposes a design or scope issue, stop and revise the active
   planning artifacts with `openspec-update-change`. Update architecture and the
   roadmap first when their invariants change.
4. Validate completed changes with
   `openspec validate <change-name> --type change --strict`.
5. Archive only after an explicit user request using `openspec-archive-change`;
   normally synchronize verified delta specs into the main specs first.

Do not pre-create all roadmap changes. Do not implement roadmap work without an
active, apply-ready OpenSpec change. The bootstrap documents that introduced this
rule are the sole pre-OpenSpec exception.

## Tooling

- Use pnpm workspaces and Turborepo.
- Use the project-pinned `@fission-ai/openspec` CLI through pnpm scripts or
  `pnpm exec`; do not rely on a globally installed version.
- Use Oxlint and Oxfmt through `.oxlintrc.json` and `.oxfmtrc.json`.
- Do not add ESLint, Prettier, their plugins, or compatibility wrappers.
- Run the narrowest relevant tests, then root typecheck, Oxlint, Oxfmt check, and
  OpenSpec strict validation before completing a change.

## Source layout

Follow architecture §6: entry points at `src/` root, other modules grouped by
domain as soon as a second concern exists; one responsibility per file, split
before 1,000 lines. No subdirectory barrels or module cycles (including types);
document directory direction at the package entry. Tests sit beside modules,
shared helpers in `src/test-support/`. Existing packages adopt this in RF4–RF6
or when adding a second concern; admin retains its layer/slice structure.
Remove split files from `scripts/oversized-source-baseline.json`; never grow
baselined files. The boundary checker also enforces the directory rules in
`scripts/source-layout.json` (add a package when it adopts the layout; list
directly started app entries in `scripts/source-root-entries.json` and
single-concern flat packages in `scripts/source-layout-exemptions.json`), freezes
legacy module cycles in `scripts/source-cycle-baseline.json`, and limits
`@ts-nocheck` tests to `scripts/test-typecheck-baseline.json`; a split types its
test companions or lists them there explicitly. See
[ADR 0020](docs/adr/0020-source-layout.md).
