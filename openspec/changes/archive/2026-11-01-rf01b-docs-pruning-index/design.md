## Context

See proposal.md for motivation. Facts that shape the approach (commit
`1494b039`, after RF1A):

- `docs/archive/step-*` holds 48 files: per-step verification reports,
  `*-artifacts.json` inventories, dependency-audit JSON, the alpha.1
  onboarding feedback log and map (`step-32`) and the alpha.2 field-trial log
  and map (`step-33`). After RF1A no test reads them. Live documents link to
  them from `alpha-release.md` (four step records), `compatibility.md` (two),
  `local-operations-verification.md`, `local-security-verification.md`,
  `mvp-traceability.md` and `real-application-verification.md`.
- The five verification documents overlap: `mvp-traceability.md` (50 lines)
  is a coverage table of architecture §3 and §14 items;
  `local-operations-verification.md` (21) and
  `local-security-verification.md` (20) describe the operations and
  security runners; `real-application-verification.md` (341) holds the owner
  plan for real VPS/Cloudflare checks (§1–§8), the owner-confirmed status of
  2026-10-10 and four per-alpha handoff narratives;
  `verification/ce10-internal-url-links.md` (160) records D1 read/write
  budgets measured for internal links.
- Six operations-related documents end with the same paragraph "See 34C
  local operations verification…" (`auth-operations.md`,
  `cloudflare-deployment-handoff.md`, `cloudflare-worker.md`,
  `database-migrations.md`, `node-api.md`, `real-application-verification.md`).
- `mvp-architecture.md` names `docs/real-application-verification.md` in §5
  and §25 and `docs/verification/ce10-internal-url-links.md` in §8.
- `docs/documentation-maintenance.md` is the public-docs maintenance note
  with the public/internal topic ownership map required by
  `public-documentation`.
- `tests/docs-publication.test.mjs` proves `docs/` is not a public build
  input, so deletions do not trigger a Pages publication.
- Root `pnpm test` runs `vitest run tests`, so a new `tests/*.test.mjs` joins
  the gate without configuration.

## Goals / Non-Goals

**Goals:**

- A reader opens `docs/README.md` and knows, per file, whether it is
  authoritative, a note or history.
- Verification is described once, by command, with its coverage table and
  owner checks, and without any run's results.
- Nothing under `docs/` links to a file that does not exist, now or later.

**Non-Goals:**

- Rewriting the content of guides that merely gain a repaired link.
- Changing the architecture document's structure (RF8A).
- Publishing any internal document.

## Decisions

1. **One `docs/verification.md` with five sections**, in this order:
   *Commands* (unit and contract tests, `verify:cross-runtime`,
   `verify:security`, `verify:operations`, `acceptance:*`, `release:*`
   verification, `docs:check`: what each proves, its prerequisites,
   environment variables and where it writes evidence); *Limits* (what no
   local run proves: remote capacity, real TLS/proxy, provider permissions,
   publication); *Coverage* (the §3 and §14 tables from `mvp-traceability.md`
   with evidence names updated to RF1A's renamed journeys and stages, and the
   "pending" column replaced by the owner-check reference); *Recorded D1
   budget measurements* (the CE10 tables, kept because they justify
   architecture §9.6 limits); *Owner checks on real infrastructure* (the
   plan §1–§8 of `real-application-verification.md` condensed to scenarios
   and evidence, plus the owner-confirmed status table). Per-alpha handoff
   narratives are dropped; each archived `prepare-alpha-*` change keeps its
   `readiness.md`. Alternative rejected: keeping `real-application-verification.md`
   as a separate owner plan, because every reader of one document needs the
   other and both describe the same gates.
2. **Deleted step records are not moved into `openspec/changes/archive`.**
   The archived changes already contain the verification narratives that
   mattered; copying JSON inventories into them would grow the archive the
   owner wants left alone. Git history is the record; `docs/README.md`
   names the last commit that contained `docs/archive/step-*`.
3. **Index format.** `docs/README.md` is one table per directory
   (`docs/`, `docs/adr/`, `docs/archive/`) with columns *File*, *Status*,
   *Details* (architecture section, capability or roadmap). Status values
   are the three fixed words so the link guard can parse them.
   `docs/adr/README.md` lists ADRs with *Status* `accepted`, `amended` or
   `superseded` and the superseding ADR where applicable.
4. **Link guard as a root test**, `tests/docs-links.test.mjs`: parses
   `[text](target)` and reference-style links, ignores `http(s):` and
   `mailto:` targets, strips anchors, resolves relative to the document,
   and asserts existence; asserts every `docs/**/*.md` (except the two index
   files) has an index row and every `docs/adr/*.md` has an ADR-index row.
   Anchors are not validated (headings change often; the public docs build
   validates its own anchors). Chosen as a root test rather than an
   extension of `pnpm docs:check` because `docs/` is internal and must not
   become a public build input.
5. **Shared "See also" paragraph** in the six operations documents becomes
   one sentence linking `verification.md#owner-checks-on-real-infrastructure`.
6. **Architecture links.** §5 and §25 point at
   `docs/verification.md#owner-checks-on-real-infrastructure`; §8 points at
   `docs/verification.md#recorded-d1-budget-measurements`. No other
   architecture text changes.

## Risks / Trade-offs

- [Lost measurement context] CE10 budget tables lose their surrounding
  narrative → the tables carry their fixture description rows; the archived
  CE10 change holds the design rationale.
- [Owner status drift] The owner-confirmed status of 2026-10-10 is copied
  verbatim with its date → the section states it is an attestation, not a
  rerun, as the source did.
- [Index maintenance cost] Every new `docs/` file needs a row → the root
  test makes the omission visible immediately; one row is cheaper than an
  unindexed document.
- [Generated guides] Generated project templates might link to deleted
  `docs/` paths → grep of `packages/create-lace/templates` and
  `scripts/consumer-guides.mjs` in tasks (none found at planning time).

## Migration Plan

Single commit on a branch after RF1A is archived; revert to roll back. No
runtime, data or publication effect.
