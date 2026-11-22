# ADR 0035 — RC5 is the upgrade origin for Lace 1.0

Accepted 2026-11-22. Supersedes the release support floor in ADR 0030.

The deployed site uses RC5, ownership template 0.50.0. Lace 1.0 supports an
in-place upgrade of its fully migrated and synchronized database on Node and
Cloudflare. RC5 already contains the first two entries in the shared migration
chain and uses gallery version 6. Preserve those SQL files, journal identities
and stored content. A clean installation runs the whole chain. Older release
migration fixtures, conversions and operator recipes are retired.

The release floor identifies an engine and template. The migration ledger
identifies installed schema steps, which releases can share. Unknown entries
remain unsupported. Restore matching engine, files, database and media for
rollback. Stable 1.x releases evolve public contracts under architecture §22
and use forward database migrations. Stable publication uses the same verified
package/image inventory and requires the owner’s real-deployment decision.
