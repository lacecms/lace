## Why

`docs/` holds 26 maintained documents, 18 ADRs and 48 archived step
verification records (952 KB of JSON artifact inventories and per-step
reports from roadmap steps 25–34) with no index that says which file is
authoritative, which is an internal note and which is history. Five separate
documents describe verification (`mvp-traceability.md`,
`real-application-verification.md`, `local-operations-verification.md`,
`local-security-verification.md`, `verification/ce10-internal-url-links.md`),
each written for a roadmap step and cross-linking the step records. The
owner decided on 2026-11-01 that pre-release-era evidence files are not kept
in the repository: the OpenSpec spec and change archive, the archived
roadmaps and the ADRs are the history. This is Session RF1B of
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md),
second session of Step RF1; it follows RF1A, which renamed the verification
commands and retired the feedback traceability tests that read the archived
step logs.

## What Changes

- **Step verification records are deleted.** `docs/archive/step-25`,
  `step-27`, `step-29`, `step-32`, `step-33` and `step-34` are removed.
  `docs/archive/` keeps `mvp-implementation-roadmap.md`, its summary,
  `content-editor-roadmap.md` and `site-migration-roadmap.md`.
- **One verification document.** `docs/verification.md` replaces
  `mvp-traceability.md`, `real-application-verification.md`,
  `local-operations-verification.md`, `local-security-verification.md` and
  `verification/ce10-internal-url-links.md`. It describes each verification
  and acceptance command that exists today (unit and contract tests, the
  three `verify:*` runners, generated-project and release acceptance), what
  each proves and does not prove, the evidence it writes, the architecture
  §3 and §14 items each covers, the recorded D1 budget measurements, and the
  owner checks on real infrastructure with their recorded status. Step
  identities, per-alpha handoff narratives and links to deleted records are
  dropped; release-specific readiness stays in the archived
  `prepare-alpha-*` changes.
- **Indexes.** `docs/README.md` lists every file under `docs/` (including
  `archive/`) with a status (`authoritative`, `internal note`, `historical`)
  and the architecture section it details; `docs/adr/README.md` lists every
  ADR by number, title and status. `AGENTS.md`, `README.md`,
  `DEVELOPMENT.md` and `docs/documentation-maintenance.md` point at the
  index.
- **Link repair.** Every document that linked to a deleted or merged file
  (`mvp-architecture.md` §5, §8 and §25, `alpha-release.md`,
  `compatibility.md`, `auth-operations.md`, `cloudflare-deployment-handoff.md`,
  `cloudflare-worker.md`, `database-migrations.md`, `node-api.md`) links to
  `verification.md` or to the archived change that holds the evidence.
- **Link guard.** A root test walks the relative Markdown links of
  `README.md`, `DEVELOPMENT.md`, `AGENTS.md`, `backlog.md` and `docs/**/*.md`
  and fails on a missing target, a `docs/` file absent from the index or an
  ADR absent from the ADR index.

Non-goals: rewriting `mvp-architecture.md` beyond link repair (RF8A);
changing public pages in `apps/docs` (RF8C); touching `openspec/` archives
or specs other than the deltas below; pruning `openspec/changes/archive`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-operations-verification`: the traceability requirement names one
  maintained verification document instead of "the 34C record" and drops
  step-closure wording.
- `local-security-resilience-verification`: the evidence requirement
  describes the security runner's record without the 34A/34B/34C session
  identities.
- `cross-runtime-product-verification`: the evidence requirement drops the
  Step 33 inventory and session 34B/34C references.
- `public-documentation`: the ownership requirement allows consolidation and
  deletion of internal documents when the index records the replacement,
  instead of forbidding deletion.
- `workspace-governance`: a new requirement makes internal documentation
  indexed with a status per file and link-checked by a root test.

## Impact

- Architecture: no invariant changes; §5, §8 and §25 links are repaired in
  the same change. §20 *Testing strategy* and §21 gain a pointer to
  `docs/verification.md`.
- Files: 48 deletions under `docs/archive/step-*`, 5 merged documents
  deleted, 3 new documents (`docs/verification.md`, `docs/README.md`,
  `docs/adr/README.md`), 1 new root test, link edits in 10 documents and
  3 root Markdown files.
- Tooling: `tests/docs-links.test.mjs` joins `pnpm test`; `pnpm docs:check`
  is unaffected because `docs/` is not a public build input.
- Dependencies: none.
