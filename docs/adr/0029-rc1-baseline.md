# ADR 0029: rc1 is the oldest supported state

- Status: Amended by [ADR 0030](0030-rc2-oldest-supported.md): rc2 replaces rc1 as
  the oldest supported release; the other decisions stay accepted
- Date: 2026-11-08
- Governing architecture: [section 22](../architecture/distribution.md#22-migration-and-compatibility-policy)

## Context

Lace has one user and no stable release. Before rc1 the engine accumulated
compatibility paths for older data: 16 incremental database migrations with
data steps for old rows, identity migrations of built-in blocks, a legacy
configuration hash, legacy public-identity proofs, build-export format 1 and
upgrade fixtures for alpha templates. None of them is reachable from a
database or project created from rc1 onward, yet each costs tests,
specification text and review.

## Decision

- `0.1.0-rc1` is the oldest supported state.
- The database starts from one baseline migration generated from the declared
  schema; later schema changes are forward migrations after it. A database
  whose migration ledger records a migration that is not checked in was
  created by an older engine: migration, doctor and readiness refuse it, and
  the operator recreates it.
- Built-in blocks declare no migrations; their definition versions stay. The
  block migration mechanism stays for custom blocks and future versions.
- Build-export format 2 is the only format; the export always carries
  `globals` and `seo`.
- Template upgrades are proven from the latest published template only (rc1).

## Consequences

- The rc1 database is recreated once, and content moved by export/import or
  re-entered.
- From the next published release on, compatibility is again kept by forward
  migrations and versioned formats; this decision does not license breaking
  later releases.

## Alternatives considered

- **Keep the 16 migrations.** Rejected by the owner: the history serves no
  installation.
- **Reset block and format versions to 1.** Rejected: stored data, registry
  manifests and site locks would change and need a migration themselves.
