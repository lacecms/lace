# ADR 0030: rc2 is the oldest supported release

- Status: Accepted
- Date: 2026-11-10
- Amends: [ADR 0029](0029-rc1-baseline.md) (support floor only)
- Governing architecture: [section 22](../architecture/distribution.md#22-migration-and-compatibility-policy)

## Context

ADR 0029 made rc1 the oldest supported state while it replaced 16 database
migrations with one baseline. The baseline shipped in rc2, so an rc1 database
predates it and is refused; the documented rc1 path recreates the database.
Keeping rc1 as the support floor keeps rc1 fixtures, upgrade sections and
specification scenarios that serve no installation: the owner's only
installation already runs rc2.

## Decision

- `0.1.0-rc2` (template `0.47.0`) is the oldest supported release and the
  origin of the published-template upgrade fixtures.
- Later releases keep compatibility with rc2: forward database migrations
  after the baseline, block definition versions with migrations from the
  rc2 definitions, and versioned formats.
- rc1 and earlier installations are unsupported. Their pre-baseline databases
  stay refused, and no upgrade steps are documented for them.
- ADR 0029 remains in force for the baseline migration, built-in blocks
  without historical migrations and build-export format 2.

## Consequences

- An rc1 installation that must be kept is recreated from an rc2-or-later
  project, with content moved by export/import or re-entered.
- Upgrade instructions, guides and the compatibility guide describe the
  rc2 → current upgrade, which needs no database recreation.
- Like ADR 0029, this decision does not license breaking rc2 installations
  in later releases.

## Alternatives considered

- **Keep rc1 as the floor until a stable release.** Rejected by the owner: it
  costs fixtures and documentation for a path nobody uses.
- **Make the next, unpublished release the floor and skip rc2 migrations.**
  Rejected by the owner: rc2 is published and in use, so later changes migrate
  its data.
