## Why

CE7A introduced bounded groups/lists but deliberately refuses most evolution of populated composite model fields. Roadmap session **CE7B — Nested schema evolution and synchronization** makes those fields maintainable without manual JSON/database edits while retaining CE1 data protection and Node/D1 parity.

## What Changes

- Compare canonical model fields recursively, with explicit child additions, removals, renames, defaults and constraint changes. Child display metadata remains projection-only; data keys named `label`/`description` remain structural.
- Extend field-level `renamedFrom` to named children (a former sibling key). Extend model `removedFields` with schema pointers such as `/links/*/legacy`, where `*` addresses every list item. Existing root-key hints remain valid.
- Backfill absent values inside present containers without replacing values, synthesizing absent optional parents or adding/removing/reordering list items. Refuse incompatible types, unhinted loss, rename collisions, failing tightening and unsafe defaults.
- Check complete prospective snapshots, including model transformations, migrated/unchanged/hidden blocks, JSON limits, the 500-element aggregate and 200 media locations. Preserve unrelated published required-field grandfathering and forbid media defaults during synchronization backfill.
- Apply nested model rewrites and reference rebuilding in the guarded final mutation; preserve resumable block migrations, revision/audit rules and one final published-version/build transition. Report schema paths and concrete offending value paths in text/JSON/check mode.
- Replace CE7A's temporary sync restriction in architecture section 8 and ADR 0013 during apply, before production edits. No broader architecture invariant changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-model-configuration`: recursive extraction/validation of sibling rename hints and nested removal schema pointers, excluded from projections/hashes.
- `field-descriptors`: allow nested named-field rename metadata for model normalization while keeping block and item-descriptor hint restrictions.
- `schema-evolution`: replace transitional composite refusal with recursive classification, prospective snapshot validation, default rules and guarded nested rewrites.
- `configuration-synchronization`: deterministic nested reports, scan evidence and atomic reference-safe application across both runtimes.

## Impact

Depends on archived CE7A and accepted CE1 evolution/migration semantics. Governing architecture: §§4.7–4.8, 8 (configuration projection and bounded composites), 9.3/9.7 (snapshots/media references), 10–12 (validation/blocks), 20/22 (parity/upgrades); ADRs 0007 and 0013. Accepted specs above remain authoritative except the explicit transitional requirements replaced by this change.

Code targets: `packages/content` descriptor handling/shared visitors; `packages/config` normalization; `packages/application/src/configuration-{evolution,sync,migration}.ts`; `packages/db/src/sql-content.ts`; Node `content-repository.ts`, Cloudflare `d1-content-repository.ts`, portable memory doubles and shared repository contracts. CLI reporting consumes the application plan. No new tables, SQL schema migration, production dependency or REST endpoint is planned.

Scope is CE7B only. Generic admin authoring (CE7C), Gallery/Navigation/starter adoption (CE7D), cross-parent moves, per-index schema hints, inferred renames, scalar/composite conversion, list-item identities and a new migration lifecycle are non-goals. Existing scalar-only DSL, hashes, hints and reports remain compatible. Nested hint adoption requires the updated engine; older engines continue to reject it.
