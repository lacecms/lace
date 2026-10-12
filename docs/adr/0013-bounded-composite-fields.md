# ADR 0013: Bounded composite fields

- Status: accepted for CE7A implementation
- Date: 2026-10-12

## Context

Gallery/menu and project-defined structured content need objects and ordered
homogeneous lists. Flat block identity, runtime portability and D1 limits must
remain intact.

## Decision

Use public `field.group({ fields })` and `field.list({ item })` descriptors in
model fields and block data. Store plain JSON in existing columns, without
item IDs/tables. Limit schemas to six containers, two consecutive groups and
no direct list of lists; limit normalized values to 100 items/list and 500
list elements/snapshot (including defaults/hidden blocks). Existing JSON and
200-media-location bounds remain.

Drafts permit missing required descendants and below-minimum lists; publication
enforces them. Optional absent containers remain absent; present empty values
are explicit. Partial defaults are draft starting values. The shared recursive
validator supplies exact typed paths to API and render consumers.

Preserve scalar media paths; nested locations use relative JSON Pointers.
Rebuild the draft reference projection atomically with values/revision; copy it
through existing lifecycle operations. Block migration planning checks totals
against unchanged fields/blocks before guarded per-entry rewrites.

Recursively strip display metadata only at descriptor positions; preserve
content/default keys. Scalar hashes and data encodings stay unchanged. Settings,
listFields and SEO mappings retain scalar allowlists.

CE7A safely introduces composites but refuses populated model composite
rewrites pending CE7B (except optional root additions without defaults).
Admin inspection is read-only until CE7C. Gallery/Navigation and starter
adoption remain CE7D. No database migration is needed.

## Consequences

Typed/metadata consumers must handle two new variants. Older scalar-only
engines cannot consume adopted composites; rollback needs matching backups or
an explicit conversion. Bounded recursion and snapshot budgets protect both
runtimes without nested block trees or interactive D1 transactions.
