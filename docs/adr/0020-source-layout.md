# ADR 0020: Domain source layout and shrinking size baseline

- Status: Accepted
- Date: 2026-11-03
- Governing architecture: [section 6](../architecture/workspace.md#source-layout)

## Context

Flat source roots and multi-concern monoliths obscure ownership. RF4 splits
modules after RF3 established one owner for each shared rule.

## Decision

Group modules by domain, keeping only entry points and package-level tests at
`src/` root. Adopt directories as soon as there is a second concern. Each file
owns one responsibility and is split before 1,000 lines, aiming for a few hundred.
Do not add subdirectory barrels. Entry points re-export concrete files and keep
internal helpers private to the package. Document one-way directory dependencies
at the entry; forbid cycles including type-only imports. Tests and type tests
sit beside modules; shared test helpers live in `src/test-support/`.

Admin keeps its existing layers and slices with the same size and cycle rules.
As amended for RF6A, a private PascalCase sibling component with a colocated
test may omit its component folder when it stays within its owning slice or
unit and is not exported, directly or transitively, from its public index.
Public components retain their folder, test, and index; layer direction and
cross-slice restrictions remain unchanged (architecture §17).
Other flat packages adopt the convention during RF4–RF6 or when adding a second
concern. The boundary checker counts production source physical lines, excluding
tests and test-support. Oversized legacy files have a committed size baseline:
they may shrink but never grow, and missing or within-limit entries fail so a
split must remove its baseline entry in the same change.

## Consequences

RF4A introduces the layout in content without changing its public API. Later
sessions remove their own legacy baseline entries.

Amended by RF4X (2026-11-04): the boundary checker enforces the layout instead
of one-off verification scripts.

- **Cycles.** It builds each member's production module graph from relative
  imports, including type-only imports, and fails on a cycle. Pre-existing
  cycles are frozen in `scripts/source-cycle-baseline.json`, which records one
  entry per strongly connected component; components may shrink but not grow.
- **Layout.** `scripts/source-layout.json` declares, for packages that have
  adopted the layout, the directories each directory may import. For those
  packages the checker rejects edges outside the declaration, subdirectory
  `index` modules, root modules that are not manifest entries, and entry
  headers whose `Directory dependencies:` line names a different directory set.
- **Typecheck exceptions.** Test files that disable type checking are listed in
  the shrinking `scripts/test-typecheck-baseline.json`; test-support modules
  may not disable it.

A package adopts the layout by adding its declaration in its own session.

Amended by RF4J (2026-11-08): two reasoned lists complete the layout rules.

- **Process entries.** `scripts/source-root-entries.json` names root modules
  of declared applications that Node, a container command or a Compose
  service starts directly (`apps/api` `production.ts`, `dispatcher.ts`, …,
  `apps/builder` `main.ts`). Keeping them at the root preserves operator
  commands, the generated project's Compose file and frozen template
  fixtures. Missing, nested or undeclared entries fail.
- **Single-concern exemptions.** `scripts/source-layout-exemptions.json`
  records packages that stay flat by decision (`render`, the section 13.3
  render core). An exempt package that gains a directory other than
  `test-support/`, is also declared, or is not a member fails.
- **JavaScript tests.** Only `*.packaged.test.mjs` files are JavaScript tests
  by convention; any other JavaScript test needs a reasoned entry in
  `scripts/javascript-source-allowlist.json`.

## Alternatives considered

Flat file splits still hide ownership. Subdirectory barrels add indirection.
Warnings do not prevent growth; an immediate unbaselined ceiling would require
unrelated splits. A smaller ceiling would baseline many files with no planned
split session.
