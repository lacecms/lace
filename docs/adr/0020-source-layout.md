# ADR 0020: Domain source layout and shrinking size baseline

- Status: Accepted
- Date: 2026-11-03
- Governing architecture: [section 6](../mvp-architecture.md#source-layout)

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
Other flat packages adopt the convention during RF4–RF6 or when adding a second
concern. The boundary checker counts production source physical lines, excluding
tests and test-support. Oversized legacy files have a committed size baseline:
they may shrink but never grow, and missing or within-limit entries fail so a
split must remove its baseline entry in the same change.

## Consequences

RF4A introduces the layout in content without changing its public API. Later
sessions remove their own legacy baseline entries. No general directory-level
dependency checker is introduced; content's module graph is verified explicitly.

## Alternatives considered

Flat file splits still hide ownership. Subdirectory barrels add indirection.
Warnings do not prevent growth; an immediate unbaselined ceiling would require
unrelated splits. A smaller ceiling would baseline many files with no planned
split session.
